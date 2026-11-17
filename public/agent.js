// ===== Session shim: sends the shop login token with every /api call =====
(function () {
  const _fetch = window.fetch.bind(window);
  let alerted = false;
  window.fetch = function (input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : ((input && input.url) || ''); } catch (e) {}
    const isApi = url.startsWith('/api/');
    let hadToken = false;
    if (isApi) {
      const t = sessionStorage.getItem('qp_shop_token');
      hadToken = !!t;
      if (t) {
        init = init || {};
        const h = new Headers(init.headers || {});
        if (!h.has('Authorization')) h.set('Authorization', 'Bearer ' + t);
        init.headers = h;
      }
    }
    return _fetch(input, init).then(function (res) {
      if (isApi && hadToken && (res.status === 401 || res.status === 403) && !url.startsWith('/api/admin/login')) {
        res.clone().json().then(function (d) {
          if (d && (d.code === 'LICENSE' || d.code === 'AUTH') && !alerted) {
            alerted = true;
            sessionStorage.removeItem('qp_shop_token');
            sessionStorage.removeItem('qp_admin_auth');
            alert(d.error || 'Please login again');
            location.reload();
          }
        }).catch(function () {});
      }
      return res;
    });
  };
})();

// ============================================================
// 🔔 AUDIO DING & ICON REFRESH HELPERS (Global)
// ============================================================
function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

function refreshIcons() {
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (e) {}
}

window.playDing = playDing;
window.refreshIcons = refreshIcons;

// Global Agent State
const agentState = {
  settings: {},
  printers: [],
  orders: [],
  selectedBwPrinter: '',
  selectedColorPrinter: '',
  filter: 'all',
  shopOpen: true,
  autoPrintPaid: false,
  allowCash: true,
  ws: null
};
window.agentState = agentState;

// QuickPrint Print Agent - High Visibility Script


// Admin Password Auth State
function togglePasswordVisibility() {
  const inp = document.getElementById('admin-password-input');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function showPasswordError(msg, type = 'AUTH') {
  const errEl = document.getElementById('login-error-msg');
  if (errEl) {
    errEl.style.opacity = '1';
    errEl.style.display = 'block';
    if (type === 'LICENSE') {
      errEl.innerHTML = `
        <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:12px 14px;text-align:left;color:#92400e;margin:10px 0;">
          <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-bottom:4px;color:#b45309;">
            <span>⚠️</span> <span>License Expired or Suspended</span>
          </div>
          <p style="font-size:13px;line-height:1.4;margin:0 0 8px;color:#78350f;">${escapeHtml(msg || 'Your shop subscription or demo has ended. Please renew to continue printing.')}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="/#contact" target="_blank" style="display:inline-block;padding:6px 12px;background:#f59e0b;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">Contact Support / WhatsApp</a>
            <button type="button" onclick="verifyLoginSubmit()" style="padding:6px 12px;background:#fef3c7;border:1px solid #d97706;color:#92400e;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Retry</button>
          </div>
        </div>
      `;
    } else if (type === 'UNREACHABLE') {
      errEl.innerHTML = `
        <div style="background:#eef2ff;border:1.5px solid #6366f1;border-radius:12px;padding:12px 14px;text-align:left;color:#3730a3;margin:10px 0;">
          <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-bottom:4px;color:#4338ca;">
            <span>📡</span> <span>Server Unreachable</span>
          </div>
          <p style="font-size:13px;line-height:1.4;margin:0 0 8px;color:#312e81;">${escapeHtml(msg || 'Cannot connect to QuickPrint. Check your Wi-Fi or internet connection.')}</p>
          <button type="button" onclick="verifyLoginSubmit()" style="padding:6px 12px;background:#4f46e5;color:#fff;border:0;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">Retry Connection</button>
        </div>
      `;
    } else {
      errEl.innerHTML = `
        <div style="background:#fef2f2;border:1.5px solid #ef4444;border-radius:12px;padding:12px 14px;text-align:left;color:#991b1b;margin:10px 0;">
          <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-bottom:4px;color:#dc2626;">
            <span>❌</span> <span>Incorrect Password / தவறான கடவுச்சொல்</span>
          </div>
          <p style="font-size:13px;line-height:1.4;margin:0;color:#b91c1c;">${escapeHtml(msg || 'Invalid Username or Password. Please check your credentials created online.')}</p>
        </div>
      `;
    }
  }
  const inp = document.getElementById('admin-password-input');
  if (inp) {
    inp.classList.add('shake-anim');
    setTimeout(() => inp.classList.remove('shake-anim'), 400);
    inp.focus();
  }
}

function hidePasswordError() {
  const errEl = document.getElementById('login-error-msg');
  if (errEl) {
    errEl.innerHTML = '';
    errEl.style.opacity = '0';
  }
}

function ensureRememberMeCheckbox() {
  if (document.getElementById('admin-remember-me')) return;
  const btn = document.getElementById('btn-submit-pwd');
  if (!btn || !btn.parentNode) return;
  const wrap = document.createElement('div');
  wrap.id = 'admin-remember-wrap';
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0 16px;cursor:pointer;';
  wrap.innerHTML = `
    <input type="checkbox" id="admin-remember-me" checked style="width:16px;height:16px;cursor:pointer;accent-color:#4f46e5;">
    <label for="admin-remember-me" style="margin:0;font-size:13px;font-weight:600;color:#334155;cursor:pointer;user-select:none;">
      Remember me on this PC (Auto-login)
    </label>
  `;
  btn.parentNode.insertBefore(wrap, btn);
}

async function loadSavedCredentialsAndAutoLogin() {
  if (!window.qpDesktop || !window.qpDesktop.getSavedCredentials) return;
  try {
    const creds = await window.qpDesktop.getSavedCredentials();
    if (creds && creds.username && creds.password) {
      const uInp = document.getElementById('admin-username-input');
      const pInp = document.getElementById('admin-password-input');
      const rem = document.getElementById('admin-remember-me');
      if (uInp) uInp.value = creds.username;
      if (pInp) pInp.value = creds.password;
      if (rem) rem.checked = true;

      // If we don't have an active token, perform auto-login!
      if (!sessionStorage.getItem('qp_shop_token')) {
        console.log('🔑 Performing auto-login using saved secure credentials...');
        await verifyLoginSubmit({ auto: true });
      }
    }
  } catch (err) {
    console.warn('Failed to load saved credentials:', err);
  }
}

// Tab Switch between Login & Register
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
    idEl.value = clean ? `QP_${clean}_${suffix}` : `QP_SHOP_${suffix}`;
  }
  if (userEl && (!userEl.value || userEl.value === 'admin')) {
    userEl.value = clean.toLowerCase();
  }
  if (upiEl && (!upiEl.value || upiEl.value.includes('@'))) {
    upiEl.value = clean ? `${clean.toLowerCase()}@upi` : 'shop@upi';
  }
}

