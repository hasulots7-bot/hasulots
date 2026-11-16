const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const multer = require('multer');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { spawn, exec } = require('child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production-please';
const PORT = process.env.PORT || 4000;
const DATA_DIR = process.env.QP_DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.QP_UPLOADS_DIR || path.join(__dirname, 'uploads');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AGENTS_FILE = path.join(DATA_DIR, 'agents.json');
const FIRST_RUN_FILE = path.join(DATA_DIR, 'first-run.json');
const FIRST_RUN_APPLIED = path.join(DATA_DIR, 'first-run.applied.json');
const ROLE_FILE = path.join(DATA_DIR, 'role.txt');

function getShops() {
  try {
    if (fs.existsSync(SHOPS_FILE)) {
      return JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading shops:', err);
  }
  return [];
}

function saveShops(shops) {
  fs.writeFileSync(SHOPS_FILE, JSON.stringify(shops, null, 2));
}

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
  adminUsername: "admin",
  adminPassword: "1234",
  platformUsername: "admin",
  platformPassword: "1234",
  installRole: "owner",
  autoPrintEnabled: false
};

// Load or initialize settings
function getSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading settings, using defaults:', err);
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
  return { ...defaultSettings };
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Make sure new installs / old settings files have the role + platform fields.
function ensureSettingsShape() {
  const s = getSettings();
  let changed = false;
  for (const key of ['adminUsername', 'adminPassword', 'platformUsername', 'platformPassword', 'installRole']) {
    if (s[key] === undefined || s[key] === null || s[key] === '') {
      s[key] = defaultSettings[key];
      changed = true;
    }
  }
  if (changed) saveSettings(s);
  return s;
}

// Load or initialize orders
function getOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading orders:', err);
  }
  return [];
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function readAllOrders() { return getOrders(); }

function getUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {}
  return [];
}
function saveUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

function getAgents() {
  try {
    if (fs.existsSync(AGENTS_FILE)) return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf-8'));
  } catch (e) {}
  return [];
}
function saveAgents(agents) { fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2)); }

function getShopSettings(shopId) {
  const shops = getShops();
  const shop = shops.find(s => s.shopId === shopId);
  if (!shop) return null;
  return {
    shopId: shop.shopId,
    shopName: shop.shopName,
    shopPhone: shop.phone || '',
    shopAddress: shop.address || '',
    upiId: shop.upiId || '',
    upiName: shop.shopName,
    pricing: shop.pricing || { bwPerA4Page: 3, colorPerA4Page: 10, duplexDiscountPercent: 15, legalSurcharge: 2, a3Multiplier: 2.5 },
    shopOpen: shop.shopOpen !== false,
    adminUsername: shop.username,
    // Never expose the password (or its hash) to the browser.
    adminPassword: '',
    autoPrintEnabled: !!shop.autoPrintEnabled,
    selectedBwPrinter: shop.selectedBwPrinter || '',
    selectedColorPrinter: shop.selectedColorPrinter || ''
  };
}

function saveShopSettings(shopId, patch) {
  const shops = getShops();
  const idx = shops.findIndex(s => s.shopId === shopId);
  if (idx === -1) return null;
  const shop = shops[idx];
  if (patch.shopName !== undefined) shop.shopName = patch.shopName;
  if (patch.phone !== undefined) shop.phone = patch.phone;
  if (patch.address !== undefined) shop.address = patch.address;
  if (patch.upiId !== undefined) shop.upiId = patch.upiId;
  if (patch.pricing) shop.pricing = { ...(shop.pricing || {}), ...patch.pricing };
  if (patch.shopOpen !== undefined) shop.shopOpen = patch.shopOpen;
  if (patch.autoPrintEnabled !== undefined) shop.autoPrintEnabled = patch.autoPrintEnabled;
  if (patch.selectedBwPrinter !== undefined) shop.selectedBwPrinter = patch.selectedBwPrinter;
  if (patch.selectedColorPrinter !== undefined) shop.selectedColorPrinter = patch.selectedColorPrinter;
  if (patch.password !== undefined && patch.password) shop.password = patch.password;
  shop.updatedAt = new Date().toISOString();
  saveShops(shops);
  return getShopSettings(shopId);
}

// Orders are stored globally but tagged with shopId.
function getOrders(shopId) {
  let all = [];
  try {
    if (fs.existsSync(ORDERS_FILE)) all = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
  } catch (e) {}
  if (!shopId) return all;
  return all.filter(o => o.shopId === shopId);
}
// override saveOrders to keep global
function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ------------------------------------------------------------
// First-run setup (written by QuickPrint-Setup.exe)
// The wizard never edits JSON itself; it drops data/first-run.json
// and this merge applies it once, then archives the file.
// ------------------------------------------------------------
function writeRoleFile(role) {
  try {
    fs.writeFileSync(ROLE_FILE, role === 'admin' ? 'admin' : 'owner');
  } catch (err) {
    console.warn('Could not write role file:', err.message);
  }
}

