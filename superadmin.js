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
    renewals: (s.renewals || []).map((x, i) => ({ ...x, idx: i })).slice(-50).reverse()
  };
}

function mount(app, { getShops, saveShops, getSettings, saveSettings, broadcast, getOwnerConfig, saveOwnerConfig }) {
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

  // ---- Owner config (plan prices, demo days, payment details, owner login override) ----
  const PLAN_DEFAULTS = JSON.parse(JSON.stringify(A.PLANS));
  function cfg() { return getOwnerConfig() || {}; }
  function applyPlanConfig() {
    const over = cfg().plans || {};
    Object.keys(PLAN_DEFAULTS).forEach(k => {
      const o = over[k] || {};
      const d = PLAN_DEFAULTS[k];
      A.PLANS[k].price = Number.isFinite(Number(o.price)) && o.price !== '' && o.price !== undefined ? Number(o.price) : d.price;
      if (k !== 'lifetime') {
        const days = Math.floor(Number(o.days));
        A.PLANS[k].days = days > 0 ? days : d.days;
      }
    });
    A.PLANS.demo.label = `Demo (${A.PLANS.demo.days} day${A.PLANS.demo.days === 1 ? '' : 's'})`;
  }
  function ownerPublic() {
    const c = cfg();
    return {
      businessName: c.businessName || 'Hasulots Technologies',
      whatsapp: c.whatsapp || '',
      upiId: c.upiId || '',
      upiName: c.upiName || c.businessName || 'Hasulots Technologies',
      bankDetails: c.bankDetails || '',
      loginUser: (c.auth && c.auth.username) || OWNER_USER,
      customLogin: !!c.auth
    };
  }
  const PAY_METHODS = ['UPI', 'Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other'];
  function cleanPayment(b) {
    const method = PAY_METHODS.includes(b.payMethod) ? b.payMethod : 'UPI';
    const status = b.payStatus === 'pending' ? 'pending' : 'paid';
    return { method, status, ref: String(b.payRef || '').trim().slice(0, 80) };
  }

  // Auto username: shop name -> "suprajaatex482" style, always unique
  function genUsername(shopName, shops) {
    const base = String(shopName || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'shop';
    for (let i = 0; i < 60; i++) {
      const cand = `${base}${Math.floor(100 + Math.random() * 900)}`;
      if (!shops.some(s => (s.username || '').toLowerCase() === cand)) return cand;
    }
    return `${base}${Date.now().toString().slice(-6)}`;
  }

  // ---- Login ----
  r.post('/login', (req, res) => {
    if (A.isLocked(req)) return res.status(429).json({ error: 'Too many attempts. Try again after 15 minutes.' });
    const { username = '', password = '' } = req.body || {};
    const c = cfg();
    const uOk = A.safeEqual(String(username).trim().toLowerCase(), ((c.auth && c.auth.username) || OWNER_USER).toLowerCase());
    const pOk = c.auth ? A.verifyPassword(String(password), c.auth.passwordHash) : A.safeEqual(String(password), OWNER_PASS);
    const ok = uOk && pOk;
    if (!ok) { A.recordFail(req); return res.status(401).json({ error: 'Invalid owner username or password' }); }
    A.clearFails(req);
    res.json({ success: true, token: A.signToken({ r: 'super' }, TOKEN_TTL) });
  });

  // ---- Everything below needs the owner token ----
  r.use(requireOwner);
  r.use((req, res, next) => { applyPlanConfig(); next(); });

  r.get('/username-suggest', (req, res) => {
    res.json({ username: genUsername(req.query.name, getShops()) });
  });

  r.get('/settings', (req, res) => res.json({ owner: ownerPublic(), plans: A.PLANS, payMethods: PAY_METHODS }));

  r.put('/settings', (req, res) => {
    const b = req.body || {};
    const c = { ...cfg() };
    if (b.businessName !== undefined) c.businessName = String(b.businessName).trim().slice(0, 80);
    if (b.whatsapp !== undefined) c.whatsapp = String(b.whatsapp).replace(/\D/g, '').slice(-10);
    if (b.upiId !== undefined) {
      const u = String(b.upiId).trim();
      if (u && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(u)) return res.status(400).json({ error: 'Enter a valid UPI ID (example: name@okhdfcbank)' });
      c.upiId = u;
    }
    if (b.upiName !== undefined) c.upiName = String(b.upiName).trim().slice(0, 60);
    if (b.bankDetails !== undefined) c.bankDetails = String(b.bankDetails).trim().slice(0, 300);
    if (b.plans && typeof b.plans === 'object') {
      c.plans = c.plans || {};
      for (const k of Object.keys(PLAN_DEFAULTS)) {
        const v = b.plans[k]; if (!v) continue;
        c.plans[k] = c.plans[k] || {};
        if (v.price !== undefined) {
          const pr = Number(v.price);
          if (!(pr >= 0)) return res.status(400).json({ error: `Invalid price for ${k}` });
          c.plans[k].price = pr;
        }
        if (v.days !== undefined && k !== 'lifetime') {
          const d = Math.floor(Number(v.days));
          if (!(d > 0 && d <= 3650)) return res.status(400).json({ error: `Days for ${k} must be 1 - 3650` });
          c.plans[k].days = d;
        }
      }
    }
    saveOwnerConfig(c);
    applyPlanConfig();
    res.json({ success: true, owner: ownerPublic(), plans: A.PLANS });
  });

  // Change owner login (needs current password)
  r.post('/settings/login', (req, res) => {
    const b = req.body || {};
    const c = cfg();
    const curOk = c.auth ? A.verifyPassword(String(b.currentPassword || ''), c.auth.passwordHash) : A.safeEqual(String(b.currentPassword || ''), OWNER_PASS);
    if (!curOk) return res.status(401).json({ error: 'Current password is wrong' });
    const username = String(b.username || '').trim();
    const password = String(b.newPassword || '');
    if (!validUsername(username)) return res.status(400).json({ error: 'Username: 3-30 letters/numbers (a-z 0-9 _ . -)' });
    if (password && password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const prev = c.auth || { passwordHash: A.hashPassword(OWNER_PASS) };
    saveOwnerConfig({ ...c, auth: { username, passwordHash: password ? A.hashPassword(password) : prev.passwordHash } });
    res.json({ success: true, owner: ownerPublic() });
  });

  r.get('/shops', (req, res) => {
    const shops = getShops().map(publicShop);
    const summary = { total: shops.length, pending: 0, active: 0, expiring: 0, expired: 0, suspended: 0, rejected: 0, revenue: 0 };
    shops.forEach(s => { summary[s.state] = (summary[s.state] || 0) + 1; });
    summary.dues = 0;
    summary.monthRevenue = 0;
    const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
    getShops().forEach(s => (s.renewals || []).forEach(x => {
      const amt = Number(x.amount) || 0;
      if (x.payStatus === 'pending') { summary.dues += amt; return; }
      summary.revenue += amt;
      if (new Date(x.date) >= m0) summary.monthRevenue += amt;
    }));
    res.json({ shops, summary, plans: A.PLANS, payMethods: PAY_METHODS, owner: ownerPublic(), activeShopId: getSettings().shopId });
  });

  r.post('/shops', (req, res) => {
    const b = req.body || {};
    const shopName = String(b.shopName || '').trim();
    let username = String(b.username || '').trim();
    const password = String(b.password || '');
    const plan = b.plan || 'demo';
    if (!shopName) return res.status(400).json({ error: 'Shop name is required' });
    if (!username) username = genUsername(shopName, getShops());
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
    const pay = cleanPayment(b);
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
      renewals: [{ date: now, plan, days: A.PLANS[plan].days, amount, payMethod: pay.method, payStatus: pay.status, payRef: pay.ref, note: 'Shop created', expiresAt: license.expiresAt }],
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
    if (b.ownerName !== undefined) shop.ownerName = String(b.ownerName).trim().slice(0, 80);
    if (b.email !== undefined) shop.email = String(b.email).trim().slice(0, 120);
    if (b.phone !== undefined) shop.phone = String(b.phone).trim();
    if (b.address !== undefined) shop.address = String(b.address).trim();
    if (b.upiId !== undefined) shop.upiId = String(b.upiId).trim();
    shop.pricing = shop.pricing || {};
    if (b.bwRate !== undefined) shop.pricing.bwPerA4Page = parseFloat(b.bwRate) || shop.pricing.bwPerA4Page || 3;
    if (b.colorRate !== undefined) shop.pricing.colorPerA4Page = parseFloat(b.colorRate) || shop.pricing.colorPerA4Page || 10;
    if (b.duplexDiscount !== undefined) { const d = parseFloat(b.duplexDiscount); if (d >= 0 && d <= 100) shop.pricing.duplexDiscountPercent = d; }
    if (b.legalSurcharge !== undefined) { const d = parseFloat(b.legalSurcharge); if (d >= 0) shop.pricing.legalSurcharge = d; }
    if (b.a3Multiplier !== undefined) { const d = parseFloat(b.a3Multiplier); if (d > 0) shop.pricing.a3Multiplier = d; }
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
      ...(() => { const p = cleanPayment(b); return { payMethod: p.method, payStatus: p.status, payRef: p.ref }; })(),
      note: String(b.note || '').trim().slice(0, 200),
      expiresAt: shop.license.expiresAt
    });
    if (shop.renewals.length > 200) shop.renewals = shop.renewals.slice(-200);
    saveShops(shops);
    console.log(`🔁 Renewed ${shop.shopName}: ${plan} -> ${shop.license.expiresAt || 'lifetime'}`);
    res.json({ success: true, shop: publicShop(shop) });
  });

  // Extend the current licence by N days without changing the plan (e.g. give a demo shop 3 more days)
  r.post('/shops/:id/extend', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const lic = shop.license || {};
    if (['pending', 'rejected'].includes(lic.status)) return res.status(400).json({ error: 'Approve this shop first' });
    if (lic.plan === 'lifetime') return res.status(400).json({ error: 'Lifetime licence never expires' });
    const days = Math.floor(Number((req.body || {}).days));
    if (!(days > 0 && days <= 365)) return res.status(400).json({ error: 'Enter days between 1 and 365' });
    const cur = lic.expiresAt ? Date.parse(lic.expiresAt) : 0;
    const base = cur > Date.now() ? cur : Date.now();
    lic.expiresAt = new Date(base + days * A.DAY).toISOString();
    lic.status = lic.status === 'suspended' ? 'suspended' : 'active';
    shop.license = lic;
    shop.renewals = shop.renewals || [];
    shop.renewals.push({ date: new Date().toISOString(), plan: lic.plan, days, amount: 0, payMethod: 'Other', payStatus: 'paid', payRef: '',
      note: ('Extended +' + days + ' days. ' + String((req.body || {}).note || '').trim()).trim().slice(0, 200), expiresAt: lic.expiresAt });
    saveShops(shops);
    res.json({ success: true, shop: publicShop(shop) });
  });

  // Mark an earlier pending payment as received
  r.post('/shops/:id/payments/:idx/paid', (req, res) => {
    const { shops, shop } = findShop(req.params.id);
    if (!shop) return res.status(404).json({ error: 'Shop not found' });
    const list = shop.renewals || [];
    const i = Number(req.params.idx);
    if (!list[i]) return res.status(404).json({ error: 'Entry not found' });
    list[i].payStatus = 'paid';
    const b = req.body || {};
    if (b.payMethod && PAY_METHODS.includes(b.payMethod)) list[i].payMethod = b.payMethod;
    if (b.payRef) list[i].payRef = String(b.payRef).trim().slice(0, 80);
    saveShops(shops);
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
      ...(() => { const p = cleanPayment(b); return { payMethod: p.method, payStatus: p.status, payRef: p.ref }; })(),
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