function generateRandomShopId() {
  const nameEl = document.getElementById('reg-shop-name');
  const clean = ((nameEl ? nameEl.value : '') || 'SHOP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
  const rand = Math.floor(100 + Math.random() * 900);
  const idEl = document.getElementById('reg-shop-id');
  if (idEl) idEl.value = `QP_${clean}_${rand}`;
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

async function verifyLoginSubmit(opts = {}) {
  const userInp = document.getElementById('admin-username-input');
  const passInp = document.getElementById('admin-password-input');
  const username = userInp ? userInp.value.trim() : 'admin';
  const password = passInp ? passInp.value.trim() : '';
  const remChk = document.getElementById('admin-remember-me');
  const remember = remChk ? remChk.checked : true;

  if (!password) {
    showPasswordError('Please enter password / கடவுச்சொல்லை உள்ளிடவும்', 'AUTH');
    return;
  }

  const btn = document.getElementById('btn-submit-pwd');
  if (btn) btn.textContent = opts.auto ? 'Logging in automatically...' : 'Verifying...';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const loginData = await res.json().catch(() => ({}));
      if (loginData.token) sessionStorage.setItem('qp_shop_token', loginData.token);
      sessionStorage.setItem('qp_admin_auth', 'true');

      // Save credentials via Electron safeStorage (DPAPI encrypted, never plain text)
      if (window.qpDesktop && window.qpDesktop.saveCredentials) {
        try {
          await window.qpDesktop.saveCredentials({ username, password, remember });
        } catch (e) {
          console.warn('Failed to save credentials to safeStorage:', e);
        }
      }

      hidePasswordError();
      unlockDashboard();
      if (loginData.license) {
        agentState.license = loginData.license;
        updateHeaderLicenseBadge(loginData.license);
      }
      await fetchSettings();
      await fetchOrders();
      fetchPrinters();
      // On startup/login: print any missed queued orders!
      processMissedQueuedOrders();
    } else {
      const errData = await res.json().catch(() => ({}));
      const code = errData.code;
      if (res.status === 401 || code === 'AUTH') {
        // Wrong password: clear saved credentials if any so bad login doesn't loop
        if (window.qpDesktop && window.qpDesktop.clearSavedCredentials) {
          window.qpDesktop.clearSavedCredentials().catch(() => {});
        }
        showPasswordError(errData.error || 'Invalid Username or Password / தவறான கடவுச்சொல்', 'AUTH');
      } else if (res.status === 403 || code === 'LICENSE') {
        showPasswordError(errData.error || 'QuickPrint shop license expired or suspended. Contact support.', 'LICENSE');
        setTimeout(() => openLicensePlansModal(true), 600);
      } else if (res.status === 429) {
        showPasswordError(errData.error || 'Too many login attempts. Please try again after 15 minutes.', 'AUTH');
      } else {
        showPasswordError(errData.error || 'Login failed. Please check credentials and try again.', 'AUTH');
      }
    }
  } catch (err) {
    console.error('Login error:', err);
    showPasswordError('Cannot reach server. Check internet connection and try again.', 'UNREACHABLE');
  } finally {
    if (btn) btn.textContent = 'Unlock Dashboard / உள்நுழைக →';
  }
}

const verifyPasswordSubmit = verifyLoginSubmit;

function unlockDashboard() {
  const overlay = document.getElementById('admin-login-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
  }
  renderCornerQrCode();
  reconnectWebSocket();   // live orders are per shop: reconnect now that we have the login token
  processMissedQueuedOrders();
}

function lockAdminDashboard() {
  sessionStorage.removeItem('qp_admin_auth');
  sessionStorage.removeItem('qp_shop_token');
  if (window.qpDesktop && window.qpDesktop.clearSavedCredentials) {
    window.qpDesktop.clearSavedCredentials().catch(() => {});
  }
  const inp = document.getElementById('admin-password-input');
  if (inp) inp.value = '';
  hidePasswordError();
  const overlay = document.getElementById('admin-login-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'auto';
    setTimeout(() => { 
      overlay.style.opacity = '1'; 
      if (inp) inp.focus();
    }, 10);
  }
}

function checkAdminAuth() {
  ensureRememberMeCheckbox();
  const overlay = document.getElementById('admin-login-overlay');
  if (!overlay) return;
  if (sessionStorage.getItem('qp_admin_auth') === 'true' && sessionStorage.getItem('qp_shop_token')) {
    overlay.style.display = 'none';
    renderCornerQrCode();
  } else {
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
    const inp = document.getElementById('admin-password-input');
    if (inp) setTimeout(() => inp.focus(), 100);
  }
}

// Render Large Crisp QR Code in Left Corner
let qrMode = 'public'; // 'public' | 'wifi'