function applyFirstRunConfig() {
  const settings = ensureSettingsShape();

  if (!fs.existsSync(FIRST_RUN_FILE)) {
    writeRoleFile(settings.installRole);
    return;
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(FIRST_RUN_FILE, 'utf-8'));
    const role = cfg.role === 'admin' ? 'admin' : 'owner';
    settings.installRole = role;

    if (cfg.shopName && String(cfg.shopName).trim()) {
      const shopName = String(cfg.shopName).trim();
      const namePart = shopName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
      const shops = getShops();
      const username = (cfg.username && String(cfg.username).trim()) ||
        (settings.adminUsername || namePart.toLowerCase());

      // Reuse the existing shop record for this login, otherwise create one.
      let shop = shops.find(s => s.username && s.username.toLowerCase() === username.toLowerCase()) ||
                 shops.find(s => s.shopId === settings.shopId);
      if (!shop) {
        shop = {
          shopId: cfg.shopId || `QP_${namePart}_${Math.floor(100 + Math.random() * 900)}`,
          createdAt: new Date().toISOString()
        };
        shops.push(shop);
      }

      shop.shopName = shopName;
      shop.username = username;
      shop.password = (cfg.password && String(cfg.password).trim()) || shop.password || '1234';
      shop.phone = cfg.phone !== undefined ? String(cfg.phone).trim() : (shop.phone || '');
      shop.address = cfg.address !== undefined ? String(cfg.address).trim() : (shop.address || '');
      shop.upiId = (cfg.upiId && String(cfg.upiId).trim()) || shop.upiId || `${namePart.toLowerCase()}@upi`;
      shop.upiName = shopName;
      shop.pricing = {
        ...(shop.pricing || {}),
        bwPerA4Page: parseFloat(cfg.bwRate) || shop.pricing?.bwPerA4Page || 3,
        colorPerA4Page: parseFloat(cfg.colorRate) || shop.pricing?.colorPerA4Page || 10
      };
      shop.updatedAt = new Date().toISOString();
      saveShops(shops);

      settings.shopId = shop.shopId;
      settings.shopName = shop.shopName;
      settings.adminUsername = shop.username;
      settings.adminPassword = shop.password;
      settings.shopPhone = shop.phone;
      settings.shopAddress = shop.address;
      settings.upiId = shop.upiId;
      settings.upiName = shop.upiName;
      settings.pricing = { ...(settings.pricing || {}), ...shop.pricing };
    }

    if (cfg.platformUsername) settings.platformUsername = String(cfg.platformUsername).trim();
    if (cfg.platformPassword) settings.platformPassword = String(cfg.platformPassword).trim();

    settings.installedAt = cfg.installedAt || new Date().toISOString();
    saveSettings(settings);
    writeRoleFile(role);
    fs.renameSync(FIRST_RUN_FILE, FIRST_RUN_APPLIED);
    console.log(`✅ First-run setup applied. Role: ${role}${settings.shopName ? ` | Shop: ${settings.shopName}` : ''}`);
  } catch (err) {
    console.error('First-run setup error (continuing):', err.message);
    writeRoleFile(settings.installRole);
  }
}

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
function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
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
  index: false,
  setHeaders: (res, filePath) => {
    // Always revalidate the service worker and HTML so new builds are picked up.
    if (filePath.endsWith('sw.js') || filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));
app.use('/uploads', express.static(UPLOADS_DIR));

// Platform Admin Console (/admin, /admin.html)
app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Shop Owner Console (/owner, /owner.html, /dashboard)
app.get(['/owner', '/owner.html', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner.html'));
});

