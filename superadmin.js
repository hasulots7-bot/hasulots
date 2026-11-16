// Website-owner (super admin) API: create/manage shops + license renewal
const crypto = require('crypto');
const express = require('express');
const A = require('./auth');

const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 hours

// Owner credentials come from environment variables (Render > Environment)
let OWNER_USER = (process.env.SUPERADMIN_USER || '').trim();
let OWNER_PASS = process.env.SUPERADMIN_PASS || '';
if (!OWNER_USER || !OWNER_PASS) {
  OWNER_USER = OWNER_USER || 'owner';
  OWNER_PASS = OWNER_PASS || crypto.randomBytes(6).toString('hex');
  console.warn('==================================================================');
  console.warn('⚠️  SUPERADMIN_USER / SUPERADMIN_PASS not set in environment.');
  console.warn(`    Temporary owner login for THIS run ->  user: ${OWNER_USER}   password: ${OWNER_PASS}`);
  console.warn('    Set them in Render > Environment to make them permanent.');
  console.warn('==================================================================');
}

function requireOwner(req, res, next) {
  const t = A.verifyToken(A.bearer(req));
  if (!t || t.r !== 'super') return res.status(401).json({ error: 'Owner login required' });
  next();
}

function publicShop(s) {
  const info = A.licenseInfo(s);
  const lic = s.license || {};
  return {
    shopId: s.shopId,
    shopName: s.shopName,
    username: s.username,
    ownerName: s.ownerName || '',
    email: s.email || '',
    phone: s.phone || '',
    address: s.address || '',
    upiId: s.upiId || '',
    pricing: s.pricing || {},
    createdAt: s.createdAt,
    plan: lic.plan || null,
    planLabel: lic.plan && A.PLANS[lic.plan] ? A.PLANS[lic.plan].label : '-',
    expiresAt: lic.expiresAt || null,
    licenseStatus: lic.status || 'active',
    state: info.state,
    daysLeft: info.daysLeft,
    renewals: (s.renewals || []).slice(-50).reverse()
  };
}