async function renderCornerQrCode() {
  const qrBox = document.getElementById('corner-qr-box');
  const modalBox = document.getElementById('fullscreen-qr-container');
  if (!qrBox) return;

  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    if (!info.shopId) {
      qrBox.innerHTML = '<div class="text-xs font-bold text-slate-500 p-2 text-center">Login to see your shop QR</div>';
      return;
    }
    
    // Choose target URL based on qrMode
    let targetUrl;
    const isPublic = qrMode === 'public' && info.baseUrl && info.baseUrl.startsWith('https://');
    if (isPublic) {
      targetUrl = info.orderUrl || `${info.baseUrl}/order`;
    } else {
      targetUrl = `http://${info.localIp}:${info.port}/print/${encodeURIComponent(info.shopId || '')}`;
    }
    if (info.shopId) {
      document.querySelectorAll('a[href^="/standee.html"]').forEach(a => { a.href = '/standee.html?shop=' + encodeURIComponent(info.shopId); });
    }

    // Clear previous
    qrBox.innerHTML = '';
    if (modalBox) modalBox.innerHTML = '';

    // Draw high-res canvas QR code in corner card (165 x 165)
    if (window.QRCode) {
      new QRCode(qrBox, {
        text: targetUrl,
        width: 165,
        height: 165,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });

      if (modalBox) {
        new QRCode(modalBox, {
          text: targetUrl,
          width: 310,
          height: 310,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }
    } else {
      // Fallback to server QR image
      const qrRes = await fetch(`/api/qr?text=${encodeURIComponent(targetUrl)}&width=330`);
      const qrData = await qrRes.json();
      const img = document.createElement('img');
      img.src = qrData.qr;
      img.className = 'w-full h-full object-contain';
      qrBox.appendChild(img);

      if (modalBox) {
        const mImg = document.createElement('img');
        mImg.src = qrData.qr;
        mImg.className = 'w-full h-full object-contain';
        modalBox.appendChild(mImg);
      }
    }

    // Update link & badge in UI
    const urlText = document.getElementById('qr-target-url-text');
    if (urlText) {
      urlText.textContent = targetUrl;
    }

    const badgeEl = document.getElementById('qr-conn-badge');
    if (badgeEl) {
      if (isPublic) {
        badgeEl.textContent = '🟢 Mobile 4G/5G Live';
        badgeEl.className = 'inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 cursor-pointer hover:bg-emerald-100 transition';
        badgeEl.title = 'Active on Cloudflare Public Tunnel (Click to toggle Wi-Fi)';
      } else {
        badgeEl.textContent = '📶 Shop Wi-Fi Mode';
        badgeEl.className = 'inline-flex items-center gap-1 text-xs font-extrabold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200 cursor-pointer hover:bg-amber-100 transition';
        badgeEl.title = 'Active on Local Wi-Fi (Click to toggle Mobile 4G/5G)';
      }
    }
  } catch (err) {
    console.warn('QR render error:', err);
  }
}

function openFullscreenQrModal() {
  const m = document.getElementById('modal-fullscreen-qr');
  if (m) {
    m.classList.remove('hidden');
    renderCornerQrCode();
  }
}

function closeFullscreenQrModal() {
  const m = document.getElementById('modal-fullscreen-qr');
  if (m) m.classList.add('hidden');
}

window.openFullscreenQrModal = openFullscreenQrModal;
window.closeFullscreenQrModal = closeFullscreenQrModal;

function toggleQrMode() {
  qrMode = (qrMode === 'public') ? 'wifi' : 'public';
  renderCornerQrCode();
}

// ============================================================
// 💎 LICENSE, PLANS & WHATSAPP RENEWAL CONTROLLERS
// ============================================================
const PLANS_INFO = {
  demo: { label: 'Trial Version', daysText: '7 Days Demo', price: 0, tag: '⏳ Free Trial', desc: 'Full features for 7 days' },
  monthly: { label: '1 Month Plan', daysText: '30 Days Full Access', price: 299, tag: '📅 Monthly', desc: 'Flexible monthly renewal' },
  yearly: { label: '1 Year Plan', daysText: '365 Days Access', price: 2999, tag: '⭐ Most Popular', desc: 'Save 20% on annual billing' },
  lifetime: { label: 'Lifetime License', daysText: 'Unlimited Days', price: 9999, tag: '💎 One-Time', desc: 'Pay once, use forever' }
};

let selectedLicensePlanKey = 'yearly';
let ownerApprovalPollTimer = null;
let ownerContactInfo = {
  whatsapp: '919999999999',
  upiId: 'enquiry.print@hasulotstechnologies.com',
  upiName: 'Hasulots Technologies',
  businessName: 'Hasulots Technologies'
};

function updateHeaderLicenseBadge(license) {
  license = license || (agentState.settings && agentState.settings.license);
  if (!license) return;
  agentState.license = license;

  const pill = document.getElementById('header-license-pill');
  const dot = document.getElementById('header-license-dot');
  const text = document.getElementById('header-license-text');
  if (!pill || !text) return;

  const plan = license.plan || 'demo';
  const state = license.state || (license.allowed ? 'active' : 'expired');
  const days = license.daysLeft !== null && license.daysLeft !== undefined ? license.daysLeft : null;

  if (state === 'expired' || (days !== null && days <= 0 && plan !== 'lifetime')) {
    pill.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-300 hover:border-rose-400 text-rose-800 text-xs font-black ml-1 transition shadow-2xs cursor-pointer hover:bg-rose-100 animate-pulse';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
    text.textContent = '❌ Trial Expired • Renew Now';
    return;
  }

  if (plan === 'lifetime' || license.lifetime) {
    pill.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 border border-purple-300 hover:border-purple-400 text-purple-900 text-xs font-black ml-1 transition shadow-2xs cursor-pointer hover:bg-purple-100';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-purple-600';
    text.textContent = '💎 Lifetime Plan • Unlimited';
    return;
  }

  if (plan === 'demo') {
    pill.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-300 hover:border-amber-400 text-amber-900 text-xs font-black ml-1 transition shadow-2xs cursor-pointer hover:bg-amber-100';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    text.textContent = `⏳ Trial Version • ${days !== null ? days : 7} days left`;
    return;
  }

  if (plan === 'monthly') {
    pill.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 hover:border-emerald-400 text-emerald-900 text-xs font-black ml-1 transition shadow-2xs cursor-pointer hover:bg-emerald-100';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    text.textContent = `📅 1 Month Plan • ${days !== null ? days : 30} days left`;
    return;
  }

  if (plan === 'yearly') {
    pill.className = 'flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-300 hover:border-indigo-400 text-indigo-900 text-xs font-black ml-1 transition shadow-2xs cursor-pointer hover:bg-indigo-100';
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-indigo-600';
    text.textContent = `⭐ Yearly Plan • ${days !== null ? days : 365} days left`;
    return;
  }
}

async function fetchLicenseInfo() {
  try {
    const res = await fetch('/api/license');
    if (!res.ok) return null;
    const data = await res.json();
    if (data.owner) {
      ownerContactInfo = { ...ownerContactInfo, ...data.owner };
    }
    if (data.license) {
      agentState.license = data.license;
      updateHeaderLicenseBadge(data.license);
    }
    return data;
  } catch (e) {
    return null;
  }
}

function selectLicensePlan(planKey) {
  if (!PLANS_INFO[planKey]) planKey = 'yearly';
  selectedLicensePlanKey = planKey;
  const p = PLANS_INFO[planKey];

  // Highlight selected card
  document.querySelectorAll('#lic-plans-container .plan-card').forEach(card => {
    card.classList.remove('border-indigo-600', 'bg-indigo-50/40', 'ring-2', 'ring-indigo-500');
    card.classList.add('border-slate-200', 'bg-white');
  });

  const activeCard = (window.event && window.event.currentTarget) || document.querySelector(`#lic-plans-container .plan-card:nth-child(${planKey==='demo'?1:planKey==='monthly'?2:planKey==='yearly'?3:4})`);
  if (activeCard) {
    activeCard.classList.remove('border-slate-200', 'bg-white');
    activeCard.classList.add('border-indigo-600', 'bg-indigo-50/40', 'ring-2', 'ring-indigo-500');
  }

  // Update Amount
  const amtEl = document.getElementById('lic-pay-amount-display');
  if (amtEl) {
    amtEl.textContent = p.price === 0 ? '₹0 (Free Trial / Demo)' : `₹${p.price.toLocaleString('en-IN')}`;
  }

  // Draw UPI QR code
  renderOwnerUpiQr(p.price);
}

async function renderOwnerUpiQr(amount) {
  const qrImg = document.getElementById('lic-owner-upi-qr');
  if (!qrImg) return;
  const upiId = ownerContactInfo.upiId || 'enquiry.print@hasulotstechnologies.com';
  const upiName = ownerContactInfo.upiName || 'Hasulots Technologies';
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${amount || 0}&cu=INR&tn=${encodeURIComponent('QuickPrint Shop License')}`;

  try {
    const r = await fetch(`/api/qr?text=${encodeURIComponent(upiUrl)}&width=140`);
    if (r.ok) {
      const d = await r.json();
      qrImg.src = d.qr;
    }
  } catch (e) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(upiUrl)}`;
  }
}

function copyOwnerUpiId() {
  const upiId = ownerContactInfo.upiId || 'enquiry.print@hasulotstechnologies.com';
  navigator.clipboard.writeText(upiId);
  const btn = document.getElementById('btn-copy-upi');
  if (btn) {
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }
}

