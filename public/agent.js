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

function showPasswordError(msg) {
  const errEl = document.getElementById('login-error-msg');
  if (errEl) {
    errEl.textContent = msg || 'Incorrect Password. Please try again.';
    errEl.style.opacity = '1';
  }
  const inp = document.getElementById('admin-password-input');
  if (inp) {
    inp.classList.add('shake-anim');
    setTimeout(() => inp.classList.remove('shake-anim'), 400);
    inp.value = '';
    inp.focus();
  }
}

function hidePasswordError() {
  const errEl = document.getElementById('login-error-msg');
  if (errEl) errEl.style.opacity = '0';
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
      const loginData = await res.json().catch(() => ({}));
      if (loginData.token) sessionStorage.setItem('qp_shop_token', loginData.token);
      sessionStorage.setItem('qp_admin_auth', 'true');
      unlockDashboard();
      await fetchSettings();
      await fetchOrders();
      fetchPrinters();
    } else {
      const errData = await res.json().catch(() => ({}));
      showPasswordError(errData.error || 'Incorrect Username or Password');
    }
  } catch (err) {
    showPasswordError('Cannot reach server. Check internet and try again.');
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
}

function lockAdminDashboard() {
  sessionStorage.removeItem('qp_admin_auth');
  sessionStorage.removeItem('qp_shop_token');
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
  const overlay = document.getElementById('admin-login-overlay');
  if (!overlay) return;
  if (sessionStorage.getItem('qp_admin_auth') === 'true' && sessionStorage.getItem('qp_shop_token')) {
    overlay.style.display = 'none';
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
    
    // Choose target URL based on qrMode
    let targetUrl;
    const isPublic = qrMode === 'public' && info.baseUrl && info.baseUrl.startsWith('https://');
    if (isPublic) {
      targetUrl = `${info.baseUrl}/order`;
    } else {
      targetUrl = `http://${info.localIp}:${info.port}/order`;
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
    const res = await fetch('/api/printers');
    const data = await res.json();
    agentState.printers = data.printers || [];

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

// Direct Silent Auto-Print
function triggerDirectPrint(order) {
  if (!order || !order.fileUrl) return;

  const frame = document.getElementById('silent-print-frame');
  if (frame) {
    frame.src = order.fileUrl;
    frame.onload = () => {
      try {
        setTimeout(() => {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          // Update status to completed after print
          fetch(`/api/orders/${order.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
          });
        }, 500);
      } catch (e) {
        console.warn('Iframe print failed', e);
        window.open(order.fileUrl, '_blank');
      }
    };
  }
}

// WebSocket Setup
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  agentState.ws = new WebSocket(wsUrl);

  agentState.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'ORDER_CREATED') {
        agentState.orders.unshift(data.order);
        renderOrders();
        updateMetrics();
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

        // Automated silent print if enabled
        if (agentState.autoPrintPaid) {
          triggerDirectPrint(data.order);
        }
      } else if (data.type === 'ORDER_STATUS_CHANGED') {
        const idx = agentState.orders.findIndex(o => o.id === data.order.id);
        if (idx !== -1) {
          agentState.orders[idx] = data.order;
          renderOrders();
          updateMetrics();
        }
      } else if (data.type === 'TUNNEL_URL_CHANGED' || data.type === 'SETTINGS_UPDATED') {
        renderCornerQrCode();
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
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedBwPrinter: selectBw?.value || '',
          selectedColorPrinter: selectColor?.value || ''
        })
      });
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
        await fetch('/api/printers/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printerName: printer })
        });
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
  checkAdminAuth();
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
}

window.addEventListener('DOMContentLoaded', initAgent);

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
  setVal('modal-shop-phone', s.shopPhone || '');
  setVal('modal-shop-address', s.shopAddress || '');
  setVal('modal-admin-username', s.adminUsername || 'admin');
  setVal('modal-admin-password', '');
  setVal('modal-upi-id', s.upiId || 'hasulots@upi');
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
  const nameEl = document.getElementById('modal-shop-name');
  const name = nameEl ? nameEl.value.trim() : '';
  const clean = (name || 'SHOP').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SHOP';
  const rand = Math.floor(100 + Math.random() * 900);
  const idEl = document.getElementById('modal-shop-id');
  if (idEl) idEl.value = `QP_${clean}_${rand}`;
}

async function saveShopConfig() {
  const getVal = (id) => document.getElementById(id)?.value.trim();

  const payload = {
    shopName: getVal('modal-shop-name') || 'Hasulots technologies',
    shopId: getVal('modal-shop-id') || 'QP_HASULOTS',
    shopPhone: getVal('modal-shop-phone') || '',
    shopAddress: getVal('modal-shop-address') || '',
    adminUsername: getVal('modal-admin-username') || 'admin',
    
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
