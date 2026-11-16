// ============================================================
// QuickPrint — Platform Admin Console
// Separate from /owner. Platform credentials only (default admin/1234).
// ============================================================

const AUTH_KEY = 'qp_admin_auth';
const state = { system: null, shops: [], orders: [], settings: null };
let refreshTimer = null;

function $(id) { return document.getElementById(id); }
function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isAuthed() {
  try { return sessionStorage.getItem(AUTH_KEY) === 'true'; } catch (e) { return false; }
}
function setAuthed() {
  try { sessionStorage.setItem(AUTH_KEY, 'true'); } catch (e) {}
}
function clearAuthed() {
  try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
}

function showLoginError(msg) {
  const el = $('login-error-msg');
  if (el) {
    el.textContent = msg || 'Incorrect admin username or password.';
    el.style.opacity = '1';
  }
  const pass = $('admin-password-input');
  if (pass) { pass.value = ''; pass.focus(); }
}

function hideLoginError() {
  const el = $('login-error-msg');
  if (el) el.style.opacity = '0';
}

function unlockAdmin() {
  const overlay = $('admin-login-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
  }
  startData();
}

function lockAdmin() {
  clearAuthed();
  stopData();
  const overlay = $('admin-login-overlay');
  const pass = $('admin-password-input');
  if (pass) pass.value = '';
  hideLoginError();
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.pointerEvents = 'auto';
    setTimeout(() => {
      overlay.style.opacity = '1';
      if (pass) pass.focus();
    }, 10);
  }
}

async function platformLogin() {
  const username = ($('admin-username-input')?.value || '').trim();
  const password = ($('admin-password-input')?.value || '').trim();
  if (!username || !password) {
    showLoginError('Enter the admin username and password.');
    return;
  }
  const btn = $('btn-submit-pwd');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  hideLoginError();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      setAuthed();
      unlockAdmin();
    } else {
      const data = await res.json().catch(() => ({}));
      showLoginError(data.error || 'Incorrect admin username or password.');
    }
  } catch (err) {
    showLoginError('Cannot reach the server. Is QuickPrint running?');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Unlock Admin Console →'; }
  }
}

function checkAuth() {
  const overlay = $('admin-login-overlay');
  if (isAuthed()) {
    if (overlay) overlay.style.display = 'none';
    startData();
  } else {
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
      const pass = $('admin-password-input');
      if (pass) setTimeout(() => pass.focus(), 120);
    }
  }
}

// ------------------------------------------------------------
// Data loading
// ------------------------------------------------------------
async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function refreshAll() {
  try {
    const [system, shopsData, ordersData, settings] = await Promise.all([
      getJson('/api/system'),
      getJson('/api/shops'),
      getJson('/api/orders'),
      getJson('/api/settings')
    ]);
    state.system = system;
    state.shops = shopsData.shops || [];
    state.activeShopId = shopsData.activeShopId || system.activeShopId || '';
    state.orders = ordersData.orders || [];
    state.settings = settings;
    renderSystem();
    renderStats();
    renderShops();
    renderOrders();
    renderPlatformForm();
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.warn('Admin refresh failed:', err.message);
  }
}

function renderSystem() {
  const s = state.system || {};
  const publicUrl = (s.publicUrl || '').replace(/\/$/, '');
  const customerUrl = publicUrl ? `${publicUrl}/order` : '';

  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('sys-role', s.installRole === 'admin' ? 'Platform Admin' : 'Shop Owner');
  set('header-role-badge', s.installRole === 'admin' ? 'admin pc' : 'owner pc');
  set('sys-server-url', `http://localhost:${s.port || 4000}`);
  set('sys-lan-url', `http://${s.localIp || 'localhost'}:${s.port || 4000}`);
  set('sys-public-url', customerUrl || 'Tunnel not active yet');
  set('qr-target-url', customerUrl || `/order`);
  set('sys-uptime', formatUptime(s.uptimeSeconds || 0));
  set('sys-node', s.nodeVersion || '—');
  set('stat-role', s.installRole === 'admin' ? 'Admin' : 'Owner');

  const tunnelBadge = $('sys-tunnel-badge');
  const headBadge = $('header-tunnel-badge');
  if (tunnelBadge) {
    tunnelBadge.textContent = s.tunnelActive ? '● Online' : (s.tunnelBinary ? '○ Offline' : '○ Not installed');
    tunnelBadge.className = `badge ${s.tunnelActive ? 'badge-ok' : 'badge-off'}`;
  }
  if (headBadge) {
    headBadge.textContent = s.tunnelActive ? '🟢 Public tunnel live' : '🔴 Public tunnel offline';
    headBadge.className = `hidden sm:inline-flex badge ${s.tunnelActive ? 'badge-ok' : 'badge-off'}`;
  }

  if (publicUrl) {
    const img = $('qr-admin-img');
    if (img && img.dataset.url !== customerUrl) {
      img.dataset.url = customerUrl;
      img.src = `/api/qr?format=image&width=240&text=${encodeURIComponent(customerUrl)}&ts=${Date.now()}`;
    }
  }
}