async function openLicensePlansModal(forceExpired = false) {
  const m = document.getElementById('modal-license-plans');
  if (!m) return;
  m.classList.remove('hidden');

  const closeBtn = document.getElementById('btn-close-license-modal');
  if (closeBtn) closeBtn.style.display = forceExpired ? 'none' : 'flex';

  await fetchLicenseInfo();

  // Populate current status
  const lic = agentState.license || (agentState.settings && agentState.settings.license) || {};
  const planBadge = document.getElementById('lic-badge-plan');
  const daysBadge = document.getElementById('lic-badge-days');
  const expEl = document.getElementById('lic-expiry-text');

  const pKey = lic.plan || 'demo';
  const planInfo = PLANS_INFO[pKey] || PLANS_INFO.demo;
  if (planBadge) planBadge.textContent = planInfo.label;
  
  if (daysBadge) {
    if (lic.lifetime) {
      daysBadge.textContent = 'Unlimited (Lifetime)';
      daysBadge.className = 'text-sm font-black text-purple-700';
    } else if (lic.daysLeft !== null && lic.daysLeft !== undefined) {
      daysBadge.textContent = lic.daysLeft > 0 ? `${lic.daysLeft} Days Pending` : `Expired (${Math.abs(lic.daysLeft)} days ago)`;
      daysBadge.className = lic.daysLeft > 0 ? 'text-sm font-black text-slate-800' : 'text-sm font-black text-rose-600';
    } else {
      daysBadge.textContent = '7 Days Demo';
    }
  }

  if (expEl) {
    expEl.textContent = lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString('en-GB') : (lic.lifetime ? 'Never' : '-');
  }

  // Update Owner UPI
  const upiEl = document.getElementById('lic-owner-upi-id');
  if (upiEl && ownerContactInfo.upiId) upiEl.textContent = ownerContactInfo.upiId;

  // Default select yearly plan
  selectLicensePlan('yearly');
}

function closeLicensePlansModal() {
  const m = document.getElementById('modal-license-plans');
  if (m) m.classList.add('hidden');
  stopOwnerApprovalPolling();
}

function sendRenewalToOwnerWhatsApp() {
  const shopName = agentState.settings?.shopName || document.getElementById('header-shop-name')?.textContent || 'QuickPrint Shop';
  const shopId = agentState.settings?.shopId || document.getElementById('header-shop-code')?.textContent || 'QP_SHOP';
  const user = document.getElementById('admin-username-input')?.value.trim() || 'shop-admin';
  const phone = agentState.settings?.shopPhone || '';
  const p = PLANS_INFO[selectedLicensePlanKey] || PLANS_INFO.yearly;
  const utr = document.getElementById('lic-utr-input')?.value.trim() || '';

  const waNumber = (ownerContactInfo.whatsapp || '919999999999').replace(/\D/g, '');

  const text = `*QuickPrint - Shop Plan Renewal Request*
━━━━━━━━━━━━━━━━━━━━━━
🏪 *Shop Name:* ${shopName}
🆔 *Shop ID:* ${shopId}
👤 *Username:* ${user}
📞 *Mobile:* ${phone || 'Not given'}

📦 *Selected Plan:* ${p.label} (₹${p.price})
⏳ *Validity:* ${p.daysText}
🔢 *UPI Ref / UTR:* ${utr || (p.price === 0 ? 'Free Trial Request' : 'Sent via UPI')}
📅 *Time:* ${new Date().toLocaleString('en-IN')}
━━━━━━━━━━━━━━━━━━━━━━
_Please approve my shop license renewal in QuickPrint SuperAdmin._`;

  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');

  // Show waiting state
  const pollNotice = document.getElementById('lic-polling-notice');
  if (pollNotice) pollNotice.classList.remove('hidden');

  startOwnerApprovalPolling();
}

function startOwnerApprovalPolling() {
  stopOwnerApprovalPolling();
  console.log('🔄 Starting live approval polling...');
  ownerApprovalPollTimer = setInterval(checkOwnerApprovalLive, 4000);
}

function stopOwnerApprovalPolling() {
  if (ownerApprovalPollTimer) {
    clearInterval(ownerApprovalPollTimer);
    ownerApprovalPollTimer = null;
  }
}

async function checkOwnerApprovalLive() {
  try {
    const data = await fetchLicenseInfo();
    const lic = data && data.license;
    if (lic && (lic.state === 'active' || lic.allowed === true)) {
      console.log('🎉 Owner Approved License!', lic);
      stopOwnerApprovalPolling();
      closeLicensePlansModal();
      playDing();
      updateHeaderLicenseBadge(lic);
      unlockDashboard();
      await fetchSettings();
      await fetchOrders();
      alert(`🎉 வாழ்த்துகள்! உங்கள் திட்டம் "${lic.plan.toUpperCase()}" உரிமையாளரால் Approve செய்யப்பட்டது!\nமீதமுள்ள நாட்கள்: ${lic.daysLeft || 'Unlimited'} days.`);
    }
  } catch (e) {
    console.warn('Poll error:', e);
  }
}

window.openLicensePlansModal = openLicensePlansModal;
window.closeLicensePlansModal = closeLicensePlansModal;
window.selectLicensePlan = selectLicensePlan;
window.copyOwnerUpiId = copyOwnerUpiId;
window.sendRenewalToOwnerWhatsApp = sendRenewalToOwnerWhatsApp;
window.checkOwnerApprovalLive = checkOwnerApprovalLive;

// Fetch Settings
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    agentState.settings = s;

    const nameEl = document.getElementById('header-shop-name');
    if (nameEl) nameEl.textContent = s.shopName || 'Suprajaa Textiles & Xerox';

    const codeEl = document.getElementById('header-shop-code');
    if (codeEl) codeEl.textContent = s.shopId || 'QP_SUPRAJAA';

    agentState.shopOpen = s.shopOpen !== false;
    const toggleOpen = document.getElementById('toggle-shop-open');
    if (toggleOpen) toggleOpen.checked = agentState.shopOpen;

    const openStatus = document.getElementById('shop-open-status');
    if (openStatus) {
      openStatus.textContent = agentState.shopOpen ? 'Shop Open' : 'Shop Closed';
   const p = openStatus.parentElement;
   if (p) {
     if (agentState.shopOpen) {
       p.className = 'flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl shadow-2xs';
       openStatus.className = 'text-xs font-black text-emerald-800';
     } else {
       p.className = 'flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1 rounded-xl shadow-2xs';
       openStatus.className = 'text-xs font-black text-rose-800';
     }
   }
      openStatus.className = agentState.shopOpen
        ? 'text-sm font-extrabold text-emerald-700'
        : 'text-sm font-extrabold text-rose-500';
    }

    agentState.autoPrintPaid = s.autoPrintEnabled !== false;
    const togglePaid = document.getElementById('toggle-paid-autoprint');
    if (togglePaid) togglePaid.checked = agentState.autoPrintPaid;

    agentState.allowCash = !!s.allowCash;
    const toggleCash = document.getElementById('toggle-cash-orders');
    if (toggleCash) toggleCash.checked = agentState.allowCash;

    if (s.license) {
      agentState.license = s.license;
      updateHeaderLicenseBadge(s.license);
      if (s.license.state === 'expired' || (s.license.daysLeft !== null && s.license.daysLeft <= 0 && s.license.plan !== 'lifetime')) {
        openLicensePlansModal(true);
      }
    }
  } catch (err) {
    console.error('Settings error:', err);
  }
}