// Cloud landing page (marketing + owner signup/login)
app.get(['/', '/index.html', '/home'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Owner signup page
app.get(['/signup', '/signup.html', '/register'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Customer Order Portal Route (scanned QR lands here)
// e.g. /order?shop=QP_XXXX or /print/QP_XXXX
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

// ------------------------------------------------------------
// Word / text uploads are converted to PDF on the server so the
// customer can preview pages in the browser and select a page range.
// ------------------------------------------------------------
let wordConversionQueue = Promise.resolve();

function convertWordToPdf(inputPath, outputPath) {
  // Windows: drive Microsoft Word via COM (best fidelity).
  if (process.platform === 'win32') {
    return new Promise((resolve, reject) => {
      const script = path.join(__dirname, 'tools', 'convert-word.ps1');
      if (!fs.existsSync(script)) {
        return reject(new Error('Word converter script is missing'));
      }

      const ps = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script, '-InputPath', inputPath, '-OutputPath', outputPath
      ], { windowsHide: true });

      let stderr = '';
      const timer = setTimeout(() => {
        try { ps.kill(); } catch (e) {}
        reject(new Error('Word conversion timed out'));
      }, 90000);

      ps.stderr.on('data', d => { stderr += d.toString(); });
      ps.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
      ps.on('close', code => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve();
        } else {
          reject(new Error(stderr.trim() || `Word conversion failed (exit ${code})`));
        }
      });
    });
  }

  // Linux/macOS (cloud VPS): LibreOffice headless.
  // Install with: sudo apt install -y libreoffice-writer
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(outputPath);
    const proc = spawn('soffice', [
      '--headless', '--norestore', '--convert-to', 'pdf',
      '--outdir', outDir, inputPath
    ]);

    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('Word conversion timed out'));
    }, 120000);

    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error('LibreOffice (soffice) is not installed: ' + err.message));
    });
    proc.on('close', code => {
      clearTimeout(timer);
      // LibreOffice writes <basename>.pdf into outDir.
      const produced = path.join(outDir, path.basename(inputPath, path.extname(inputPath)) + '.pdf');
      try {
        if (produced !== outputPath && fs.existsSync(produced)) fs.renameSync(produced, outputPath);
      } catch (e) {}
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Word conversion failed (exit ${code})`));
      }
    });
  });
}

function queueWordConversion(inputPath, outputPath) {
  const job = wordConversionQueue.then(() => convertWordToPdf(inputPath, outputPath));
  wordConversionQueue = job.catch(() => {});
  return job;
}

// Convert a plain .txt file into a simple A4 PDF (no external tools needed).
async function convertTextToPdf(inputPath, outputPath) {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const maxChars = 92;
  const wrapped = [];
  for (const line of lines) {
    if (line.length <= maxChars) {
      wrapped.push(line);
    } else {
      let rest = line;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut < 20) cut = maxChars;
        wrapped.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^ /, '');
      }
      wrapped.push(rest);
    }
  }

  const linesPerPage = 48;
  const pageCount = Math.max(1, Math.ceil(wrapped.length / linesPerPage));
  for (let p = 0; p < pageCount; p++) {
    const page = pdfDoc.addPage([595.28, 841.89]);
    const chunk = wrapped.slice(p * linesPerPage, (p + 1) * linesPerPage);
    let y = 800;
    for (const line of chunk) {
      page.drawText(line.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''), {
        x: 45, y, size: 10.5, font, maxWidth: 505
      });
      y -= 15.5;
    }
  }
  fs.writeFileSync(outputPath, await pdfDoc.save());
}

// Parse "all", "1,3,5" or "1-3,6" into 0-based page indexes.
function parseSelectedPages(pageRange, totalPages) {
  if (!pageRange || pageRange === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const picked = new Set();
  for (const part of String(pageRange).split(',')) {
    const bit = part.trim();
    if (!bit) continue;
    if (bit.includes('-')) {
      const [a, b] = bit.split('-').map(n => parseInt(n, 10));
      if (!isNaN(a) && !isNaN(b)) {
        for (let p = Math.max(1, a); p <= Math.min(totalPages, b); p++) picked.add(p - 1);
      }
    } else {
      const p = parseInt(bit, 10);
      if (!isNaN(p) && p >= 1 && p <= totalPages) picked.add(p - 1);
    }
  }
  return picked.size ? Array.from(picked).sort((x, y) => x - y) : Array.from({ length: totalPages }, (_, i) => i);
}

// Create a PDF that contains only the pages the customer selected.
async function createSelectedPagesPdf(fileId, pageRange) {
  const srcPath = path.join(UPLOADS_DIR, fileId);
  if (!fs.existsSync(srcPath) || path.extname(fileId).toLowerCase() !== '.pdf') return null;

  const srcDoc = await PDFDocument.load(fs.readFileSync(srcPath), { ignoreEncryption: true });
  const selected = parseSelectedPages(pageRange, srcDoc.getPageCount());
  if (selected.length === srcDoc.getPageCount()) return null;

  const outDoc = await PDFDocument.create();
  const pages = await outDoc.copyPages(srcDoc, selected);
  pages.forEach(page => outDoc.addPage(page));

  const outName = `print-${Date.now()}-${Math.round(Math.random() * 1e6)}.pdf`;
  fs.writeFileSync(path.join(UPLOADS_DIR, outName), await outDoc.save());
  return { fileId: outName, pageCount: selected.length };
}

// ---------------- API ROUTES ----------------

// Get System Info & Mobile URL
app.get('/api/info', (req, res) => {
  const localIp = getLocalIp();
  const port = PORT;
  const settings = getSettings();
  
  // Detect if requested via public tunnel (Cloudflare / ngrok / reverse proxy)
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  
  let baseUrl;
  if (process.env.PUBLIC_URL) {
    baseUrl = process.env.PUBLIC_URL.trim().replace(/\/$/, '');
  } else if (settings.publicUrl && settings.publicUrl.trim().length > 0) {
    baseUrl = settings.publicUrl.trim().replace(/\/$/, '');
  } else if (forwardedHost && !forwardedHost.includes('localhost') && !forwardedHost.includes('127.0.0.1')) {
    baseUrl = `${forwardedProto}://${forwardedHost}`;
  } else {
    baseUrl = `http://${localIp}:${port}`;
  }

  res.json({
    localIp,
    port,
    baseUrl,
    settings
  });
});

