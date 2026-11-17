const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const QRCode = require('qrcode');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const { getShops, saveShops, getSettings, saveSettings, getOrders, saveOrders } = store;
const { spawn, exec } = require('child_process');
const A = require('./auth');
const superadmin = require('./superadmin');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 4000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');





// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Default Settings
const defaultSettings = {
  shopName: "QuickPrint Smart Kiosk",
  shopTagline: "Self-Service Mobile QR Printing",
  shopPhone: "+91 98765 43210",
  shopAddress: "Main Road, Near Bus Stand",
  upiId: "shopname@okhdfcbank", // Shopkeeper can change this in /admin
  upiName: "QuickPrint Store",
  pricing: {
    bwPerA4Page: 3,         // ₹3 per B&W page
    colorPerA4Page: 10,     // ₹10 per Color page
    duplexDiscountPercent: 15, // 15% off for back-to-back
    legalSurcharge: 2,      // extra ₹2 for Legal
    a3Multiplier: 2.5       // 2.5x for A3 size
  },
  adminPin: "1234",
  autoPrintEnabled: false
};

// Load or initialize settings




// Load or initialize orders




// Helper: Get Local Network IP for Phone Scanning
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// WebSocket broadcast helper
// Never leak login fields to browsers / websocket clients
function publicSettings(st) {
  const { adminPassword, adminPin, adminUsername, ...rest } = st || {};
  return rest;
}

// Live messages are delivered per shop: a shop's dashboard (token) only receives its own
// orders. Customers who scanned that shop's QR only receive its public settings.
// A call without shopId (tunnel URL change) goes to everyone and carries no order data.
function broadcast(message, shopId) {
  if (message && message.settings) message = { ...message, settings: publicSettings(message.settings) };
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState !== WebSocket.OPEN) return;
    if (!shopId) { client.send(payload); return; }
    if (client.shopId === shopId) client.send(payload);
    else if (client.viewShop === shopId && message.type === 'SETTINGS_UPDATED') client.send(payload);
  });
}

// ---- Multi-shop helpers ----
// Everything a customer sees (name, UPI, prices, open/closed) comes from THEIR shop record.
function shopSettingsFor(shop) {
  const g = publicSettings(getSettings());
  delete g.shopId; delete g.publicUrl;
  const info = A.licenseInfo(shop);
  return {
    ...g,
    shopName: shop.shopName,
    shopPhone: shop.phone || '',
    shopAddress: shop.address || '',
    upiId: shop.upiId || '',
    upiName: shop.shopName,
    pricing: { ...(g.pricing || {}), ...(shop.pricing || {}) },
    autoPrintEnabled: true,
    ...(shop.settings || {}),
    shopId: shop.shopId,
    license: {
      state: info.state,
      daysLeft: info.daysLeft,
      plan: (shop.license && shop.license.plan) || 'demo',
      expiresAt: (shop.license && shop.license.expiresAt) || null,
      allowed: info.allowed,
      lifetime: !!info.lifetime
    }
  };
}
function shopFromToken(req) {
  const t = A.verifyToken(A.bearer(req));
  if (!t || t.r !== 'shop') return null;
  return getShops().find(x => x.shopId === t.id) || null;
}
function shopFromParam(req) {
  const id = String((req.query && (req.query.shop || req.query.shopId || req.query.username)) || (req.body && (req.body.shopId || req.body.username)) || '').trim().toLowerCase();
  return id ? (getShops().find(x => x.shopId.toLowerCase() === id || (x.username || '').toLowerCase() === id) || null) : null;
}
function shopBlockMessage(shop) {
  const info = A.licenseInfo(shop);
  return info.allowed ? null : A.licenseMessage(info);
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `doc-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Please upload PDF or Images.`));
    }
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Always revalidate the service worker and HTML so new builds are picked up.
    if (filePath.endsWith('sw.js') || filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.use('/uploads', express.static(UPLOADS_DIR));

// Home page route (explicit, so '/' always works)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Info pages (clean URLs)
const INFO_PAGES = { '/download': 'download.html', '/features': 'features.html', '/setup-guide': 'setup-guide.html', '/about': 'about.html', '/contact': 'contact.html' };
app.get(Object.keys(INFO_PAGES), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', INFO_PAGES[req.path]));
});