// Fetch Installed Printers
async function fetchPrinters() {
  const selectBw = document.getElementById('select-bw-printer');
  const selectColor = document.getElementById('select-color-printer');
  const badge = document.getElementById('printers-status-badge');

  try {
    let names = null;
    const isDesktop = !!(window.qpDesktop && window.qpDesktop.getPrinters);
    if (isDesktop) {          // QuickPrint Shop desktop app: the printers installed on THIS shop PC
      try { names = await window.qpDesktop.getPrinters(); } catch (e) { console.warn('Desktop printers error', e); }
    }
    if (!names) {
      const res = await fetch('/api/printers');
      const data = await res.json();
      names = isDesktop ? [] : (data.printers || []).filter(p => !/Browser Dialog/i.test(p));
    }
    agentState.printers = names;

    if (selectBw && selectColor) {
      selectBw.innerHTML = '<option value="">Choose a printer...</option>';
      selectColor.innerHTML = '<option value="">Choose a printer...</option>';

      agentState.printers.forEach(printer => {
        const oBw = document.createElement('option');
        oBw.value = printer;
        oBw.textContent = printer;
        if (agentState.settings?.selectedBwPrinter === printer) oBw.selected = true;
        selectBw.appendChild(oBw);

        const oCol = document.createElement('option');
        oCol.value = printer;
        oCol.textContent = printer;
        if (agentState.settings?.selectedColorPrinter === printer) oCol.selected = true;
        selectColor.appendChild(oCol);
      });
    }

    updatePrinterStatusCount();
    const helper = document.getElementById('printer-helper-msg');
    if (helper && !(window.qpDesktop && window.qpDesktop.getPrinters)) {
      helper.textContent = 'Open QuickPrint in the desktop app (.exe) on the shop PC to choose your printers.';
    } else if (helper && !agentState.printers.length) {
      helper.textContent = 'No printer found on this PC. Install the printer in Windows, then press refresh.';
    }
  } catch (err) {
    console.warn('Printers error:', err);
  }
}

function updatePrinterStatusCount() {
  const selectBw = document.getElementById('select-bw-printer');
  const selectColor = document.getElementById('select-color-printer');
  const badge = document.getElementById('printers-status-badge');
  const helper = document.getElementById('printer-helper-msg');

  let ready = 0;
  if (selectBw && selectBw.value) ready++;
  if (selectColor && selectColor.value) ready++;

  if (badge) badge.textContent = `${ready} of 2 ready`;

  if (helper) {
    if (ready === 2) {
      helper.textContent = '✅ All printers configured';
      helper.className = 'text-xs text-emerald-600 font-bold';
    } else if (ready === 1) {
      helper.textContent = selectBw.value ? 'Color printer needs selection' : 'Black & White needs a printer';
      helper.className = 'text-xs text-amber-600 font-semibold';
    } else {
      helper.textContent = 'Black & White needs a printer';
      helper.className = 'text-xs text-slate-500 font-medium';
    }
  }
}

// Fetch Orders
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    agentState.orders = data.orders || [];
    renderOrders();
    updateMetrics();
  } catch (err) {
    console.error('Orders error:', err);
  }
}

// Update Metrics Numbers
function updateMetrics() {
  const today = new Date().toDateString();
  const todayOrders = agentState.orders.filter(o => {
    try {
      return new Date(o.createdAt).toDateString() === today;
    } catch (e) {
      return false;
    }
  });

  const totalOrders = todayOrders.length;
  const totalPages = todayOrders.reduce((sum, o) => sum + (o.pageCount || 1) * (o.copies || 1), 0);
  
  const paid = todayOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'completed');
  const online = paid.filter(o => o.paymentMethod !== 'cash');
  const cash = paid.filter(o => o.paymentMethod === 'cash');

  const totalRev = paid.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const onlineRev = online.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const cashRev = cash.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);

  const elOrdersToday = document.getElementById('metric-orders-today');
  if (elOrdersToday) elOrdersToday.textContent = totalOrders;

  const elPagesToday = document.getElementById('metric-pages-today');
  if (elPagesToday) elPagesToday.textContent = `${totalPages} pages`;

  const elTotalEarned = document.getElementById('metric-total-earned');
  if (elTotalEarned) elTotalEarned.textContent = `₹${totalRev}`;

  const elPrintedToday = document.getElementById('metric-printed-today') || document.getElementById('metric-orders-printed');
  if (elPrintedToday) elPrintedToday.textContent = `${paid.length} orders printed`;

  const elCashEarned = document.getElementById('metric-cash-earned');
  if (elCashEarned) elCashEarned.textContent = `₹${cashRev}`;

  const elOnlineEarned = document.getElementById('metric-online-earned');
  if (elOnlineEarned) elOnlineEarned.textContent = `₹${onlineRev}`;

  const countAll = document.getElementById('count-all') || document.getElementById('badge-all-count');
  if (countAll) countAll.textContent = totalOrders;

  const countCash = document.getElementById('count-cash') || document.getElementById('badge-cash-count');
  if (countCash) countCash.textContent = cash.length;

  const countOnline = document.getElementById('count-online') || document.getElementById('badge-online-count');
  if (countOnline) countOnline.textContent = online.length;
}

// Render Orders Table
function renderOrders() {
  const container = document.getElementById('orders-stream-list') || document.getElementById('orders-container');
  const emptyState = document.getElementById('empty-orders-state') || document.getElementById('empty-orders-view');
  if (!container) return;

  let list = agentState.orders;
  if (agentState.filter === 'cash') {
    list = list.filter(o => o.paymentMethod === 'cash');
  } else if (agentState.filter === 'online') {
    list = list.filter(o => o.paymentMethod !== 'cash');
  }

  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `
      <div id="empty-orders-state" class="text-center py-10">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-2">📄</div>
        <h3 class="text-base font-black text-slate-800">No orders yet today</h3>
        <p class="text-xs text-slate-400 mt-1 font-medium">New print jobs from customer mobile scans will show up here live.</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  list.forEach(order => {
    const row = document.createElement('div');
    row.className = 'order-row grid grid-cols-12 items-center gap-2.5 px-3 py-3 text-sm hover:bg-slate-50 transition border-b border-slate-100 last:border-0';

    const isColor = order.colorMode === 'color';
    const timeFormatted = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let statusBadge = '';
    if (order.status === 'completed') {
      statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-extrabold text-emerald-700"><span class="h-2 w-2 rounded-full bg-emerald-500"></span>Done</span>';
    } else if (order.status === 'printing') {
      statusBadge = '<span class="inline-flex animate-pulse items-center gap-1 rounded-full bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs font-extrabold text-violet-700"><span class="h-2 w-2 rounded-full bg-violet-500"></span>Printing</span>';
    } else if (order.status === 'queued') {
      statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-1 text-xs font-extrabold text-sky-700"><span class="h-2 w-2 rounded-full bg-sky-500"></span>Queued</span>';
    } else {
      statusBadge = '<span class="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-extrabold text-amber-700"><span class="h-2 w-2 rounded-full bg-amber-500"></span>Pending</span>';
    }

    const pages = order.pageCount || 1;
    const copies = order.copies || 1;

    row.innerHTML = `
      <!-- Order No -->
      <div class="col-span-2 min-w-0">
        <span class="inline-block px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono font-black text-xs shadow-xs tracking-wide">${order.token}</span>
        <p class="mt-1 truncate text-xs font-semibold text-slate-500">${order.customerName || 'Customer'}</p>
      </div>

      <!-- Details -->
      <div class="col-span-4 min-w-0 pr-1">
        <a href="${order.fileUrl}" target="_blank" class="block truncate text-sm font-black text-slate-800 transition hover:text-indigo-600" title="${order.originalName}">
          ${order.originalName}
        </a>
        <div class="mt-1 flex flex-wrap items-center gap-1.5">
          <span class="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">${pages} ${pages > 1 ? 'pages' : 'page'}</span>
          <span class="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">${copies} ${copies > 1 ? 'copies' : 'copy'}</span>
          <span class="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-xs font-black text-emerald-700">₹${order.pricing?.totalAmount || 0}</span>
        </div>
      </div>

      <!-- Mode -->
      <div class="col-span-2">
        <span class="inline-block px-2.5 py-1 rounded-lg text-xs font-extrabold ${isColor ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
          ${isColor ? '🌈 Color' : '📄 B&amp;W'}
        </span>
      </div>

      <!-- Time -->
      <div class="col-span-2 text-xs font-bold text-slate-500">
        ${timeFormatted}
      </div>

      <!-- Status & Print Action -->
      <div class="col-span-2 flex items-center justify-end gap-2">
        ${statusBadge}
        ${order.paymentStatus !== 'paid' && order.status !== 'completed' ? `
          <button class="btn-print-action flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition active:scale-95" title="Customer Paid -> Print Now" data-id="${order.id}">
            <span>💵</span> Pay &amp; Print
          </button>
        ` : `
          <button class="btn-print-action grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/30 transition hover:bg-violet-700 active:scale-95" title="Print again" data-id="${order.id}">
            <i data-lucide="printer" class="w-4 h-4"></i>
          </button>
        `}
      </div>
    `;

    container.appendChild(row);
  });

  refreshIcons();
}

// Direct Silent Auto-Print & Queued Order Processing
function setOrderStatus(order, status) {
  return fetch(`/api/orders/${order.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  }).catch(() => {});
}

