// Data store: Neon Postgres (production) or local JSON files (dev fallback).
// server.js calls getShops()/saveShops() etc. synchronously. Reads come from an
// in-memory cache; every save is written through to Postgres in the background.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SEED_DIR = path.join(__dirname, 'seed');
const FILES = {
  shops: path.join(DATA_DIR, 'shops.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  orders: path.join(DATA_DIR, 'orders.json')
};

let pool = null;
let defaultSettings = {};
const cache = { shops: [], settings: null, orders: [] };
const snapshots = { shops: new Map(), orders: new Map() }; // key -> JSON string last written
const TABLES = { shops: 'shops', orders: 'orders' };

function readJson(file, fallback) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { console.error('Read error', file, e.message); }
  return fallback;
}
function writeLocal(name) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILES[name], JSON.stringify(cache[name], null, 2));
  } catch (e) { console.error('Local write error', name, e.message); }
}

function initPool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { Pool } = require('pg');
  const p = new Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000 // Neon cold start after idle
  });
  p.on('error', e => console.error('PG idle client error (ignored):', e.message));
  return p;
}

async function ensureSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS shops  (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, data JSONB NOT NULL)`);
}

async function loadTable(name) {
  const r = await pool.query(`SELECT id, data FROM ${TABLES[name]}`);
  const arr = [];
  for (const row of r.rows) { arr.push(row.data); snapshots[name].set(row.id, JSON.stringify(row.data)); }
  return arr;
}

// Write only changed/removed rows of an array-backed table.
async function syncTable(name, arr, keyField) {
  const next = new Map(arr.map(x => [String(x[keyField]), x]));
  const upserts = [];
  const deletes = [];
  for (const [id, obj] of next) {
    const json = JSON.stringify(obj);
    if (snapshots[name].get(id) !== json) upserts.push([id, json]);
  }
  for (const id of snapshots[name].keys()) if (!next.has(id)) deletes.push(id);
  if (!upserts.length && !deletes.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [id, json] of upserts) {
      await client.query(
        `INSERT INTO ${TABLES[name]} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`, [id, json]);
    }
    for (const id of deletes) await client.query(`DELETE FROM ${TABLES[name]} WHERE id = $1`, [id]);
    await client.query('COMMIT');
    for (const [id, json] of upserts) snapshots[name].set(id, json);
    for (const id of deletes) snapshots[name].delete(id);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw e;
  } finally { client.release(); }
}

async function saveConfig(key, obj) {
  await pool.query(
    `INSERT INTO config (key, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, [key, JSON.stringify(obj)]);
}

// Serialise background writes (one retry, e.g. after Neon cold start)
let queue = Promise.resolve();
function enqueue(fn) {
  queue = queue.then(async () => {
    try { await fn(); }
    catch (e1) {
      console.error('DB write failed, retrying:', e1.message);
      await new Promise(r => setTimeout(r, 1500));
      try { await fn(); } catch (e2) { console.error('DB write failed again:', e2.message); }
    }
  });
}

async function init(defaults) {
  defaultSettings = defaults;
  pool = initPool();
  if (pool) {
    await ensureSchema();
    console.log('🐘 Neon Postgres connected');
    cache.shops = await loadTable('shops');
    cache.orders = await loadTable('orders');
    const s = await pool.query(`SELECT data FROM config WHERE key = 'settings'`);
    cache.settings = s.rows[0] ? s.rows[0].data : null;
    // First run: import seed data
    if (!cache.shops.length) {
      cache.shops = readJson(path.join(SEED_DIR, 'shops.json'), []);
      await syncTable('shops', cache.shops, 'shopId');
      console.log(`🌱 Seeded ${cache.shops.length} shop(s) into database`);
    }
    if (!cache.settings) {
      cache.settings = readJson(path.join(SEED_DIR, 'settings.json'), defaultSettings);
      await saveConfig('settings', cache.settings);
    }
  } else {
    console.log('💾 DATABASE_URL not set - using local JSON files in /data (dev mode)');
    cache.shops = readJson(FILES.shops, null) || readJson(path.join(SEED_DIR, 'shops.json'), []);
    cache.settings = readJson(FILES.settings, null) || readJson(path.join(SEED_DIR, 'settings.json'), defaultSettings);
    cache.orders = readJson(FILES.orders, []);
  }
}

module.exports = {
  init,
  getShops: () => cache.shops,
  saveShops: (shops) => {
    cache.shops = shops;
    if (pool) enqueue(() => syncTable('shops', cache.shops, 'shopId')); else writeLocal('shops');
  },
  getSettings: () => cache.settings || defaultSettings,
  saveSettings: (settings) => {
    cache.settings = settings;
    if (pool) enqueue(() => saveConfig('settings', cache.settings)); else writeLocal('settings');
  },
  getOrders: () => cache.orders,
  saveOrders: (orders) => {
    cache.orders = orders;
    if (pool) enqueue(() => syncTable('orders', cache.orders, 'id')); else writeLocal('orders');
  }
};
