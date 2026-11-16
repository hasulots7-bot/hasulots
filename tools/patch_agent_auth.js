const fs = require('fs');

let agentJs = fs.readFileSync('public/agent.js', 'utf8');

// Replace verifyPasswordSubmit and add switchLoginTab, onRegisterNameInput, generateRandomShopId, submitShopRegistration, verifyLoginSubmit
const oldAuthBlock = `async function verifyPasswordSubmit() {
  const inp = document.getElementById('admin-password-input');
  const pwd = inp ? inp.value.trim() : '';
  if (!pwd) {
    showPasswordError('Please enter password');
    return;
  }

  const btn = document.getElementById('btn-submit-pwd');
  if (btn) btn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/admin/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd, pin: pwd })
    });

    if (res.ok) {
      sessionStorage.setItem('qp_admin_auth', 'true');
      unlockDashboard();
    } else {
      showPasswordError('Incorrect Password. Default is 1234.');
    }
  } catch (err) {
    if (pwd === '1234') {
      sessionStorage.setItem('qp_admin_auth', 'true');
      unlockDashboard();
    } else {
      showPasswordError('Incorrect Password');
    }
  } finally {
    if (btn) btn.textContent = 'Unlock Dashboard / உள்நுழைக';
  }
}`;

const newAuthBlock = `// Tab Switch between Login & Register
function switchLoginTab(tab) {
  const loginForm = document.getElementById('login-view-form');
  const regForm = document.getElementById('register-view-form');
  const tabLogin = document.getElementById('tab-btn-login');
  const tabReg = document.getElementById('tab-btn-register');

  hidePasswordError();

  if (tab === 'register') {
    if (loginForm) loginForm.classList.add('hidden');
    if (regForm) regForm.classList.remove('hidden');
    if (tabLogin) tabLogin.className = 'flex-1 py-1.5 px-3 rounded-lg text-slate-500 hover:text-slate-800 transition';
    if (tabReg) tabReg.className = 'flex-1 py-1.5 px-3 rounded-lg bg-white text-slate-800 shadow-2xs transition';
    // Generate initial Shop ID if empty
    const sId = document.getElementById('reg-shop-id');
    if (sId && !sId.value) generateRandomShopId();
  } else {
    if (regForm) regForm.classList.add('hidden');
    if (loginForm) loginForm.classList.remove('hidden');
    if (tabReg) tabReg.className = 'flex-1 py-1.5 px-3 rounded-lg text-slate-500 hover:text-slate-800 transition';
    if (tabLogin) tabLogin.className = 'flex-1 py-1.5 px-3 rounded-lg bg-white text-slate-800 shadow-2xs transition';
  }
}

function onRegisterNameInput(name) {
  const clean = (name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
  const idEl = document.getElementById('reg-shop-id');
  const userEl = document.getElementById('reg-username');
  const upiEl = document.getElementById('reg-upi-id');
  if (idEl) {
    const prev = idEl.value;
    const suffix = prev.includes('_') ? prev.split('_').pop() : Math.floor(100 + Math.random() * 900);
    idEl.value = clean ? \`QP_\${clean}_\${suffix}\` : \`QP_SHOP_\${suffix}\`;
  }
  if (userEl && (!userEl.value || userEl.value === 'admin')) {
    userEl.value = clean.toLowerCase();
  }
  if (upiEl && (!upiEl.value || upiEl.value.includes('@'))) {
    upiEl.value = clean ? \`\${clean.toLowerCase()}@upi\` : 'shop@upi';
  }
}

function generateRandomShopId() {
  const nameEl = document.getElementById('reg-shop-name');
  const clean = ((nameEl ? nameEl.value : '') || 'SHOP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
  const rand = Math.floor(100 + Math.random() * 900);
  const idEl = document.getElementById('reg-shop-id');
  if (idEl) idEl.value = \`QP_\${clean}_\${rand}\`;
}

async function submitShopRegistration() {
  const name = document.getElementById('reg-shop-name')?.value.trim();
  const username = document.getElementById('reg-username')?.value.trim();
  const password = document.getElementById('reg-password')?.value.trim();
  const phone = document.getElementById('reg-phone')?.value.trim();
  const upiId = document.getElementById('reg-upi-id')?.value.trim();
  const bwRate = parseFloat(document.getElementById('reg-bw-rate')?.value) || 3;
  const colorRate = parseFloat(document.getElementById('reg-color-rate')?.value) || 10;
  const regErr = document.getElementById('reg-error-msg');

  if (!name) {
    if (regErr) {
      regErr.textContent = 'Please enter Shop Name / கடையின் பெயரை உள்ளிடவும்';
      regErr.style.opacity = '1';
    }
    return;
  }

  try {
    const res = await fetch('/api/shops/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName: name,
        username: username || name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
        password: password || '1234',
        phone,
        upiId,
        bwRate,
        colorRate
      })
    });

    if (res.ok) {
      const data = await res.json();
      sessionStorage.setItem('qp_admin_auth', 'true');
      unlockDashboard();
      await fetchSettings();
      await fetchOrders();
      await renderCornerQrCode();
    } else {
      const err = await res.json().catch(() => ({}));
      if (regErr) {
        regErr.textContent = err.error || 'Registration failed';
        regErr.style.opacity = '1';
      }
    }
  } catch (err) {
    if (regErr) {
      regErr.textContent = 'Error: ' + err.message;
      regErr.style.opacity = '1';
    }
  }
}

async function verifyLoginSubmit() {
  const userInp = document.getElementById('admin-username-input');
  const passInp = document.getElementById('admin-password-input');
  const username = userInp ? userInp.value.trim() : 'admin';
  const password = passInp ? passInp.value.trim() : '';

  if (!password) {
    showPasswordError('Please enter password / கடவுச்சொல்லை உள்ளிடவும்');
    return;
  }

  const btn = document.getElementById('btn-submit-pwd');
  if (btn) btn.textContent = 'Verifying...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      sessionStorage.setItem('qp_admin_auth', 'true');
      unlockDashboard();
      await fetchSettings();
      await fetchOrders();
    } else {
      const errData = await res.json().catch(() => ({}));
      showPasswordError(errData.error || 'Incorrect Username or Password');
    }
  } catch (err) {
    if (password === '1234') {
      sessionStorage.setItem('qp_admin_auth', 'true');
      unlockDashboard();
    } else {
      showPasswordError('Incorrect Password');
    }
  } finally {
    if (btn) btn.textContent = 'Unlock Dashboard / உள்நுழைக →';
  }
}

const verifyPasswordSubmit = verifyLoginSubmit;`;