// Get Installed Windows Printers
app.get('/api/printers', (req, res) => {
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

// Test Print Endpoint
app.post('/api/printers/test', async (req, res) => {
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
  const shopId = req.query.shopId || req.headers['x-shop-id'];
  if (shopId) {
    const s = getShopSettings(shopId);
    if (!s) return res.status(404).json({ error: 'Shop not found' });
    return res.json(s);
  }
  // fallback: global default settings (template)
  res.json(getSettings());
});

// Launcher role hint (plain text: "owner" or "admin")
app.get('/api/role', (req, res) => {
  const settings = getSettings();
  res.type('text/plain').send(settings.installRole === 'admin' ? 'admin' : 'owner');
});

// System status for the platform admin console
app.get('/api/system', (req, res) => {
  const settings = getSettings();
  res.json({
    ok: true,
    version: '2.0.0',
    installRole: settings.installRole === 'admin' ? 'admin' : 'owner',
    platformUsername: settings.platformUsername || 'admin',
    publicUrl: settings.publicUrl || '',
    localIp: getLocalIp(),
    port: PORT,
    tunnelActive: !!activeTunnelProc,
    tunnelBinary: fs.existsSync(path.join(__dirname, 'cloudflared.exe')),
    activeShopId: settings.shopId || '',
    activeShopName: settings.shopName || '',
    shopCount: getShops().length,
    orderCount: getOrders().length,
    uptimeSeconds: Math.round(process.uptime()),
    platform: process.platform,
    nodeVersion: process.version
  });
});

// Platform Admin Login (admin console only)
app.post('/api/admin/login', (req, res) => {
  const { username = '', password = '' } = req.body;
  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();
  const settings = ensureSettingsShape();
  const validUser = process.env.ADMIN_USERNAME || settings.platformUsername || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || settings.platformPassword || '1234';

  if (
    cleanUser.toLowerCase() === validUser.toLowerCase() &&
    cleanPass === validPass
  ) {
    const token = jwt.sign({ role: 'admin', username: cleanUser }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ success: true, role: 'admin', token });
  }

  return res.status(401).json({ error: 'Invalid platform admin credentials' });
});

// Owner Signup (cloud portal) - creates a shop + owner account
app.post('/api/owner/signup', async (req, res) => {
  try {
    const { shopName, username, password, phone = '', address = '', upiId = '', bwRate = 3, colorRate = 10 } = req.body;
    if (!shopName || !username || !password) {
      return res.status(400).json({ error: 'shopName, username and password are required' });
    }
    const users = getUsers();
    if (users.find(u => u.username.toLowerCase() === String(username).trim().toLowerCase())) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const namePart = String(shopName).replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
    const shopId = `QP_${namePart}_${Math.floor(100 + Math.random() * 900)}`;
    const hashed = await bcrypt.hash(String(password), 10);

    const shop = {
      shopId,
      shopName: String(shopName).trim(),
      username: String(username).trim(),
      password: hashed,
      phone: String(phone).trim(),
      address: String(address).trim(),
      upiId: String(upiId).trim() || `${namePart.toLowerCase()}@upi`,
      upiName: String(shopName).trim(),
      pricing: {
        bwPerA4Page: parseFloat(bwRate) || 3,
        colorPerA4Page: parseFloat(colorRate) || 10,
        duplexDiscountPercent: 15,
        legalSurcharge: 2,
        a3Multiplier: 2.5
      },
      shopOpen: true,
      autoPrintEnabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const shops = getShops();
    shops.push(shop);
    saveShops(shops);

    const user = {
      id: uuidv4(),
      username: String(username).trim(),
      password: hashed,
      shopId,
      role: 'owner',
      createdAt: new Date().toISOString()
    };
    users.push(user);
    saveUsers(users);

    const token = jwt.sign({ userId: user.id, shopId, role: 'owner', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, shop: getShopSettings(shopId) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

// Shop Owner Login (owner console only)
// Shop Owner Login (owner console only)
app.post('/api/owner/login', async (req, res) => {
  const { username = '', password = '' } = req.body;
  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === cleanUser.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });

  const ok = await bcrypt.compare(cleanPass, user.password);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });

  const shop = getShopSettings(user.shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const token = jwt.sign({ userId: user.id, shopId: user.shopId, role: 'owner', username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ success: true, role: 'owner', token, shop });
});
// Admin Password / PIN Verification (Legacy fallback)
app.post(['/api/admin/verify-pin', '/api/admin/verify-password'], (req, res) => {
  const { pin, password, username } = req.body;
  const input = (password !== undefined ? password : pin) || '';
  const settings = getSettings();
  const validPassword = settings.adminPassword || settings.adminPin || '1234';
  const validUsername = settings.adminUsername || 'admin';

  if (username && String(username).toLowerCase() !== validUsername.toLowerCase()) {
    // Check registered shops
    const shops = getShops();
    const matched = shops.find(s => s.username && s.username.toLowerCase() === String(username).toLowerCase());
    if (matched && matched.password === input) {
      return res.json({ success: true });
    }
  }

  if (input === validPassword) {
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Incorrect Admin Password' });
});

// Register New Shop (Auto ID Generation)
app.post('/api/shops/register', (req, res) => {
  try {
    const {
      shopName,
      username,
      password,
      phone = '',
      upiId = '',
      bwRate = 3,
      colorRate = 10,
      address = ''
    } = req.body;

    if (!shopName || !shopName.trim()) {
      return res.status(400).json({ error: 'Shop Name is required / கடையின் பெயர் தேவை' });
    }

    const cleanName = shopName.trim();
    // Auto-generate clean unique Shop ID: e.g. QP_HASULOTS_714
    const namePart = cleanName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
    const randSuffix = Math.floor(100 + Math.random() * 900);
    const generatedShopId = `QP_${namePart}_${randSuffix}`;

    const newShop = {
      shopId: generatedShopId,
      shopName: cleanName,
      username: (username && username.trim()) || namePart.toLowerCase(),
      password: (password && password.trim()) || '1234',
      phone: phone.trim(),
      upiId: upiId.trim() || `${namePart.toLowerCase()}@upi`,
      upiName: cleanName,
      address: address.trim(),
      pricing: {
        bwPerA4Page: parseFloat(bwRate) || 3,
        colorPerA4Page: parseFloat(colorRate) || 10,
        duplexDiscountPercent: 15,
        legalSurcharge: 2,
        a3Multiplier: 2.5
      },
      createdAt: new Date().toISOString()
    };

    // Save to shops list
    const shops = getShops();
    shops.push(newShop);
    saveShops(shops);

    // Make this the active shop in settings.json
    const current = getSettings();
    const updatedSettings = {
      ...current,
      shopId: newShop.shopId,
      shopName: newShop.shopName,
      adminUsername: newShop.username,
      adminPassword: newShop.password,
      shopPhone: newShop.phone,
      shopAddress: newShop.address,
      upiId: newShop.upiId,
      upiName: newShop.shopName,
      pricing: { ...current.pricing, ...newShop.pricing }
    };
    saveSettings(updatedSettings);

    broadcast({ type: 'SETTINGS_UPDATED', settings: updatedSettings });
    console.log(`🎉 Registered new shop: ${newShop.shopName} (${newShop.shopId})`);

    res.json({ success: true, shop: newShop });
  } catch (err) {
    console.error('Shop registration error:', err);
    res.status(500).json({ error: err.message || 'Failed to register shop' });
  }
});

// List all shops
app.get('/api/shops', (req, res) => {
  const shops = getShops();
  const settings = getSettings();
  res.json({ shops, activeShopId: settings.shopId || '' });
});

// Activate a shop (platform admin action)
app.post('/api/shops/:shopId/activate', (req, res) => {
  const shops = getShops();
  const shop = shops.find(s => s.shopId === req.params.shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });

  const current = getSettings();
  const updated = {
    ...current,
    shopId: shop.shopId,
    shopName: shop.shopName,
    adminUsername: shop.username,
    adminPassword: shop.password,
    shopPhone: shop.phone || '',
    shopAddress: shop.address || '',
    upiId: shop.upiId || current.upiId,
    upiName: shop.shopName,
    pricing: { ...current.pricing, ...(shop.pricing || {}) }
  };
  saveSettings(updated);
  broadcast({ type: 'SETTINGS_UPDATED', settings: updated });
  res.json({ success: true, shop: updated });
});

// Update Shop Settings
app.post('/api/settings', async (req, res) => {
  const shopId = req.body.shopId || req.query.shopId || req.headers['x-shop-id'];
  if (!shopId) return res.status(400).json({ error: 'shopId is required' });

  const current = getShopSettings(shopId);
  if (!current) return res.status(404).json({ error: 'Shop not found' });

  const incoming = { ...req.body };
  delete incoming.shopId;

  const pricingPatch = incoming.pricing || {};
  const updated = saveShopSettings(shopId, {
    shopName: incoming.shopName !== undefined ? incoming.shopName : current.shopName,
    phone: incoming.shopPhone !== undefined ? incoming.shopPhone : current.shopPhone,
    address: incoming.shopAddress !== undefined ? incoming.shopAddress : current.shopAddress,
    upiId: incoming.upiId !== undefined ? incoming.upiId : current.upiId,
    pricing: { ...current.pricing, ...pricingPatch },
    shopOpen: incoming.shopOpen !== undefined ? incoming.shopOpen : current.shopOpen,
    autoPrintEnabled: incoming.autoPrintEnabled !== undefined ? incoming.autoPrintEnabled : current.autoPrintEnabled,
    selectedBwPrinter: incoming.selectedBwPrinter !== undefined ? incoming.selectedBwPrinter : current.selectedBwPrinter,
    selectedColorPrinter: incoming.selectedColorPrinter !== undefined ? incoming.selectedColorPrinter : current.selectedColorPrinter
  });

  // Optional password change from the owner console: hash it and update users.json
  // so the next login uses the new password.
  const newPassword = incoming.adminPassword ? String(incoming.adminPassword).trim() : '';
  if (newPassword) {
    const hash = await bcrypt.hash(newPassword, 10);
    const users = getUsers();
    const userRec = users.find(u => u.shopId === shopId);
    if (userRec) {
      userRec.password = hash;
      saveUsers(users);
    }
    const shops = getShops();
    const shopRec = shops.find(s => s.shopId === shopId);
    if (shopRec) {
      shopRec.password = hash;
      saveShops(shops);
    }
  }

  broadcast({ type: 'SETTINGS_UPDATED', shopId, settings: updated });
  res.json({ success: true, settings: updated });
});

// File Upload Endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const shopId = req.body.shopId || req.query.shopId || req.headers['x-shop-id'];
    const settings = shopId ? getShopSettings(shopId) : getSettings();
    if (!settings) return res.status(404).json({ error: 'Shop not found' });
    if (settings.shopOpen === false) {
      return res.status(403).json({ error: 'Shop is currently closed. Will reopen tomorrow morning at 9:00 AM.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileData = {
      fileId: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      pageCount: await detectPageCount(req.file.path, ext),
      ext: ext,
      url: `/uploads/${req.file.filename}`
    };

    // Word / text files are converted to PDF so they can be previewed
    // in the browser and printed without the customer downloading them.
    if (ext === '.doc' || ext === '.docx') {
      const pdfName = req.file.filename.replace(/\.[^.]+$/, '') + '.pdf';
      const pdfPath = path.join(UPLOADS_DIR, pdfName);
      try {
        await queueWordConversion(req.file.path, pdfPath);
        fileData = {
          fileId: pdfName,
          originalName: req.file.originalname,
          mimeType: 'application/pdf',
          size: fs.statSync(pdfPath).size,
          pageCount: await detectPageCount(pdfPath, '.pdf'),
          ext: '.pdf',
          convertedFrom: ext,
          url: `/uploads/${pdfName}`
        };
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      } catch (convErr) {
        console.warn('Word conversion failed:', convErr.message);
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(422).json({
          error: 'Word file could not be previewed. Save it as PDF and upload again / Word கோப்பை PDF ஆக சேமித்து பதிவேற்றவும்.'
        });
      }
    } else if (ext === '.txt') {
      const pdfName = req.file.filename.replace(/\.[^.]+$/, '') + '.pdf';
      const pdfPath = path.join(UPLOADS_DIR, pdfName);
      try {
        await convertTextToPdf(req.file.path, pdfPath);
        fileData = {
          fileId: pdfName,
          originalName: req.file.originalname,
          mimeType: 'application/pdf',
          size: fs.statSync(pdfPath).size,
          pageCount: await detectPageCount(pdfPath, '.pdf'),
          ext: '.pdf',
          convertedFrom: ext,
          url: `/uploads/${pdfName}`
        };
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      } catch (txtErr) {
        console.warn('Text conversion failed:', txtErr.message);
      }
    }

    res.json({ success: true, file: fileData });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'File upload failed' });
  }
});

// Create Print Order
app.post('/api/orders', async (req, res) => {
  try {
    const shopId = req.body.shopId || req.query.shopId || req.headers['x-shop-id'];
    const settings = shopId ? getShopSettings(shopId) : getSettings();
    if (!settings) return res.status(404).json({ error: 'Shop not found' });
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
      customerPhone = '',
      paymentMethod = 'upi'   // 'upi' or 'cash'
    } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const effectivePages = parseInt(pageCount, 10) || 1;
    const numCopies = parseInt(copies, 10) || 1;

    // If the customer selected specific pages, build a PDF containing only
    // those pages so the owner never prints the whole document by mistake.
    let printFileId = null;
    let printFileUrl = null;
    try {
      const trimmed = await createSelectedPagesPdf(fileId, pageRange);
      if (trimmed) {
        printFileId = trimmed.fileId;
        printFileUrl = `/uploads/${trimmed.fileId}`;
      }
    } catch (trimErr) {
      console.warn('Could not build selected-pages PDF:', trimErr.message);
    }

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
    const upiUrl = `upi://pay?pa=${settings.upiId}&pn=${encodeURIComponent(settings.upiName)}&am=${totalAmount}&cu=INR&tn=${upiNote}`;

    const newOrder = {
      id: orderId,
      token: orderToken,
      shopId: shopId || null,
      fileId,
      originalName: originalName || fileId,
      fileUrl: printFileUrl || `/uploads/${fileId}`,
      printFileId,
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
      paymentStatus: 'pending', // 'pending' | 'claimed' | 'paid' | 'rejected'
      paymentTxnId: null,
      paymentMethod: paymentMethod === 'cash' ? 'cash' : 'upi',
      status: 'pending_payment', // 'pending_payment' | 'awaiting_verification' | 'queued' | 'printing' | 'completed' | 'rejected'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const orders = getOrders();
    orders.unshift(newOrder);
    saveOrders(orders);

    // Notify connected Admin dashboards
    broadcast({ type: 'ORDER_CREATED', order: newOrder });

    res.json({ success: true, order: newOrder });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// Get All Orders (Admin)
app.get('/api/orders', (req, res) => {
  const shopId = req.query.shopId || req.headers['x-shop-id'];
  const orders = getOrders(shopId);
  res.json({ orders });
});

// Get Single Order (Status polling / websocket tracking)
app.get('/api/orders/:id', (req, res) => {
  const orders = getOrders();
  const order = orders.find(o => o.id === req.params.id || o.token === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

// Send a verified order to the physical printer when auto-print is on.
function dispatchAutoPrint(order) {
  const settings = getSettings();
  if (!settings.autoPrintEnabled) return;

  const fileName = order.printFileId || order.fileId;
  const filePath = path.join(UPLOADS_DIR, fileName);
  if (!fs.existsSync(filePath)) return;

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

// Customer says "I have paid" -> mark payment as claimed, owner verifies it.
app.post('/api/orders/:id/claim-payment', (req, res) => {
  const { txnId = '', method = 'upi', note = '' } = req.body;

  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === req.params.id || o.token === req.params.id);
  if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });

  const order = orders[orderIndex];
  if (order.paymentStatus === 'paid') {
    return res.json({ success: true, order });
  }

  order.paymentStatus = 'claimed';
  order.status = 'awaiting_verification';
  order.paymentMethod = method === 'cash' ? 'cash' : (order.paymentMethod || 'upi');
  order.paymentTxnId = String(txnId || '').trim() || order.paymentTxnId || null;
  order.paymentClaimedAt = new Date().toISOString();
  if (note) order.paymentNote = String(note).trim();
  order.updatedAt = new Date().toISOString();

  saveOrders(orders);
  broadcast({ type: 'ORDER_PAYMENT_CLAIMED', order });
  res.json({ success: true, order });
});

// Owner verifies the payment (print) or rejects it (payment not received).
app.post('/api/orders/:id/verify', (req, res) => {
  const { verified = true, reason = '', method } = req.body;

  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === req.params.id || o.token === req.params.id);
  if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });

  const order = orders[orderIndex];
  const now = new Date().toISOString();

  if (verified) {
    order.paymentStatus = 'paid';
    order.status = 'queued';
    order.paymentVerifiedAt = now;
    order.paymentVerifiedBy = 'shop_counter';
    if (method) order.paymentMethod = method === 'cash' ? 'cash' : 'upi';
    if (!order.paymentTxnId) {
      order.paymentTxnId = order.paymentMethod === 'cash'
        ? `CASH-${Date.now()}`
        : `UPI-TXN-${Date.now()}`;
    }
    order.paidAt = now;
    order.rejectionReason = null;
    order.updatedAt = now;

    saveOrders(orders);
    broadcast({ type: 'ORDER_PAID', order });
    dispatchAutoPrint(order);
    return res.json({ success: true, order });
  }

  order.paymentStatus = 'rejected';
  order.status = 'rejected';
  order.rejectionReason = String(reason || 'Payment not received at counter').trim();
  order.rejectedAt = now;
  order.updatedAt = now;

  saveOrders(orders);
  broadcast({ type: 'ORDER_REJECTED', order });
  broadcast({ type: 'ORDER_STATUS_CHANGED', order });
  res.json({ success: true, order });
});

// Pay / Confirm Order Payment (legacy endpoint, now goes through verification)
app.post('/api/orders/:id/pay', (req, res) => {
  const { txnId = '' } = req.body;
  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === req.params.id || o.token === req.params.id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = orders[orderIndex];
  order.paymentStatus = 'paid';
  order.status = 'queued';
  order.paymentTxnId = txnId || order.paymentTxnId || `UPI-TXN-${Date.now()}`;
  order.paymentVerifiedAt = new Date().toISOString();
  order.paymentVerifiedBy = 'api';
  order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();

  saveOrders(orders);
  broadcast({ type: 'ORDER_PAID', order });
  dispatchAutoPrint(order);

  res.json({ success: true, order });
});

// Update Order Status (Admin action: Printing, Completed, etc.)
app.post('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending_payment', 'awaiting_verification', 'queued', 'printing', 'completed', 'cancelled', 'rejected'];
  
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === req.params.id || o.token === req.params.id);

  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  orders[orderIndex].status = status;
  orders[orderIndex].updatedAt = new Date().toISOString();

  saveOrders(orders);

  broadcast({ type: 'ORDER_STATUS_CHANGED', order: orders[orderIndex] });

  res.json({ success: true, order: orders[orderIndex] });
});