// Track printed orders to guarantee: Never print the same order twice
const printedOrderIds = new Set(
  (() => {
    try {
      return JSON.parse(localStorage.getItem('qp_printed_orders') || '[]');
    } catch (e) {
      return [];
    }
  })()
);
const activePrintingIds = new Set();

function markOrderPrinted(orderId) {
  if (!orderId) return;
  printedOrderIds.add(orderId);
  try {
    const list = Array.from(printedOrderIds).slice(-1000); // keep recent 1000
    localStorage.setItem('qp_printed_orders', JSON.stringify(list));
  } catch (e) {}
}

async function printSingleOrderSafely(order) {
  if (!order || !order.id || !order.fileUrl) return false;
  // Guard against duplicate prints
  if (printedOrderIds.has(order.id) || activePrintingIds.has(order.id)) {
    console.log(`ℹ️ Skipping duplicate print for order ${order.token || order.id}`);
    return false;
  }

  activePrintingIds.add(order.id);
  try {
    const st = agentState.settings || {};
    const printer = (order.colorMode === 'color') ? st.selectedColorPrinter : st.selectedBwPrinter;

    // Advance status to printing on the server
    await setOrderStatus(order, 'printing');

    // Desktop app: silent print straight to the selected Windows printer (no dialog)
    if (window.qpDesktop && window.qpDesktop.printFile) {
      await window.qpDesktop.printFile({
        url: order.fileUrl,
        printer: printer || '',
        copies: order.copies,
        colorMode: order.colorMode,
        duplex: order.duplex,
        paperSize: order.paperSize,
        pageRange: order.pageRange
      });
      // Mark completed and remember as printed
      await setOrderStatus(order, 'completed');
      markOrderPrinted(order.id);
      console.log(`✅ Order ${order.token || order.id} successfully printed silently.`);
      return true;
    } else {
      // Browser fallback (iframe)
      const frame = document.getElementById('silent-print-frame');
      if (frame) {
        frame.src = order.fileUrl;
        frame.onload = () => {
          try {
            setTimeout(() => {
              frame.contentWindow.focus();
              frame.contentWindow.print();
              setOrderStatus(order, 'completed');
              markOrderPrinted(order.id);
            }, 500);
          } catch (e) {
            console.warn('Iframe print failed', e);
          }
        };
      }
      return true;
    }
  } catch (err) {
    console.warn('Silent print failed for ' + (order.token || 'order') + ':', err);
    await setOrderStatus(order, 'queued');
    return false;
  } finally {
    activePrintingIds.delete(order.id);
  }
}

function triggerDirectPrint(order) {
  return printSingleOrderSafely(order);
}

let isProcessingMissedQueue = false;
async function processMissedQueuedOrders() {
  if (isProcessingMissedQueue) return;
  const isAuto = agentState.autoPrintPaid || (agentState.settings && agentState.settings.autoPrintEnabled);
  if (!isAuto) return;
  if (!(window.qpDesktop && window.qpDesktop.printFile)) return;
  const token = sessionStorage.getItem('qp_shop_token');
  if (!token) return;

  isProcessingMissedQueue = true;
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) return;
    const data = await res.json();
    const orders = data.orders || [];

    // Filter paid orders with status "queued" that have not yet been printed
    const missed = orders.filter(o =>
      o &&
      (o.paymentStatus === 'paid' || o.paymentStatus === 'completed') &&
      o.status === 'queued' &&
      !printedOrderIds.has(o.id) &&
      !activePrintingIds.has(o.id)
    );

    if (missed.length > 0) {
      console.log(`🖨️ Found ${missed.length} missed queued order(s) to print silently.`);
      for (const order of missed) {
        if (!printedOrderIds.has(order.id) && !activePrintingIds.has(order.id)) {
          await printSingleOrderSafely(order);
        }
      }
      await fetchOrders();
    }
  } catch (err) {
    console.warn('Error processing missed queued orders:', err);
  } finally {
    isProcessingMissedQueue = false;
  }
}

function reconnectWebSocket() {
  try {
    if (agentState.ws) { agentState.ws.onclose = null; agentState.ws.close(); }
  } catch (e) {}
  setupWebSocket();
}