function mount(app, { getShops, saveShops, getSettings, saveSettings, broadcast }) {
  const r = express.Router();

  // Keep the live kiosk settings in sync when the owner edits the active shop
  function syncActive(shop) {
    const cur = getSettings();
    if (cur.shopId !== shop.shopId) return;
    const updated = {
      ...cur,
      shopName: shop.shopName,
      shopPhone: shop.phone || cur.shopPhone,
      shopAddress: shop.address || '',
      upiId: shop.upiId || cur.upiId,
      upiName: shop.shopName,
      pricing: { ...cur.pricing, ...(shop.pricing || {}) }
    };
    saveSettings(updated);
    broadcast({ type: 'SETTINGS_UPDATED', settings: updated });
  }

  function findShop(id) {
    const shops = getShops();
    const shop = shops.find(s => s.shopId === id);
    return { shops, shop };
  }

  function validUsername(u) { return /^[a-zA-Z0-9_.-]{3,30}$/.test(u); }

  // ---- Login ----
  r.post('/login', (req, res) => {
    if (A.isLocked(req)) return res.status(429).json({ error: 'Too many attempts. Try again after 15 minutes.' });
    const { username = '', password = '' } = req.body || {};
    const ok = A.safeEqual(String(username).trim().toLowerCase(), OWNER_USER.toLowerCase()) &&
               A.safeEqual(String(password), OWNER_PASS);
    if (!ok) { A.recordFail(req); return res.status(401).json({ error: 'Invalid owner username or password' }); }
    A.clearFails(req);
    res.json({ success: true, token: A.signToken({ r: 'super' }, TOKEN_TTL) });
  });

  // ---- Everything below needs the owner token ----
  r.use(requireOwner);

  r.get('/shops', (req, res) => {
    const shops = getShops().map(publicShop);
    const summary = { total: shops.length, pending: 0, active: 0, expiring: 0, expired: 0, suspended: 0, rejected: 0, revenue: 0 };
    shops.forEach(s => { summary[s.state] = (summary[s.state] || 0) + 1; });
    getShops().forEach(s => (s.renewals || []).forEach(x => { summary.revenue += Number(x.amount) || 0; }));
    res.json({ shops, summary, plans: A.PLANS, activeShopId: getSettings().shopId });
  });

  r.post('/shops', (req, res) => {
    const b = req.body || {};
    const shopName = String(b.shopName || '').trim();
    const username = String(b.username || '').trim();
    const password = String(b.password || '');
    const plan = b.plan || 'demo';
    if (!shopName) return res.status(400).json({ error: 'Shop name is required' });
    if (!validUsername(username)) return res.status(400).json({ error: 'Username: 3-30 letters/numbers (a-z 0-9 _ . -)' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!A.PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const shops = getShops();
    if (shops.some(s => (s.username || '').toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const namePart = shopName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
    let shopId;
    do { shopId = `QP_${namePart}_${Math.floor(100 + Math.random() * 900)}`; }
    while (shops.some(s => s.shopId === shopId));

    const now = new Date().toISOString();
    const license = A.applyRenewal({}, plan, b.days);
    const amount = Number(b.amount) || 0;
    const shop = {
      shopId, shopName, username,
      passwordHash: A.hashPassword(password),
      phone: String(b.phone || '').trim(),
      address: String(b.address || '').trim(),
      upiId: String(b.upiId || '').trim() || `${namePart.toLowerCase()}@upi`,
      upiName: shopName,
      pricing: {
        bwPerA4Page: parseFloat(b.bwRate) || 3,
        colorPerA4Page: parseFloat(b.colorRate) || 10,
        duplexDiscountPercent: 15, legalSurcharge: 2, a3Multiplier: 2.5
      },
      license,
      renewals: [{ date: now, plan, days: A.PLANS[plan].days, amount, note: 'Shop created', expiresAt: license.expiresAt }],
      createdAt: now
    };
    shops.push(shop);
    saveShops(shops);
    console.log(`🏪 Owner created shop ${shopName} (${shopId}) plan=${plan}`);
    res.json({ success: true, shop: publicShop(shop) });
  });

  r.put('/shops/:id', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const b = req.body || {};
    if (b.shopName !== undefined) {
      const n = String(b.shopName).trim();
      if (!n) return res.status(400).json({ error: 'Shop name cannot be empty' });
      shop.shopName = n; shop.upiName = n;
    }
    if (b.username !== undefined) {
      const u = String(b.username).trim();
      if (!validUsername(u)) return res.status(400).json({ error: 'Username: 3-30 letters/numbers (a-z 0-9 _ . -)' });
      if (shops.some(s => s !== shop && (s.username || '').toLowerCase() === u.toLowerCase())) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      shop.username = u;
    }
    if (b.phone !== undefined) shop.phone = String(b.phone).trim();
    if (b.address !== undefined) shop.address = String(b.address).trim();
    if (b.upiId !== undefined) shop.upiId = String(b.upiId).trim();
    shop.pricing = shop.pricing || {};
    if (b.bwRate !== undefined) shop.pricing.bwPerA4Page = parseFloat(b.bwRate) || shop.pricing.bwPerA4Page || 3;
    if (b.colorRate !== undefined) shop.pricing.colorPerA4Page = parseFloat(b.colorRate) || shop.pricing.colorPerA4Page || 10;
    saveShops(shops);
    syncActive(shop);
    res.json({ success: true, shop: publicShop(shop) });
  });

  r.post('/shops/:id/password', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const password = String((req.body || {}).password || '');
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    shop.passwordHash = A.hashPassword(password);
    delete shop.password;
    saveShops(shops);
    res.json({ success: true });
  });

  r.post('/shops/:id/renew', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const b = req.body || {};
    const plan = b.plan;
    if (!A.PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    if (['pending', 'rejected'].includes((shop.license || {}).status)) return res.status(400).json({ error: 'Approve this shop first' });
    try {
      shop.license = A.applyRenewal(shop, plan, b.days);
    } catch (e) { return res.status(400).json({ error: e.message }); }
    shop.renewals = shop.renewals || [];
    shop.renewals.push({
      date: new Date().toISOString(),
      plan,
      days: Number(b.days) > 0 ? Number(b.days) : A.PLANS[plan].days,
      amount: Number(b.amount) || 0,
      note: String(b.note || '').trim().slice(0, 200),
      expiresAt: shop.license.expiresAt
    });
    if (shop.renewals.length > 200) shop.renewals = shop.renewals.slice(-200);
    saveShops(shops);
    console.log(`🔁 Renewed ${shop.shopName}: ${plan} -> ${shop.license.expiresAt || 'lifetime'}`);
    res.json({ success: true, shop: publicShop(shop) });
  });

  // ---- Approve / reject new shop requests ----
  r.post('/shops/:id/approve', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const b = req.body || {};
    const plan = b.plan || 'demo';
    if (!A.PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    const st = (shop.license || {}).status;
    if (st !== 'pending' && st !== 'rejected') return res.status(400).json({ error: 'This shop is already approved' });
    shop.license = A.applyRenewal({}, plan, b.days);
    shop.approvedAt = new Date().toISOString();
    shop.renewals = shop.renewals || [];
    shop.renewals.push({
      date: shop.approvedAt, plan,
      days: Number(b.days) > 0 ? Number(b.days) : A.PLANS[plan].days,
      amount: Number(b.amount) || 0,
      note: ('Approved. ' + String(b.note || '').trim()).trim().slice(0, 200),
      expiresAt: shop.license.expiresAt
    });
    saveShops(shops);
    console.log(`✅ Approved ${shop.shopName} (${shop.shopId}) plan=${plan}`);
    res.json({ success: true, shop: publicShop(shop) });
  });

  r.post('/shops/:id/reject', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    if ((shop.license || {}).status !== 'pending') return res.status(400).json({ error: 'Only pending requests can be rejected' });
    shop.license = { ...(shop.license || {}), status: 'rejected' };
    saveShops(shops);
    res.json({ success: true, shop: publicShop(shop) });
  });

  r.post('/shops/:id/status', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const status = (req.body || {}).status;
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    if (['pending', 'rejected'].includes((shop.license || {}).status)) return res.status(400).json({ error: 'Use Approve for new requests' });
    shop.license = { ...(shop.license || {}), status };
    saveShops(shops);
    res.json({ success: true, shop: publicShop(shop) });
  });

  r.delete('/shops/:id', (req, res) => {
    const shops = getShops();
    const next = shops.filter(s => s.shopId !== req.params.id);
    if (next.length === shops.length) return res.status(404).json({ error: 'Shop not found' });
    saveShops(next);
    res.json({ success: true });
  });

  app.use('/api/super', r);
}

module.exports = { mount };