function renderStats() {
  const s = state.system || {};
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('stat-shops', state.shops.length);
  set('stat-orders', s.orderCount !== undefined ? s.orderCount : state.orders.length);
  const active = state.shops.find(shop => shop.shopId === state.activeShopId);
  set('stat-active-shop', active ? active.shopName : (s.activeShopName || '—'));
  set('stat-active-id', active ? active.shopId : (s.activeShopId || '—'));
}

function renderShops() {
  const tbody = $('shops-table-body');
  if (!tbody) return;

  if (!state.shops.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-slate-400 font-semibold">No shops registered yet. Add the first shop above.</td></tr>';
    return;
  }

  tbody.innerHTML = state.shops.map(shop => {
    const active = shop.shopId === state.activeShopId;
    const pricing = shop.pricing || {};
    return `
      <tr class="${active ? 'is-active' : ''}">
        <td>
          <div class="font-black text-slate-900 text-[13px]">${esc(shop.shopName)}</div>
          <div class="font-mono text-[10px] font-bold text-indigo-600">${esc(shop.shopId)}</div>
        </td>
        <td>
          <div class="font-bold text-slate-700">${esc(shop.username || '—')}</div>
          <div class="text-[10px] text-slate-400 font-semibold">${shop.password ? 'password set' : 'no password'}</div>
        </td>
        <td class="font-mono text-[11px] font-bold text-slate-600">${esc(shop.upiId || '—')}</td>
        <td class="text-[11px] font-bold text-slate-600">₹${esc(pricing.bwPerA4Page ?? 3)} B&amp;W<br>₹${esc(pricing.colorPerA4Page ?? 10)} Color</td>
        <td>
          ${active
            ? '<span class="badge badge-ok">● Active</span>'
            : '<span class="badge badge-neutral">Inactive</span>'}
        </td>
        <td class="text-right">
          ${active
            ? '<a href="/owner" class="text-[11px] font-extrabold text-violet-600 hover:underline">Open owner ↗</a>'
            : `<button type="button" onclick="activateShop('${esc(shop.shopId)}', this)" class="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold transition">Activate</button>`}
        </td>
      </tr>
    `;
  }).join('');
}

function renderOrders() {
  const box = $('orders-mini');
  if (!box) return;

  const list = state.orders.slice(0, 12);
  if (!list.length) {
    box.innerHTML = '<p class="text-center py-6 text-slate-400 font-semibold">No orders yet.</p>';
    return;
  }

  box.innerHTML = list.map(order => {
    const status = statusInfo(order);
    const when = order.createdAt ? new Date(order.createdAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div class="order-line">
        <span class="order-chip">${esc(order.token)}</span>
        <div class="min-w-0">
          <div class="font-black text-slate-800 text-xs truncate" title="${esc(order.originalName)}">${esc(order.originalName)}</div>
          <div class="text-[10px] font-semibold text-slate-500 truncate">
            ₹${esc(order.pricing?.totalAmount ?? 0)} · ${order.paymentMethod === 'cash' ? 'Cash' : 'UPI'} · ${esc(when)}
          </div>
        </div>
        <span class="badge ${status.cls}">${status.label}</span>
      </div>
    `;
  }).join('');
}

function statusInfo(order) {
  if (order.status === 'completed') return { label: 'Done', cls: 'badge-ok' };
  if (order.status === 'rejected' || order.paymentStatus === 'rejected') return { label: 'Rejected', cls: 'badge-off' };
  if (order.status === 'awaiting_verification' || order.paymentStatus === 'claimed') return { label: 'Verify', cls: 'badge-neutral' };
  if (order.paymentStatus === 'paid' || order.status === 'queued' || order.status === 'printing') return { label: 'Paid', cls: 'badge-ok' };
  return { label: 'Unpaid', cls: 'badge-neutral' };
}

function renderPlatformForm() {
  const username = $('plat-username');
  if (username && document.activeElement !== username) {
    username.value = (state.system && state.system.platformUsername) || 'admin';
  }
}

function formatUptime(seconds) {
  const s = Math.max(0, parseInt(seconds, 10) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

// ------------------------------------------------------------
// Actions
// ------------------------------------------------------------
async function activateShop(shopId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Activating…'; }
  try {
    const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/activate`, { method: 'POST' });
    if (!res.ok) throw new Error('Activation failed');
    await refreshAll();
  } catch (err) {
    alert('Could not activate shop: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Activate'; }
  }
}

function autoFillNewShop(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10);
  const userEl = $('new-shop-username');
  const upiEl = $('new-shop-upi');
  if (userEl && (!userEl.value || userEl.value === (userEl.dataset.auto || ''))) {
    const val = clean ? clean.toLowerCase() : '';
    userEl.value = val;
    userEl.dataset.auto = val;
  }
  if (upiEl && (!upiEl.value || upiEl.value === (upiEl.dataset.auto || ''))) {
    const val = clean ? `${clean.toLowerCase()}@upi` : '';
    upiEl.value = val;
    upiEl.dataset.auto = val;
  }
}

