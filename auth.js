// Shared auth + license helpers (no extra dependencies)
const crypto = require('crypto');

// ---------- Secrets ----------
const SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.AUTH_SECRET) {
  console.warn('⚠️  AUTH_SECRET not set - logins will reset every restart. Set it in Render > Environment.');
}

// ---------- Password hashing (scrypt) ----------
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const expected = Buffer.from(parts[2], 'hex');
    const actual = crypto.scryptSync(String(plain), parts[1], 32);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (e) { return false; }
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- Signed tokens ----------
function b64u(buf) { return Buffer.from(buf).toString('base64url'); }

function signToken(payload, ttlMs) {
  const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) { return null; }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// ---------- Login rate limit (per IP) ----------
const attempts = new Map(); // ip -> { n, first }
const WINDOW = 15 * 60 * 1000;
const MAX_FAILS = 8;

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
}
function isLocked(req) {
  const a = attempts.get(clientIp(req));
  if (!a) return false;
  if (Date.now() - a.first > WINDOW) { attempts.delete(clientIp(req)); return false; }
  return a.n >= MAX_FAILS;
}
function recordFail(req) {
  const ip = clientIp(req);
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > WINDOW) attempts.set(ip, { n: 1, first: Date.now() });
  else a.n++;
}
function clearFails(req) { attempts.delete(clientIp(req)); }

// ---------- Licensing ----------
const DAY = 24 * 60 * 60 * 1000;
const PLANS = {
  demo:     { label: 'Demo (1 week)',   days: 7 },
  monthly:  { label: 'Monthly',         days: 30 },
  yearly:   { label: 'Yearly',          days: 365 },
  lifetime: { label: 'Lifetime',        days: null }
};

// Returns { state: active|expiring|expired|suspended, daysLeft, allowed }
function licenseInfo(shop) {
  const l = (shop && shop.license) || {};
  if (l.status === 'pending') return { state: 'pending', daysLeft: null, allowed: false };
  if (l.status === 'rejected') return { state: 'rejected', daysLeft: null, allowed: false };
  if (l.status === 'suspended') return { state: 'suspended', daysLeft: null, allowed: false };
  if (l.plan === 'lifetime') return { state: 'active', daysLeft: null, allowed: true, lifetime: true };
  const exp = l.expiresAt ? Date.parse(l.expiresAt) : 0;
  const now = Date.now();
  if (!exp || exp < now) return { state: 'expired', daysLeft: exp ? -Math.ceil((now - exp) / DAY) : null, allowed: false };
  const daysLeft = Math.ceil((exp - now) / DAY);
  const warnDays = l.plan === 'demo' ? 2 : 7; // a fresh 7-day demo should not look like it is expiring
  return { state: daysLeft <= warnDays ? 'expiring' : 'active', daysLeft, allowed: true };
}

function licenseMessage(info) {
  if (info.state === 'pending') return 'Your account is waiting for approval from the QuickPrint owner. You will get a WhatsApp message once it is approved.';
  if (info.state === 'rejected') return 'Your request was not approved. Please contact the QuickPrint owner.';
  if (info.state === 'suspended') return 'This shop account is suspended. Please contact the QuickPrint owner.';
  if (info.state === 'expired') return 'License expired. Please renew your plan - contact the QuickPrint owner.';
  return '';
}

// Extend (or start) a license. Returns the new license object.
function applyRenewal(shop, plan, customDays) {
  const p = PLANS[plan];
  if (!p) throw new Error('Invalid plan');
  const old = shop.license || {};
  const now = Date.now();
  let expiresAt = null;
  if (plan !== 'lifetime') {
    const days = Number(customDays) > 0 ? Number(customDays) : p.days;
    const currentExp = old.expiresAt ? Date.parse(old.expiresAt) : 0;
    const base = (old.plan !== 'lifetime' && currentExp > now) ? currentExp : now;
    expiresAt = new Date(base + days * DAY).toISOString();
  }
  return {
    plan,
    status: 'active',
    startedAt: old.startedAt || new Date(now).toISOString(),
    expiresAt
  };
}

module.exports = {
  hashPassword, verifyPassword, safeEqual,
  signToken, verifyToken, bearer,
  isLocked, recordFail, clearFails,
  PLANS, licenseInfo, licenseMessage, applyRenewal, DAY
};