// WebSocket Setup
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/?token=${encodeURIComponent(sessionStorage.getItem('qp_shop_token') || '')}`;
  agentState.ws = new WebSocket(wsUrl);

  agentState.ws.onopen = () => {
    console.log('⚡ WebSocket connected. Checking missed queued orders...');
    processMissedQueuedOrders();
  };

  agentState.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'ORDER_CREATED') {
        agentState.orders.unshift(data.order);
        renderOrders();
        updateMetrics();

        // Once online payment is done, automatically trigger print (Instant Auto-Print)
        if (agentState.autoPrintPaid && (data.order.paymentMethod === 'upi' || data.order.paymentStatus === 'paid')) {
          (async () => {
            try {
              await fetch(`/api/orders/${data.order.id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txnId: 'UPI-AUTO-' + Date.now() })
              });
              data.order.paymentStatus = 'paid';
              data.order.status = 'queued';
            } catch (e) {
              console.warn('Auto-pay error:', e);
            }
            printSingleOrderSafely(data.order);
          })();
        }
      } else if (data.type === 'ORDER_PAID') {
        const idx = agentState.orders.findIndex(o => o.id === data.order.id);
        if (idx !== -1) {
          agentState.orders[idx] = data.order;
        } else {
          agentState.orders.unshift(data.order);
        }
        playDing();
        renderOrders();
        updateMetrics();

        // Automated silent print if enabled (safe duplicate check inside)
        if (agentState.autoPrintPaid) {
          printSingleOrderSafely(data.order);
        }
      } else if (data.type === 'ORDER_STATUS_CHANGED') {
        const idx = agentState.orders.findIndex(o => o.id === data.order.id);
        if (idx !== -1) {
          agentState.orders[idx] = data.order;
          renderOrders();
          updateMetrics();
        }
      } else if (data.type === 'TUNNEL_URL_CHANGED' || data.type === 'SETTINGS_UPDATED' || data.type === 'LICENSE_UPDATED') {
        renderCornerQrCode();
        const lic = (data.settings && data.settings.license) || data.license;
        if (lic) {
          agentState.license = lic;
          updateHeaderLicenseBadge(lic);
          if (lic.allowed || lic.state === 'active') {
            closeLicensePlansModal();
            unlockDashboard();
          }
        }
        fetchSettings();
      }
    } catch (e) {}
  };

  agentState.ws.onclose = () => {
    setTimeout(setupWebSocket, 3000);
  };
}