// Windows app installer lives on GitHub Releases. Set DESKTOP_DOWNLOAD_URL in Render > Environment.
// Download link is given ONLY to a registered + approved shop (username/password check).
function desktopUrl() { const u = (process.env.DESKTOP_DOWNLOAD_URL || '').trim(); return /^https:\/\//.test(u) ? u : ''; }
app.get('/download/windows', (req, res) => res.redirect(302, '/download')); // no direct public download
app.post('/api/desktop/link', (req, res) => {
  if (A.isLocked(req)) return res.status(429).json({ error: 'Too many attempts. Try again after 15 minutes.' });
  const { username = '', password = '' } = req.body || {};
  const shop = getShops().find(s => (s.username || '').toLowerCase() === String(username).trim().toLowerCase());
  if (!shop || !A.verifyPassword(String(password), shop.passwordHash)) {
    A.recordFail(req);
    return res.status(401).json({ error: 'Invalid Username or Password. Please register for the demo first.' });
  }
  A.clearFails(req);
  const info = A.licenseInfo(shop);
  if (!info.allowed) return res.status(403).json({ error: A.licenseMessage(info) });
  const url = desktopUrl();
  if (!url) return res.status(404).json({ error: 'The Windows app is being prepared. Please contact us on WhatsApp.' });
  res.json({ success: true, url });
});
app.get('/api/desktop', (req, res) => res.json({ available: /^https:\/\//.test((process.env.DESKTOP_DOWNLOAD_URL || '').trim()) }));

// Startup check: warn loudly if the public folder is missing
if (!fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  console.error('❌ public/index.html NOT FOUND - upload the full public folder to the repo!');
}

// ---------- Website-owner (super admin) ----------
superadmin.mount(app, { getShops, saveShops, getSettings, saveSettings, broadcast, shopSettingsFor, getOwnerConfig: store.getOwnerConfig, saveOwnerConfig: store.saveOwnerConfig });
app.get(['/superadmin', '/superadmin.html', '/owner'], (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

// ---------- Shop auth + license middleware ----------
function requireShop(req, res, next) {
  const t = A.verifyToken(A.bearer(req));
  if (!t || t.r !== 'shop') return res.status(401).json({ error: 'Please login again', code: 'AUTH' });
  const shop = getShops().find(x => x.shopId === t.id);
  if (!shop) return res.status(401).json({ error: 'Shop account not found', code: 'AUTH' });
  const info = A.licenseInfo(shop);
  if (!info.allowed) return res.status(403).json({ error: A.licenseMessage(info), code: 'LICENSE', state: info.state });
  req.shop = shop;
  next();
}

// One-time upgrade: hash old plain passwords, give existing shops a licence
function migrateShops() {
  const shops = getShops();
  let changed = false;
  const now = Date.now();
  for (const s of shops) {
    if (s.password && !s.passwordHash) { s.passwordHash = A.hashPassword(s.password); delete s.password; changed = true; }
    if (!s.license) {
      const exp = new Date(now + 30 * A.DAY).toISOString();
      s.license = { plan: 'monthly', status: 'active', startedAt: new Date(now).toISOString(), expiresAt: exp };
      s.renewals = [{ date: new Date(now).toISOString(), plan: 'monthly', days: 30, amount: 0, note: 'Existing shop - 30 days given on upgrade', expiresAt: exp }];
      changed = true;
    }
  }
  if (changed) { saveShops(shops); console.log('🔐 Shops upgraded: passwords hashed + licences added'); }
  const st = getSettings();
  if (st.adminPassword !== undefined || st.adminPin !== undefined) {
    const clean = { ...st }; delete clean.adminPassword; delete clean.adminPin;
    saveSettings(clean);
  }
}

// Admin Dashboard Routes (/admin, /admin.html, /dashboard)
app.get(['/admin', '/admin.html', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Customer Order Portal Route
app.get(['/order', '/order.html', '/kiosk', '/print', '/print/:shopId'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Helper: Auto-detect page count
async function detectPageCount(filePath, ext) {
  if (ext === '.pdf') {
    try {
      const pdfBytes = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      return pdfDoc.getPageCount();
    } catch (err) {
      console.warn('Could not extract PDF page count:', err.message);
      return 1;
    }
  }
  // Image or single doc default
  return 1;
}

// ---------------- API ROUTES ----------------

// Get System Info & Mobile URL
app.get('/api/info', (req, res) => {
  const localIp = getLocalIp();
  const port = PORT;
  const settings = getSettings();
  const shop = shopFromToken(req) || shopFromParam(req);
  
  // Detect if requested via public tunnel (Cloudflare / ngrok / reverse proxy)
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  
  let baseUrl;
  if ((process.env.PUBLIC_URL || '').trim()) {
    baseUrl = process.env.PUBLIC_URL.trim().replace(/\/$/, '');
  } else if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
    baseUrl = `${forwardedProto}://${forwardedHost}`;
  } else {
    baseUrl = `http://${localIp}:${port}`;
  }

  res.json({
    localIp,
    port,
    baseUrl,
    shopId: shop ? shop.shopId : null,
    orderUrl: shop ? `${baseUrl}/print/${encodeURIComponent(shop.shopId)}` : null,
    noShop: !shop,
    settings: shop ? shopSettingsFor(shop) : publicSettings(settings),
    shopBlocked: (shop && shopBlockMessage(shop)) || false
  });
});

// Get Installed Windows Printers
app.get('/api/printers', requireShop, (req, res) => {
  if (process.platform !== 'win32') {
    // Cloud / Linux environment: physical printers are managed by the shop's local client
    return res.json({ printers: ['Default Local Printer / Browser Dialog'] });
  }

  exec('powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"', (err, stdout) => {
    if (err) {
      console.warn('Could not fetch printers:', err.message);
      return res.json({ printers: [] });
    }
    const printers = stdout
      .split(/\r?\n/)
      .map(p => p.trim())
      .filter(Boolean);
    res.json({ printers });
  });
});

// Test page for the desktop app: a small PDF in /uploads that the .exe downloads and prints silently
app.post('/api/printers/test-file', requireShop, async (req, res) => {
  try {
    const { StandardFonts, rgb } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const clean = (t) => String(t || '').replace(/[^\x20-\x7E]/g, '?').slice(0, 60);
    page.drawText('QuickPrint test page', { x: 60, y: 760, size: 28, font: bold });
    page.drawText(clean(req.shop.shopName), { x: 60, y: 720, size: 16, font });
    page.drawText('Printer: ' + (clean(req.body && req.body.printerName) || 'Default printer'), { x: 60, y: 695, size: 12, font });
    page.drawText('Mode: ' + (req.body && req.body.mode === 'color' ? 'Colour' : 'Black & White'), { x: 60, y: 675, size: 12, font });
    page.drawText(new Date().toLocaleString('en-IN'), { x: 60, y: 655, size: 12, font });
    [[0, 0.6, 0.72], [0.83, 0.06, 0.44], [1, 0.83, 0], [0.08, 0.13, 0.24]].forEach((c, i) =>
      page.drawRectangle({ x: 60 + i * 110, y: 560, width: 100, height: 60, color: rgb(c[0], c[1], c[2]) }));
    page.drawText('If you can read this, auto print will work.', { x: 60, y: 520, size: 12, font });
    const name = `qp-test-${Date.now()}.pdf`;
    fs.writeFileSync(path.join(UPLOADS_DIR, name), await pdf.save());
    setTimeout(() => fs.unlink(path.join(UPLOADS_DIR, name), () => {}), 10 * 60 * 1000);
    res.json({ url: `/uploads/${name}` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not create test page' });
  }
});

// Test Print Endpoint
app.post('/api/printers/test', requireShop, async (req, res) => {
  const { printerName } = req.body;
  try {
    const testPdfPath = path.join(UPLOADS_DIR, 'test-page.pdf');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    page.drawText(`QuickPrint Test Sheet - ${printerName || 'Default'}`, { x: 50, y: 750, size: 18 });
    page.drawText(`Time: ${new Date().toLocaleString()}`, { x: 50, y: 710, size: 12 });
    page.drawText(`Printer Status: Working Normally!`, { x: 50, y: 670, size: 14 });
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(testPdfPath, pdfBytes);

    const absPath = path.resolve(testPdfPath);
    let psCmd;
    if (printerName && printerName.length > 0) {
      psCmd = `Start-Process -FilePath "${absPath}" -Verb PrintTo -ArgumentList '"${printerName}"' -PassThru | Out-Null`;
    } else {
      psCmd = `Start-Process -FilePath "${absPath}" -Verb Print -PassThru | Out-Null`;
    }
    exec(`powershell -NoProfile -Command "${psCmd}"`, (err) => {
      if (err) console.warn('Test print error:', err.message);
    });

    res.json({ success: true, message: `Test page sent to ${printerName || 'Default Printer'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Shop Settings
app.get('/api/settings', (req, res) => {
  const shop = shopFromToken(req) || shopFromParam(req);
  res.json(shop ? shopSettingsFor(shop) : publicSettings(getSettings()));
});

// Get Shop License Info & Pricing Plans for Renewal
app.get('/api/license', (req, res) => {
  const shop = shopFromToken(req) || shopFromParam(req);
  const info = shop ? A.licenseInfo(shop) : { state: 'unauthenticated', daysLeft: null, allowed: false };
  const ownerCfg = (typeof getOwnerConfig === 'function' ? getOwnerConfig() : null) || {};
  res.json({
    success: true,
    shopId: shop ? shop.shopId : null,
    shopName: shop ? shop.shopName : null,
    license: shop ? {
      state: info.state,
      daysLeft: info.daysLeft,
      plan: (shop.license && shop.license.plan) || 'demo',
      expiresAt: (shop.license && shop.license.expiresAt) || null,
      allowed: info.allowed,
      lifetime: !!info.lifetime
    } : null,
    plans: A.PLANS,
    owner: {
      whatsapp: ownerCfg.whatsapp || '919999999999',
      upiId: ownerCfg.upiId || '',
      upiName: ownerCfg.upiName || ownerCfg.businessName || 'Hasulots Technologies',
      businessName: ownerCfg.businessName || 'Hasulots Technologies'
    }
  });
});

// Shop Owner Login (username + password given by the website owner)
app.post('/api/admin/login', (req, res) => {
  if (A.isLocked(req)) return res.status(429).json({ error: 'Too many attempts. Try again after 15 minutes.' });
  const { username = '', password = '' } = req.body || {};
  const cleanUser = String(username).trim().toLowerCase();
  const cleanPass = String(password);

  const shop = getShops().find(s => (s.username || '').toLowerCase() === cleanUser);
  const ok = !!shop && A.verifyPassword(cleanPass, shop.passwordHash);
  if (!ok) {
    A.recordFail(req);
    return res.status(401).json({ error: 'Invalid Username or Password / தவறான கடவுச்சொல்', code: 'AUTH' });
  }
  A.clearFails(req);

  const info = A.licenseInfo(shop);
  if (!info.allowed) {
    return res.status(403).json({ error: A.licenseMessage(info), code: 'LICENSE', state: info.state });
  }

  // Each shop keeps its own settings; logging in never changes another shop's page
  const updated = shopSettingsFor(shop);

  res.json({
    success: true,
    token: A.signToken({ r: 'shop', id: shop.shopId }, 12 * 60 * 60 * 1000),
    shop: publicSettings(updated),
    license: { state: info.state, daysLeft: info.daysLeft, plan: shop.license.plan, expiresAt: shop.license.expiresAt || null }
  });
});

// Old PIN endpoints are retired
app.post(['/api/admin/verify-pin', '/api/admin/verify-password'], (req, res) => {
  res.status(410).json({ error: 'Retired. Use /api/admin/login' });
});

// Shop owner self-signup (1 week demo). The shop stays PENDING until the website owner approves it in /owner.
const signupHits = new Map(); // ip -> [timestamps]
app.post('/api/shops/register', (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ success: true }); // honeypot: bots fill hidden field

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();
  const hits = (signupHits.get(ip) || []).filter(t => Date.now() - t < 60 * 60 * 1000);
  if (hits.length >= 5) return res.status(429).json({ error: 'Too many requests. Please try again after some time.' });

  const ownerName = String(b.name || '').trim().slice(0, 80);
  const phone = String(b.phone || '').replace(/\D/g, '').slice(-10);
  const shopName = String(b.shopName || '').trim().slice(0, 80);
  const address = String(b.address || '').trim().slice(0, 200);
  const email = String(b.email || '').trim().slice(0, 120);
  const username = String(b.username || '').trim();
  const password = String(b.password || '');

  if (!ownerName) return res.status(400).json({ error: 'Please enter your name' });
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid 10 digit WhatsApp number' });
  if (!shopName) return res.status(400).json({ error: 'Please enter your shop name' });
  if (!address) return res.status(400).json({ error: 'Please enter your shop address' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Username: 3-30 letters/numbers (a-z 0-9 _ . -)' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const shops = getShops();
  if (shops.some(s => (s.username || '').toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
  }
  if (shops.some(s => s.phone === phone && s.license && s.license.status === 'pending')) {
    return res.status(409).json({ error: 'A request with this number is already waiting for approval.' });
  }

  const namePart = shopName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
  let shopId;
  do { shopId = `QP_${namePart}_${Math.floor(100 + Math.random() * 900)}`; }
  while (shops.some(s => s.shopId === shopId));

  const now = new Date().toISOString();
  shops.push({
    shopId, shopName, username, ownerName, email, phone, address,
    passwordHash: A.hashPassword(password),
    upiId: `${namePart.toLowerCase()}@upi`,
    upiName: shopName,
    pricing: { bwPerA4Page: 3, colorPerA4Page: 10, duplexDiscountPercent: 15, legalSurcharge: 2, a3Multiplier: 2.5 },
    license: { plan: 'demo', status: 'pending', startedAt: null, expiresAt: null },
    renewals: [],
    createdAt: now
  });
  saveShops(shops);
  hits.push(Date.now()); signupHits.set(ip, hits);
  console.log(`🆕 New demo request: ${shopName} (${shopId}) - waiting for owner approval`);
  res.json({ success: true });
});

// Update Shop Settings
app.post('/api/settings', requireShop, (req, res) => {
  // Login details and shop identity are controlled by the owner only
  const { adminUsername, adminPassword, adminPin, shopId, publicUrl, ...body } = req.body || {};
  const { shopName, shopPhone, shopAddress, upiId, pricing, ...rest } = body;
  const shops = getShops();
  const shop = shops.find(s => s.shopId === req.shop.shopId);
  if (typeof shopName === 'string' && shopName.trim()) shop.shopName = shopName.trim().slice(0, 80);
  if (typeof shopPhone === 'string') shop.phone = shopPhone.trim().slice(0, 20);
  if (typeof shopAddress === 'string') shop.address = shopAddress.trim().slice(0, 200);
  if (typeof upiId === 'string') shop.upiId = upiId.trim().slice(0, 80);
  if (pricing && typeof pricing === 'object') shop.pricing = { ...(shop.pricing || {}), ...pricing };
  shop.settings = { ...(shop.settings || {}), ...rest };
  saveShops(shops);
  const updated = shopSettingsFor(shop);
  broadcast({ type: 'SETTINGS_UPDATED', settings: updated }, shop.shopId);
  res.json({ success: true, settings: updated });
});

// File Upload Endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const shop = shopFromParam(req);
    if (!shop) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(400).json({ error: 'Invalid shop QR. Please scan the shop QR code again.' });
    }
    if (shopBlockMessage(shop)) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(403).json({ error: 'This shop is temporarily unavailable.', code: 'LICENSE' });
    }
    const settings = shopSettingsFor(shop);
    if (settings.shopOpen === false) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
      return res.status(403).json({ error: 'Shop is currently closed. Will reopen tomorrow morning at 9:00 AM.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const pageCount = await detectPageCount(req.file.path, ext);

    const fileData = {
      fileId: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      pageCount: pageCount,
      ext: ext,
      url: `/uploads/${req.file.filename}`
    };

    res.json({ success: true, file: fileData });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'File upload failed' });
  }
});

// Create Print Order
app.post('/api/orders', (req, res) => {
  try {
    const shop = shopFromParam(req);
    if (!shop) return res.status(400).json({ error: 'Invalid shop QR. Please scan the shop QR code again.' });
    if (shopBlockMessage(shop)) {
      return res.status(403).json({ error: 'This shop is temporarily unavailable.', code: 'LICENSE' });
    }
    const settings = shopSettingsFor(shop);
    if (settings.shopOpen === false) {
      return res.status(403).json({ error: 'Shop is currently closed. Will reopen tomorrow morning at 9:00 AM.' });
    }

    const {
      fileId,
      originalName,
      pageCount,
      copies = 1,
      colorMode = 'bw',       // 'bw' or 'color'
      duplex = 'single',      // 'single' or 'double'
      paperSize = 'A4',       // 'A4', 'Legal', 'A3'
      pageRange = 'all',      // 'all' or specific e.g. "1-5"
      customerName = 'Guest Customer',
      customerPhone = ''
    } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const effectivePages = parseInt(pageCount, 10) || 1;
    const numCopies = parseInt(copies, 10) || 1;

    // Calculate base rate per page
    let perPagePrice = (colorMode === 'color') 
      ? settings.pricing.colorPerA4Page 
      : settings.pricing.bwPerA4Page;

    if (paperSize === 'Legal') {
      perPagePrice += settings.pricing.legalSurcharge;
    } else if (paperSize === 'A3') {
      perPagePrice = Math.round(perPagePrice * settings.pricing.a3Multiplier);
    }

    let totalAmount = perPagePrice * effectivePages * numCopies;

    // Apply duplex discount if double sided
    if (duplex === 'double' && effectivePages > 1) {
      const discount = (totalAmount * (settings.pricing.duplexDiscountPercent / 100));
      totalAmount = Math.max(1, Math.round(totalAmount - discount));
    }

    // Minimum charge ₹1
    totalAmount = Math.max(1, totalAmount);

    // Generate short friendly pickup code e.g. "QP-4821"
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const orderToken = `QP-${randomCode}`;
    const orderId = uuidv4();

    // Construct UPI Payment Link
    const upiNote = encodeURIComponent(`Print ${orderToken} - ${settings.shopName}`);
    const upiUrl = !settings.upiId ? '' : `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.upiName)}&am=${totalAmount}&cu=INR&tn=${upiNote}`;

    const newOrder = {
      id: orderId,
      shopId: shop.shopId,
      token: orderToken,
      fileId,
      originalName: originalName || fileId,
      fileUrl: `/uploads/${fileId}`,
      fileType: path.extname(originalName || fileId).toLowerCase(),
      pageCount: effectivePages,
      copies: numCopies,
      colorMode,
      duplex,
      paperSize,
      pageRange,
      customerName,
      customerPhone,
      pricing: {
        perPagePrice,
        totalAmount
      },
      upiUrl,
      paymentStatus: 'pending', // 'pending' | 'paid'
      paymentTxnId: null,
      paymentMethod: 'upi',
      status: 'pending_payment', // 'pending_payment' | 'queued' | 'printing' | 'completed' | 'cancelled'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const orders = getOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    // Notify connected Admin dashboards
    broadcast({ type: 'ORDER_CREATED', order: newOrder }, shop.shopId);

    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// Get All Orders (Admin)
app.get('/api/orders', requireShop, (req, res) => {
  const orders = getOrders().filter(o => o.shopId === req.shop.shopId);
  res.json({ orders });
});

// Get Single Order (Status polling / websocket tracking)
app.get('/api/orders/:id', (req, res) => {
  const viewer = shopFromToken(req) || shopFromParam(req);
  const sid = viewer ? viewer.shopId : null;
  const order = getOrders().find(o => o.id === req.params.id || (o.token === req.params.id && sid && o.shopId === sid));
  if (!order || (sid && order.shopId !== sid)) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

// Pay / Confirm Order Payment
app.post('/api/orders/:id/pay', requireShop, (req, res) => {
  const { txnId = '', simulated = false } = req.body;
  const orders = getOrders();
  const orderIndex = orders.findIndex(o => (o.id === req.params.id || o.token === req.params.id) && o.shopId === req.shop.shopId);

  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = orders[orderIndex];
  order.paymentStatus = 'paid';
  order.status = 'queued'; // Sent to print queue
  order.paymentTxnId = txnId || `UPI-TXN-${Date.now()}`;
  order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  saveOrders(orders);

  // Broadcast real-time event to Admin (plays audio alert!) and Customer
  broadcast({ type: 'ORDER_PAID', order }, req.shop.shopId);

  // Direct Windows Silent Printing if Auto-Print is enabled
  const settings = getSettings();
  if (settings.autoPrintEnabled) {
    const filePath = path.join(UPLOADS_DIR, order.fileId);
    if (fs.existsSync(filePath)) {
      const absPath = path.resolve(filePath);
      const targetPrinter = (order.colorMode === 'color') 
        ? settings.selectedColorPrinter 
        : settings.selectedBwPrinter;

      let psCmd;
      if (targetPrinter && targetPrinter.length > 0) {
        psCmd = `Start-Process -FilePath "${absPath}" -Verb PrintTo -ArgumentList '"${targetPrinter}"' -PassThru | Out-Null`;
      } else {
        psCmd = `Start-Process -FilePath "${absPath}" -Verb Print -PassThru | Out-Null`;
      }

      console.log(`🖨️ Auto-printing ${order.token} directly to ${targetPrinter || 'Default Windows Printer'}...`);
      exec(`powershell -NoProfile -Command "${psCmd}"`, (err) => {
        if (err) console.warn('PowerShell direct print error:', err.message);
        else console.log(`✅ ${order.token} dispatched to physical printer.`);
      });
    }
  }

  res.json({ success: true, order });
});

// Update Order Status (Admin action: Printing, Completed, etc.)
app.post('/api/orders/:id/status', requireShop, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending_payment', 'queued', 'printing', 'completed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const orders = getOrders();
  const orderIndex = orders.findIndex(o => (o.id === req.params.id || o.token === req.params.id) && o.shopId === req.shop.shopId);

  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  orders[orderIndex].status = status;
  orders[orderIndex].updatedAt = new Date().toISOString();

  saveOrders(orders);

  broadcast({ type: 'ORDER_STATUS_CHANGED', order: orders[orderIndex] }, req.shop.shopId);

  res.json({ success: true, order: orders[orderIndex] });
});

// Delete Order (Admin action)
app.delete('/api/orders/:id', requireShop, (req, res) => {
  let orders = getOrders();
  const order = orders.find(o => o.id === req.params.id && o.shopId === req.shop.shopId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  // Optionally delete uploaded file
  const filePath = path.join(UPLOADS_DIR, order.fileId);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
  orders = orders.filter(o => !(o.id === req.params.id && o.shopId === req.shop.shopId));
  saveOrders(orders);
  broadcast({ type: 'ORDER_DELETED', orderId: req.params.id }, req.shop.shopId);
  res.json({ success: true });
});

// Generate dynamic QR Code Image (Data URL)
// Generate dynamic QR Code Image (Data URL or PNG Image)
app.get('/api/qr', async (req, res) => {
  try {
    // Without ?text the QR is the logged-in shop's own link; never a shop-less /order link
    let text = req.query.text;
    if (!text) {
      const shop = shopFromToken(req) || shopFromParam(req);
      if (!shop) return res.status(400).json({ error: 'Login first to get your shop QR' });
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
      const base = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, '') || `${proto}://${host}`;
      text = `${base}/print/${encodeURIComponent(shop.shopId)}`;
    }
    const width = parseInt(req.query.width, 10) || 300;

    if (req.query.format === 'image' || (req.headers.accept && req.headers.accept.includes('image/'))) {
      const qrBuffer = await QRCode.toBuffer(text, {
        margin: 1,
        width,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      res.type('image/png').send(qrBuffer);
    } else {
      const qrDataUrl = await QRCode.toDataURL(text, {
        margin: 1,
        width,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      res.json({ qr: qrDataUrl, text });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Endpoint to force-restart tunnel
app.post('/api/tunnel/restart', requireShop, (req, res) => {
  startCloudflaredTunnel();
  res.json({ success: true, message: 'Restarting tunnel' });
});

// WebSocket Connection Management
wss.on('connection', (ws, req) => {
  try {
    const u = new URL(req.url, 'http://x');
    const tok = u.searchParams.get('token');
    if (tok) { const t = A.verifyToken(tok); if (t && t.r === 'shop') ws.shopId = t.id; }
    const view = u.searchParams.get('shop');
    if (view) ws.viewShop = view;
  } catch (e) {}
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  ws.send(JSON.stringify({ 
    type: 'CONNECTED', 
    message: 'QuickPrint Live Connection Active' 
  }));
});

// Health check & ping interval
const pingInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(pingInterval));

// Auto-Tunnel Helper for Zero-Config Public HTTPS (No WiFi needed for customer)
let activeTunnelProc = null;

function startCloudflaredTunnel() {
  const cloudflaredBin = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(cloudflaredBin)) {
    console.log('ℹ️ cloudflared.exe not found, skipping auto-tunnel.');
    return;
  }

  if (activeTunnelProc) {
    try { activeTunnelProc.kill(); } catch (e) {}
    activeTunnelProc = null;
  }

  console.log('🌐 Launching Cloudflare Tunnel for Public Internet Access...');
  activeTunnelProc = spawn(cloudflaredBin, ['tunnel', '--url', `http://localhost:${PORT}`]);

  activeTunnelProc.stderr.on('data', (data) => {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      const publicUrl = match[0];
      console.log(`✨ Public HTTPS URL Ready: ${publicUrl}`);
      const settings = getSettings();
      settings.publicUrl = publicUrl;
      saveSettings(settings);
      broadcast({ type: 'TUNNEL_URL_CHANGED', publicUrl, targetUrl: `${publicUrl}/order` });
      broadcast({ type: 'SETTINGS_UPDATED', settings });
    }
  });

  activeTunnelProc.on('exit', (code) => {
    console.log(`Cloudflare tunnel exited (code ${code}), restarting in 3s...`);
    activeTunnelProc = null;
    setTimeout(startCloudflaredTunnel, 3000);
  });
}

// Start Server (after data store is loaded)
store.init(defaultSettings).then(() => {
migrateShops();
server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`====================================================`);
  console.log(`🚀 QuickPrint QR Server is Running!`);
  console.log(`📱 Customer Mobile URL: http://${localIp}:${PORT}`);
  console.log(`💻 Local Test URL:     http://localhost:${PORT}`);
  console.log(`⚙️  Admin Dashboard:     http://localhost:${PORT}/admin.html`);
  console.log(`🖨️  Counter Standee:     http://localhost:${PORT}/standee.html`);
  console.log(`====================================================`);

  // Start public internet tunnel automatically
  startCloudflaredTunnel();
});
}).catch(err => { console.error('Failed to start:', err); process.exit(1); });