function toggleAddShop(show) {
  const card = $('add-shop-card');
  if (!card) return;
  card.classList.toggle('hidden', !show);
  if (show) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const name = $('new-shop-name');
    if (name) setTimeout(() => name.focus(), 150);
  }
}

async function addShop() {
  const value = id => ($(id)?.value || '').trim();
  const shopName = value('new-shop-name');
  const msg = $('add-shop-msg');
  if (!shopName) {
    if (msg) { msg.textContent = 'Shop name is required.'; msg.className = 'text-[11px] font-bold text-rose-600'; }
    return;
  }

  if (msg) { msg.textContent = 'Registering…'; msg.className = 'text-[11px] font-bold text-slate-500'; }

  try {
    const res = await fetch('/api/shops/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopName,
        username: value('new-shop-username'),
        password: value('new-shop-password') || '1234',
        phone: value('new-shop-phone'),
        upiId: value('new-shop-upi'),
        bwRate: value('new-shop-bw') || 3,
        colorRate: value('new-shop-color') || 10
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    if (msg) { msg.textContent = `Registered ${data.shop?.shopName || shopName} and activated it.`; msg.className = 'text-[11px] font-bold text-emerald-600'; }
    ['new-shop-name', 'new-shop-username', 'new-shop-password', 'new-shop-phone', 'new-shop-upi'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    await refreshAll();
    setTimeout(() => toggleAddShop(false), 1200);
  } catch (err) {
    if (msg) { msg.textContent = err.message; msg.className = 'text-[11px] font-bold text-rose-600'; }
  }
}

async function savePlatformCredentials() {
  const username = ($('plat-username')?.value || '').trim();
  const password = ($('plat-password')?.value || '').trim();
  const msg = $('platform-msg');

  const payload = { platformUsername: username };
  if (password) payload.platformPassword = password;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save failed');
    if (password) {
      const passEl = $('plat-password');
      if (passEl) passEl.value = '';
    }
    if (msg) {
      msg.textContent = password ? 'Admin credentials updated.' : 'Admin username updated.';
      msg.className = 'text-[11px] font-bold text-emerald-600 text-center';
      msg.style.opacity = '1';
      setTimeout(() => { msg.style.opacity = '0'; }, 2500);
    }
    await refreshAll();
  } catch (err) {
    if (msg) {
      msg.textContent = err.message;
      msg.className = 'text-[11px] font-bold text-rose-600 text-center';
      msg.style.opacity = '1';
    }
  }
}

async function copyPublicUrl() {
  const url = ($('sys-public-url')?.textContent || '').trim();
  if (!url || url === 'Tunnel not active yet') return;
  try {
    await navigator.clipboard.writeText(url);
    const el = $('sys-public-url');
    if (el) {
      const old = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(() => { el.textContent = old; }, 1400);
    }
  } catch (e) {}
}

async function restartTunnel() {
  const ok = confirm('Restart the public tunnel?\n\nThe public URL will change and printed QR posters must be reprinted.');
  if (!ok) return;
  try {
    await fetch('/api/tunnel/restart', { method: 'POST' });
    const badge = $('header-tunnel-badge');
    if (badge) badge.textContent = '🟡 Restarting tunnel…';
    setTimeout(refreshAll, 4000);
    setTimeout(refreshAll, 9000);
  } catch (err) {
    alert('Tunnel restart failed: ' + err.message);
  }
}

// ------------------------------------------------------------
// Live updates + lifecycle
// ------------------------------------------------------------
function setupSocket() {
  try {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}`);
    let pending = null;
    ws.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (!data || data.type === 'CONNECTED') return;
        if (pending) return;
        pending = setTimeout(() => { pending = null; if (isAuthed()) refreshAll(); }, 500);
      } catch (e) {}
    };
    ws.onclose = () => setTimeout(() => { if (isAuthed()) setupSocket(); }, 4000);
  } catch (e) {}
}

function startData() {
  if (refreshTimer) return;
  refreshAll();
  setupSocket();
  refreshTimer = setInterval(() => { if (isAuthed()) refreshAll(); }, 5000);
}

function stopData() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

window.platformLogin = platformLogin;
window.lockAdmin = lockAdmin;
window.refreshAll = refreshAll;
window.activateShop = activateShop;
window.toggleAddShop = toggleAddShop;
window.addShop = addShop;
window.autoFillNewShop = autoFillNewShop;
window.savePlatformCredentials = savePlatformCredentials;
window.copyPublicUrl = copyPublicUrl;
window.restartTunnel = restartTunnel;

window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  if (window.lucide) lucide.createIcons();
});