// Delete Order (Admin action)
app.delete('/api/orders/:id', (req, res) => {
  let orders = getOrders();
  const order = orders.find(o => o.id === req.params.id);
  if (order) {
    const files = [order.fileId, order.printFileId].filter(Boolean);
    for (const name of new Set(files)) {
      const filePath = path.join(UPLOADS_DIR, name);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }
  }
  orders = orders.filter(o => o.id !== req.params.id);
  saveOrders(orders);
  broadcast({ type: 'ORDER_DELETED', orderId: req.params.id });
  res.json({ success: true });
});

// Generate dynamic QR Code Image (Data URL)
// Generate dynamic QR Code Image (Data URL or PNG Image)
app.get('/api/qr', async (req, res) => {
  try {
    const settings = getSettings();
    const defaultUrl = settings.publicUrl ? `${settings.publicUrl}/order` : `http://${getLocalIp()}:${PORT}/order`;
    const text = req.query.text || defaultUrl;
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
app.post('/api/tunnel/restart', (req, res) => {
  startCloudflaredTunnel();
  res.json({ success: true, message: 'Restarting tunnel' });
});

// WebSocket Connection Management
wss.on('connection', (ws) => {
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

// ============================================================
// Print Agent API (cloud -> local shop printer)
// ============================================================
// Register a print agent for a shop
app.post('/api/agent/register', (req, res) => {
  const { shopId, agentName = 'Counter PC' } = req.body;
  if (!shopId) return res.status(400).json({ error: 'shopId required' });

  // Only the logged-in owner of this shop may create/rotate its agent token.
  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let claims = null;
  try { claims = jwt.verify(bearer, JWT_SECRET); } catch (e) {}
  if (!claims || claims.role !== 'owner' || claims.shopId !== shopId) {
    return res.status(401).json({ error: 'Owner login required' });
  }

  // One agent per shop: rotating the token keeps the shopId unique.
  const agents = getAgents();
  const existing = agents.find(a => a.shopId === shopId);
  const token = uuidv4();
  if (existing) {
    existing.token = token;
    existing.name = agentName;
    existing.lastSeen = new Date().toISOString();
    saveAgents(agents);
    return res.json({ success: true, agentId: existing.id, agentToken: token, rotated: true });
  }

  const agent = { id: uuidv4(), shopId, name: agentName, token, createdAt: new Date().toISOString(), lastSeen: new Date().toISOString() };
  agents.push(agent);
  saveAgents(agents);
  res.json({ success: true, agentId: agent.id, agentToken: token });
});

// Auth middleware for agent
function agentAuth(req, res, next) {
  const token = req.headers['x-agent-token'] || req.query.token;
  const agents = getAgents();
  const agent = agents.find(a => a.token === token);
  if (!agent) return res.status(401).json({ error: 'Invalid agent token' });
  agent.lastSeen = new Date().toISOString();
  saveAgents(agents);
  req.agent = agent;
  next();
}

// List print-ready jobs for this shop's agent
app.get('/api/agent/jobs', agentAuth, (req, res) => {
  const shopId = req.agent.shopId;
  const orders = getOrders(shopId);
  const jobs = orders.filter(o => o.paymentStatus === 'paid' && (o.status === 'queued' || o.status === 'printing') && !o.printedAt);
  res.json({ jobs });
});

// Mark a job as printed
app.post('/api/agent/jobs/:id/done', agentAuth, (req, res) => {
  const orders = getOrders(); // all
  const idx = orders.findIndex(o => o.id === req.params.id || o.token === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  if (orders[idx].shopId !== req.agent.shopId) return res.status(403).json({ error: 'Forbidden' });
  orders[idx].status = 'completed';
  orders[idx].printedAt = new Date().toISOString();
  orders[idx].updatedAt = new Date().toISOString();
  saveOrders(orders);
  broadcast({ type: 'ORDER_STATUS_CHANGED', order: orders[idx] });
  res.json({ success: true, order: orders[idx] });
});

// Agent could not print (printer offline, bad file, ...)
app.post('/api/agent/jobs/:id/fail', agentAuth, (req, res) => {
  const orders = getOrders();
  const idx = orders.findIndex(o => o.id === req.params.id || o.token === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });
  if (orders[idx].shopId !== req.agent.shopId) return res.status(403).json({ error: 'Forbidden' });

  orders[idx].status = 'print_failed';
  orders[idx].printError = String(req.body.error || 'Print failed').slice(0, 300);
  orders[idx].updatedAt = new Date().toISOString();
  saveOrders(orders);
  broadcast({ type: 'ORDER_STATUS_CHANGED', order: orders[idx] });
  res.json({ success: true, order: orders[idx] });
});

// Start Server

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  const role = getSettings().installRole === 'admin' ? 'admin' : 'owner';
  console.log(`====================================================`);
  console.log(`🚀 QuickPrint QR Server is Running!`);
  console.log(`📱 Customer Mobile URL: http://${localIp}:${PORT}/order`);
  console.log(`💻 Local Test URL:     http://localhost:${PORT}`);
  console.log(`🏪 Shop Owner Console:  http://localhost:${PORT}/owner`);
  console.log(`🛡️  Platform Admin:     http://localhost:${PORT}/admin`);
  console.log(`🖨️  Counter Standee:     http://localhost:${PORT}/standee.html`);
  console.log(`🎭 Installed role:      ${role}`);
  console.log(`====================================================`);

  // Start public internet tunnel automatically (unless disabled for tests)
  if (process.env.ENABLE_TUNNEL !== '1') {
    console.log('Tunnel disabled (cloud mode).');
  } else {
    startCloudflaredTunnel();
  }
  if (false) {
    console.log('ℹ️ Public tunnel disabled (QUICKPRINT_NO_TUNNEL=1).');
  }
});
