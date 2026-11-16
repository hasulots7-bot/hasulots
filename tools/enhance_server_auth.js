const fs = require('fs');

let serverJs = fs.readFileSync('server.js', 'utf8');

// 1. Add SHOPS_FILE and shops helper functions
const oldFilesDef = `const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');`;

const newFilesDef = `const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');

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
}`;

if (!serverJs.includes('const SHOPS_FILE')) {
  serverJs = serverJs.replace(oldFilesDef, newFilesDef);
}

// 2. Add /api/admin/login and /api/shops/register and /api/shops
const oldVerifyPwd = `// Admin Password / PIN Verification
app.post(['/api/admin/verify-pin', '/api/admin/verify-password'], (req, res) => {
  const { pin, password } = req.body;
  const input = (password !== undefined ? password : pin) || '';
  const settings = getSettings();
  const validPassword = settings.adminPassword || settings.adminPin || '1234';
  if (input === validPassword) {
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Incorrect Admin Password' });
});`;

const newAuthRoutes = `// Admin & Shop Login (Username & Password)
app.post('/api/admin/login', (req, res) => {
  const { username = '', password = '' } = req.body;
  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();
  const settings = getSettings();
  const validUser = settings.adminUsername || 'admin';
  const validPass = settings.adminPassword || settings.adminPin || '1234';

  // 1. Check active kiosk admin credentials
  if (
    (cleanUser.toLowerCase() === validUser.toLowerCase() || cleanUser === 'admin' || !cleanUser) &&
    cleanPass === validPass
  ) {
    return res.json({ success: true, shop: settings });
  }

  // 2. Check registered shops list
  const shops = getShops();
  const matchedShop = shops.find(s => 
    (s.username && s.username.toLowerCase() === cleanUser.toLowerCase()) && 
    (s.password === cleanPass)
  );

  if (matchedShop) {
    // Switch active shop settings to this shop
    const current = getSettings();
    const updated = {
      ...current,
      shopId: matchedShop.shopId,
      shopName: matchedShop.shopName,
      adminUsername: matchedShop.username,
      adminPassword: matchedShop.password,
      shopPhone: matchedShop.phone || current.shopPhone,
      upiId: matchedShop.upiId || current.upiId,
      upiName: matchedShop.shopName,
      pricing: { ...current.pricing, ...(matchedShop.pricing || {}) }
    };
    saveSettings(updated);
    broadcast({ type: 'SETTINGS_UPDATED', settings: updated });
    return res.json({ success: true, shop: updated });
  }

  return res.status(401).json({ error: 'Invalid Username or Password / தவறான கடவுச்சொல்' });
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
    const generatedShopId = \`QP_\${namePart}_\${randSuffix}\`;

    const newShop = {
      shopId: generatedShopId,
      shopName: cleanName,
      username: (username && username.trim()) || namePart.toLowerCase(),
      password: (password && password.trim()) || '1234',
      phone: phone.trim(),
      upiId: upiId.trim() || \`\${namePart.toLowerCase()}@upi\`,
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
    console.log(\`🎉 Registered new shop: \${newShop.shopName} (\${newShop.shopId})\`);

    res.json({ success: true, shop: newShop });
  } catch (err) {
    console.error('Shop registration error:', err);
    res.status(500).json({ error: err.message || 'Failed to register shop' });
  }
});

// List all shops
app.get('/api/shops', (req, res) => {
  const shops = getShops();
  res.json({ shops });
});`;

serverJs = serverJs.replace(oldVerifyPwd, newAuthRoutes);

fs.writeFileSync('server.js', serverJs, 'utf8');
console.log('server.js updated with shop registration and auth');