// Event Listeners
function setupEventListeners() {
  // Copy Code
  const btnCopy = document.getElementById('btn-copy-code');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const code = document.getElementById('header-shop-code')?.textContent || '';
      navigator.clipboard.writeText(code);
      btnCopy.textContent = 'Copied!';
      setTimeout(() => { btnCopy.textContent = 'Copy'; }, 2000);
    });
  }

  // Sync Now
  const btnSync = document.getElementById('btn-sync-now');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      btnSync.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-600"></i><span>Syncing...</span>`;
      refreshIcons();
      await fetchSettings();
      await fetchPrinters();
      await fetchOrders();
      await renderCornerQrCode();
      await processMissedQueuedOrders();
      setTimeout(() => {
        btnSync.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-600"></i><span>Synced</span>`;
        refreshIcons();
        setTimeout(() => {
          btnSync.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 text-slate-500"></i><span>Sync Now</span>`;
          refreshIcons();
        }, 1500);
      }, 500);
    });
  }

  // Shop Open Toggle
  const toggleOpen = document.getElementById('toggle-shop-open');
  if (toggleOpen) {
    toggleOpen.addEventListener('change', async (e) => {
      const isOpen = e.target.checked;
      const statusText = document.getElementById('shop-open-status');
      if (statusText) {
        statusText.textContent = isOpen ? 'Shop Open' : 'Shop Closed';
        statusText.className = isOpen
          ? 'text-sm font-extrabold text-emerald-700'
          : 'text-sm font-extrabold text-rose-500';
      }
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopOpen: isOpen })
      });
    });
  }

  // Counter Approval Toggles
  const togglePaid = document.getElementById('toggle-paid-autoprint');
  if (togglePaid) {
    togglePaid.addEventListener('change', async (e) => {
      agentState.autoPrintPaid = e.target.checked;
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoPrintEnabled: e.target.checked })
      });
    });
  }

  const toggleCash = document.getElementById('toggle-cash-orders');
  if (toggleCash) {
    toggleCash.addEventListener('change', async (e) => {
      agentState.allowCash = e.target.checked;
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowCash: e.target.checked })
      });
    });
  }

  // Save Printers
  const btnSavePrinters = document.getElementById('btn-save-printer-settings');
  if (btnSavePrinters) {
    btnSavePrinters.addEventListener('click', async () => {
      const selectBw = document.getElementById('select-bw-printer');
      const selectColor = document.getElementById('select-color-printer');
      btnSavePrinters.textContent = 'Saving...';
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedBwPrinter: selectBw?.value || '',
          selectedColorPrinter: selectColor?.value || ''
        })
      });
      // keep the printers in memory, so the very next paid order uses the printer just saved
      const saved = await saveRes.json().catch(() => ({}));
      agentState.settings = saved.settings || { ...(agentState.settings || {}), selectedBwPrinter: selectBw?.value || '', selectedColorPrinter: selectColor?.value || '' };
      btnSavePrinters.textContent = 'Saved!';
      updatePrinterStatusCount();
      setTimeout(() => { btnSavePrinters.textContent = 'Save Settings'; }, 2000);
    });
  }

  // Test Prints
  document.querySelectorAll('.btn-test-print').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-mode');
      const selectBw = document.getElementById('select-bw-printer');
      const selectColor = document.getElementById('select-color-printer');
      const printer = mode === 'bw' ? selectBw?.value : selectColor?.value;

      btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-blue-600"></i>`;
      refreshIcons();
      try {
        if (window.qpDesktop && window.qpDesktop.printFile) {
          const r = await fetch('/api/printers/test-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ printerName: printer || '', mode })
          });
          const f = await r.json();
          if (!r.ok) throw new Error(f.error || 'Could not create test page');
          await window.qpDesktop.printFile({ url: f.url, printer: printer || '', copies: 1, colorMode: mode === 'color' ? 'color' : 'bw', duplex: 'single', paperSize: 'A4', pageRange: 'all' });
        } else {
          await fetch('/api/printers/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ printerName: printer })
          });
        }
        alert(`Test sheet sent to ${printer || 'Default Printer'}!`);
      } catch (e) {
        alert('Test print error: ' + e.message);
      } finally {
        btn.innerHTML = `<i data-lucide="printer" class="w-4 h-4"></i>`;
        refreshIcons();
      }
    });
  });

  // Paper & Ink Pills
  document.querySelectorAll('.pill-paper').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill-paper').forEach(p => {
        p.className = 'pill-paper';
      });
      pill.className = 'pill-paper is-active';
    });
  });

  // Filter Tabs
  document.querySelectorAll('.filter-tab, .order-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab, .order-filter-tab').forEach(t => {
        t.className = 'order-filter-tab px-3 py-1 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 transition';
      });
      tab.className = 'order-filter-tab px-3 py-1 rounded-full text-xs font-black bg-purple-100 text-purple-800 transition';
      agentState.filter = tab.getAttribute('data-filter');
      renderOrders();
    });
  });

  // Print button click in orders list
  const container = document.getElementById('orders-stream-list') || document.getElementById('orders-container');
  if (container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-print-action');
      if (btn) {
        const orderId = btn.getAttribute('data-id');
        const order = agentState.orders.find(o => o.id === orderId);
        if (order) {
          if (order.paymentStatus !== 'paid') {
            try {
              await fetch(`/api/orders/${order.id}/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txnId: 'COUNTER-CASH-' + Date.now() })
              });
              order.paymentStatus = 'paid';
              order.status = 'queued';
            } catch (payErr) {
              console.warn('Pay update error:', payErr);
            }
          }
          triggerDirectPrint(order);
        }
      }
    });
  }

  // WhatsApp Report
  const btnWa = document.getElementById('btn-whatsapp-report') || document.getElementById('btn-send-whatsapp');
  if (btnWa) {
    btnWa.addEventListener('click', () => {
      const today = new Date().toLocaleDateString('en-GB');
      const totalRev = document.getElementById('metric-total-earned')?.textContent || '₹0';
      const count = document.getElementById('metric-orders-today')?.textContent || '0';
      const text = encodeURIComponent(`*${agentState.settings?.shopName || 'Hasulots technologies'} - Daily Report (${today})*\n\nOrders Today: ${count}\nTotal Earned: ${totalRev}\n\nGenerated via QuickPrint Agent.`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    });
  }

  // Save as PDF
  const btnPdf = document.getElementById('btn-save-as-pdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      window.print();
    });
  }

  // Shop Settings Modal Trigger Bindings
  const btnEdit = document.getElementById('btn-edit-shop-info');
  if (btnEdit) btnEdit.addEventListener('click', openShopConfigModal);
  const btnHeadName = document.getElementById('header-shop-name');
  if (btnHeadName) btnHeadName.addEventListener('click', openShopConfigModal);
  const btnOpenSettings = document.getElementById('btn-open-settings');
  if (btnOpenSettings) btnOpenSettings.addEventListener('click', openShopConfigModal);
}

// PWA service worker: keep the installed desktop/app shell up to date
if ('serviceWorker' in navigator) {
  let refreshingForNewWorker = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForNewWorker || !navigator.serviceWorker.controller) return;
    refreshingForNewWorker = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      registration.update();
    } catch (err) {
      console.log('SW registration error:', err);
    }
  });
}

// Display Zoom Controller (Allows seamless scale up/down for optimal monitor view)
function initZoomControl() {
  const savedZoom = localStorage.getItem('qp_admin_zoom') || '110';
  applyZoom(parseInt(savedZoom, 10));

  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnZoomReset = document.getElementById('btn-zoom-reset');

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', (e) => {
      e.preventDefault();
      let current = parseInt(localStorage.getItem('qp_admin_zoom') || '110', 10);
      if (current < 150) {
        current += 5;
        applyZoom(current);
      }
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', (e) => {
      e.preventDefault();
      let current = parseInt(localStorage.getItem('qp_admin_zoom') || '110', 10);
      if (current > 85) {
        current -= 5;
        applyZoom(current);
      }
    });
  }

  if (btnZoomReset) {
    btnZoomReset.addEventListener('click', (e) => {
      e.preventDefault();
      applyZoom(110);
    });
  }

  // Keyboard zoom shortcuts (Ctrl + + / Ctrl + - / Ctrl + 0)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        let current = parseInt(localStorage.getItem('qp_admin_zoom') || '110', 10);
        if (current < 150) applyZoom(current + 5);
      } else if (e.key === '-') {
        e.preventDefault();
        let current = parseInt(localStorage.getItem('qp_admin_zoom') || '110', 10);
        if (current > 85) applyZoom(current - 5);
      } else if (e.key === '0') {
        e.preventDefault();
        applyZoom(110);
      }
    }
  });
}

function applyZoom(zoomPercent) {
  localStorage.setItem('qp_admin_zoom', zoomPercent);
  document.body.style.zoom = (zoomPercent / 100);
  const lbl = document.getElementById('zoom-level-label');
  if (lbl) lbl.textContent = `${zoomPercent}%`;
}

async function initAgent() {
  ensureRememberMeCheckbox();
  checkAdminAuth();
  fetchLicenseInfo();
  initZoomControl();
  await fetchSettings();
  await fetchPrinters();
  await fetchOrders();
  await renderCornerQrCode();
  setupWebSocket();
  setupEventListeners();
  if (window.lucide) {
    lucide.createIcons();
  }
  // SafeStorage: auto-fill saved credentials and auto-login if not yet authenticated
  await loadSavedCredentialsAndAutoLogin();
  // On startup: check for and print any missed queued orders
  processMissedQueuedOrders();
}

window.addEventListener('DOMContentLoaded', initAgent);
window.addEventListener('online', () => {
  console.log('🌐 Internet reconnected. Refreshing socket and checking queued orders...');
  reconnectWebSocket();
  processMissedQueuedOrders();
});

// Auto-poll orders every 3 seconds so new customer orders reflect immediately
setInterval(fetchOrders, 3000);

// ============================================================
// 🏪 SHOP SETTINGS & CONFIGURATION MODAL CONTROLLERS
// ============================================================
function openShopConfigModal() {
  const modal = document.getElementById('modal-shop-config');
  if (!modal) return;

  const s = (window.agentState && window.agentState.settings) ? window.agentState.settings : {};
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };

  setVal('modal-shop-name', s.shopName || 'Hasulots technologies');
  setVal('modal-shop-id', s.shopId || 'QP_HASULOTS');
  const shopIdInp = document.getElementById('modal-shop-id');
  if (shopIdInp) {
    shopIdInp.readOnly = true;
    shopIdInp.disabled = true;
  }
  setVal('modal-shop-phone', s.shopPhone || '');
  setVal('modal-shop-address', s.shopAddress || '');
  setVal('modal-admin-username', s.adminUsername || 'admin');
  setVal('modal-admin-password', '');
  setVal('modal-upi-id', s.upiId || '');
  setVal('modal-upi-name', s.upiName || s.shopName || 'Hasulots technologies');
  setVal('modal-bw-rate', s.pricing?.bwPerA4Page || 3);
  setVal('modal-color-rate', s.pricing?.colorPerA4Page || 10);
  setVal('modal-duplex-discount', s.pricing?.duplexDiscountPercent || 15);

  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('z-index', '999999', 'important');
  modal.classList.remove('hidden');
}

function closeShopConfigModal() {
  const modal = document.getElementById('modal-shop-config');
  if (modal) {
    modal.style.setProperty('display', 'none', 'important');
    modal.classList.add('hidden');
  }
}

function autoGenerateModalShopId() {
  // Shop ID once created cannot be changed
  alert('Shop ID once created cannot be changed / கடை குறியீட்டை மாற்ற முடியாது.');
}

async function saveShopConfig() {
  const getVal = (id) => document.getElementById(id)?.value.trim();

  const payload = {
    shopName: getVal('modal-shop-name') || 'Hasulots technologies',
    shopId: getVal('modal-shop-id') || 'QP_HASULOTS',
    shopPhone: getVal('modal-shop-phone') || '',
    shopAddress: getVal('modal-shop-address') || '',
    adminUsername: getVal('modal-admin-username') || 'admin',
    
    upiId: (getVal('modal-upi-id') || '').trim(),
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

// Expose all modal and auth functions globally to window
window.openShopConfigModal = openShopConfigModal;
window.populateShopConfigModal = openShopConfigModal;
window.closeShopConfigModal = closeShopConfigModal;
window.saveShopConfig = saveShopConfig;
window.autoGenerateModalShopId = autoGenerateModalShopId;
window.switchLoginTab = switchLoginTab;
window.verifyLoginSubmit = verifyLoginSubmit;
window.verifyPasswordSubmit = verifyLoginSubmit;
window.submitShopRegistration = submitShopRegistration;
window.openNewShopRegistrationFromModal = openNewShopRegistrationFromModal;
window.onRegisterNameInput = onRegisterNameInput;
window.generateRandomShopId = generateRandomShopId;