agentJs = agentJs.replace(oldAuthBlock, newAuthBlock);

// Replace old Edit Shop Modal Handlers with openShopConfigModal, closeShopConfigModal, saveShopConfig, autoGenerateModalShopId
const oldModalBlock = `  // Edit Shop Modal Handlers
  const btnEdit = document.getElementById('btn-edit-shop-info');
  const modal = document.getElementById('modal-shop-config');
  const btnClose = document.getElementById('btn-close-modal');
  const btnCancel = document.getElementById('btn-cancel-modal');
  const btnSave = document.getElementById('btn-save-modal');

  if (btnEdit && modal) {
    btnEdit.addEventListener('click', () => {
      const s = agentState.settings;
      if (s) {
        document.getElementById('modal-shop-name').value = s.shopName || '';
        document.getElementById('modal-upi-id').value = s.upiId || '';
        document.getElementById('modal-bw-rate').value = s.pricing?.bwPerA4Page || 3;
        document.getElementById('modal-color-rate').value = s.pricing?.colorPerA4Page || 10;
      }
      modal.classList.remove('hidden');
    });

    const closeModal = () => modal.classList.add('hidden');
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        const payload = {
          shopName: document.getElementById('modal-shop-name').value.trim(),
          upiId: document.getElementById('modal-upi-id').value.trim(),
          pricing: {
            bwPerA4Page: parseFloat(document.getElementById('modal-bw-rate').value) || 3,
            colorPerA4Page: parseFloat(document.getElementById('modal-color-rate').value) || 10
          }
        };
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await fetchSettings();
        closeModal();
      });
    }
  }`;

const newModalBlock = `  // Shop Settings Modal Trigger Bindings
  const btnEdit = document.getElementById('btn-edit-shop-info');
  if (btnEdit) btnEdit.addEventListener('click', openShopConfigModal);
  const btnHeadName = document.getElementById('header-shop-name');
  if (btnHeadName) btnHeadName.addEventListener('click', openShopConfigModal);
  const btnOpenSettings = document.getElementById('btn-open-settings');
  if (btnOpenSettings) btnOpenSettings.addEventListener('click', openShopConfigModal);`;

agentJs = agentJs.replace(oldModalBlock, newModalBlock);

// Add the global functions for modal management
const modalFunctions = `
// ============================================================
// 🏪 SHOP SETTINGS & CONFIGURATION MODAL CONTROLLERS
// ============================================================
function openShopConfigModal() {
  const modal = document.getElementById('modal-shop-config');
  if (!modal) return;

  const s = agentState.settings || {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? val : '';
  };

  setVal('modal-shop-name', s.shopName || 'Hasulots technologies');
  setVal('modal-shop-id', s.shopId || 'QP_HASULOTS');
  setVal('modal-shop-phone', s.shopPhone || '+91 98765 43210');
  setVal('modal-shop-address', s.shopAddress || 'Main Road, Opp. Bus Stand');
  setVal('modal-admin-username', s.adminUsername || 'admin');
  setVal('modal-admin-password', s.adminPassword || '1234');
  setVal('modal-upi-id', s.upiId || 'hasulots@upi');
  setVal('modal-upi-name', s.upiName || s.shopName || 'Hasulots technologies');
  setVal('modal-bw-rate', s.pricing?.bwPerA4Page || 3);
  setVal('modal-color-rate', s.pricing?.colorPerA4Page || 10);
  setVal('modal-duplex-discount', s.pricing?.duplexDiscountPercent || 15);

  modal.classList.remove('hidden');
}

function closeShopConfigModal() {
  const modal = document.getElementById('modal-shop-config');
  if (modal) modal.classList.add('hidden');
}

function autoGenerateModalShopId() {
  const nameEl = document.getElementById('modal-shop-name');
  const name = nameEl ? nameEl.value.trim() : '';
  const clean = (name || 'SHOP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
  const rand = Math.floor(100 + Math.random() * 900);
  const idEl = document.getElementById('modal-shop-id');
  if (idEl) idEl.value = \`QP_\${clean}_\${rand}\`;
}

async function saveShopConfig() {
  const getVal = (id) => document.getElementById(id)?.value.trim();

  const payload = {
    shopName: getVal('modal-shop-name') || 'Hasulots technologies',
    shopId: getVal('modal-shop-id') || 'QP_HASULOTS',
    shopPhone: getVal('modal-shop-phone') || '',
    shopAddress: getVal('modal-shop-address') || '',
    adminUsername: getVal('modal-admin-username') || 'admin',
    adminPassword: getVal('modal-admin-password') || '1234',
    upiId: getVal('modal-upi-id') || 'hasulots@upi',
    upiName: getVal('modal-upi-name') || getVal('modal-shop-name') || 'Hasulots technologies',
    pricing: {
      bwPerA4Page: parseFloat(getVal('modal-bw-rate')) || 3,
      colorPerA4Page: parseFloat(getVal('modal-color-rate')) || 10,
      duplexDiscountPercent: parseFloat(getVal('modal-duplex-discount')) || 15
    }
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      await fetchSettings();
      await renderCornerQrCode();
      closeShopConfigModal();
    } else {
      alert('Failed to save settings');
    }
  } catch (err) {
    alert('Error saving settings: ' + err.message);
  }
}

function openNewShopRegistrationFromModal() {
  closeShopConfigModal();
  lockAdminDashboard();
  switchLoginTab('register');
}
`;

if (!agentJs.includes('function openShopConfigModal')) {
  agentJs += modalFunctions;
}

fs.writeFileSync('public/agent.js', agentJs, 'utf8');
console.log('agent.js updated with complete shop auth & modal controllers');
