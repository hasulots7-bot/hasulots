// QuickPrint Print Agent - Admin Application (Matching QR Se Print layout)

const agentState = {
  orders: [],
  settings: null,
  printers: [],
  filter: 'all',
  paperInkStatus: 'all_good',
  shopOpen: true,
  autoPrintPaid: true,
  allowCash: false,
  ws: null
};

// DOM Elements
const shopNameDisplay = document.getElementById('shop-name-display');
const shopIdBadge = document.getElementById('shop-id-badge');
const btnCopyId = document.getElementById('btn-copy-id');
const btnSyncNow = document.getElementById('btn-sync-now');
const toggleShopOpen = document.getElementById('toggle-shop-open');
const shopOpenText = document.getElementById('shop-open-text');

// Printer elements
const printerSelectBw = document.getElementById('printer-select-bw');
const printerSelectColor = document.getElementById('printer-select-color');
const printersReadyBadge = document.getElementById('printers-ready-badge');
const btnRefreshPrinters = document.getElementById('btn-refresh-printers');
const btnSavePrinters = document.getElementById('btn-save-printers');
const printerHelperStatus = document.getElementById('printer-helper-status');

// QR & Status elements
const dashboardQrThumb = document.getElementById('dashboard-qr-thumb');
const toggleCounterCash = document.getElementById('toggle-counter-cash');
const toggleCounterPaid = document.getElementById('toggle-counter-paid');

// Stats elements
const statOrdersToday = document.getElementById('stat-orders-today');
const statPagesToday = document.getElementById('stat-pages-today');
const statTotalEarned = document.getElementById('stat-total-earned');
const statOrdersPrinted = document.getElementById('stat-orders-printed');
const statCashEarned = document.getElementById('stat-cash-earned');
const statOnlineEarned = document.getElementById('stat-online-earned');
const printsCountHeader = document.getElementById('prints-count-header');
const btnWhatsappReport = document.getElementById('btn-whatsapp-report');
const btnSavePdf = document.getElementById('btn-save-pdf');

// Orders List elements
const ordersListContainer = document.getElementById('orders-list-container');
const ordersEmptyState = document.getElementById('orders-empty-state');
const countAll = document.getElementById('count-all');
const countCash = document.getElementById('count-cash');
const countOnline = document.getElementById('count-online');

// Settings modal
const shopSettingsModal = document.getElementById('shop-settings-modal');
const btnEditShop = document.getElementById('btn-edit-shop');
const btnCloseShopSettings = document.getElementById('btn-close-shop-settings');
const btnCancelShopSettings = document.getElementById('btn-cancel-shop-settings');
const btnSaveShopSettings = document.getElementById('btn-save-shop-settings');
const inputShopName = document.getElementById('input-shop-name');
const inputUpiId = document.getElementById('input-upi-id');
const inputBwRate = document.getElementById('input-bw-rate');
const inputColorRate = document.getElementById('input-color-rate');

function refreshIcons() {
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Audio Notification Synthesizer (Crisp chime on new order)
function playDing() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // E6
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (err) {}
}

// Initialize Application
async function init() {
  await fetchSettings();
  await fetchPrinters();
  await fetchOrders();
  loadQrThumbnail();
  setupWebSocket();
  setupEventListeners();
  updateDateLabel();
  refreshIcons();
}

function updateDateLabel() {
  const el = document.getElementById('current-date-label');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}

// Fetch Settings
async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    agentState.settings = settings;

    shopNameDisplay.textContent = settings.shopName || 'makkal.esavai (Store)';
    shopIdBadge.textContent = settings.shopId || 'DEMO_67B470F3';

    agentState.shopOpen = settings.shopOpen !== false;
    toggleShopOpen.checked = agentState.shopOpen;
    shopOpenText.textContent = agentState.shopOpen ? 'Shop Open' : 'Shop Closed';
    shopOpenText.className = agentState.shopOpen ? 'text-xs font-bold text-emerald-700' : 'text-xs font-bold text-rose-600';

    agentState.autoPrintPaid = settings.autoPrintEnabled !== false;
    toggleCounterPaid.checked = agentState.autoPrintPaid;

    agentState.allowCash = !!settings.allowCash;
    toggleCounterCash.checked = agentState.allowCash;
  } catch (err) {
    console.error('Settings fetch error:', err);
  }
}

// Fetch Installed Printers
async function fetchPrinters() {
  try {
    let names = null;
    if (window.qpDesktop && window.qpDesktop.getPrinters) {          // QuickPrint Shop desktop app: real Windows printers
      try { names = await window.qpDesktop.getPrinters(); } catch (e) { console.warn('Desktop printers error', e); }
    }
    if (!names) {
      const res = await fetch('/api/printers');
      const data = await res.json();
      names = data.printers || [];
    }
    agentState.printers = names;

    populatePrinterSelect(printerSelectBw, agentState.settings?.selectedBwPrinter);
    populatePrinterSelect(printerSelectColor, agentState.settings?.selectedColorPrinter);

    updateReadyPrintersCount();
  } catch (err) {
    console.warn('Printers fetch error:', err);
  }
}

function populatePrinterSelect(selectEl, selectedVal) {
  if (!selectEl) return;
  selectEl.innerHTML = '<option value="">Choose a printer...</option>';
  agentState.printers.forEach(printer => {
    const opt = document.createElement('option');
    opt.value = printer;
    opt.textContent = printer;
    if (selectedVal && selectedVal === printer) {
      opt.selected = true;
    }
    selectEl.appendChild(opt);
  });
}

function updateReadyPrintersCount() {
  let count = 0;
  if (printerSelectBw.value) count++;
  if (printerSelectColor.value) count++;
  printersReadyBadge.textContent = `${count} of 2 ready`;

  if (count === 2) {
    printerHelperStatus.textContent = '✅ All printers configured';
    printerHelperStatus.className = 'text-xs text-emerald-600 font-semibold';
  } else if (count === 1) {
    printerHelperStatus.textContent = printerSelectBw.value ? 'Color printer not selected' : 'Black & White needs a printer';
    printerHelperStatus.className = 'text-xs text-amber-600 font-medium';
  } else {
    printerHelperStatus.textContent = 'Black & White needs a printer';
    printerHelperStatus.className = 'text-xs text-slate-500';
  }
}

// Load QR Thumbnail
async function loadQrThumbnail() {
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    const qrRes = await fetch(`/api/qr?text=${encodeURIComponent(info.baseUrl)}&width=160`);
    const qrData = await qrRes.json();
    if (dashboardQrThumb) dashboardQrThumb.src = qrData.qr;
  } catch (e) {}
}

// Fetch Orders
async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const data = await res.json();
    agentState.orders = data.orders || [];
    renderOrders();
    updateStats();
  } catch (err) {
    console.error('Orders error:', err);
  }
}

// Update Metrics Bar
function updateStats() {
  const today = new Date().toDateString();
  const todayOrders = agentState.orders.filter(o => new Date(o.createdAt).toDateString() === today);

  const totalOrdersCount = todayOrders.length;
  const totalPagesCount = todayOrders.reduce((sum, o) => sum + (o.pageCount || 1) * (o.copies || 1), 0);
  
  const paidOrders = todayOrders.filter(o => o.paymentStatus === 'paid');
  const onlineOrders = paidOrders.filter(o => o.paymentMethod !== 'cash');
  const cashOrders = paidOrders.filter(o => o.paymentMethod === 'cash');

  const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const onlineRevenue = onlineOrders.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const cashRevenue = cashOrders.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);

  statOrdersToday.textContent = totalOrdersCount;
  statPagesToday.textContent = `${totalPagesCount} pages`;
  statTotalEarned.textContent = `₹${totalRevenue}`;
  statOrdersPrinted.textContent = `${paidOrders.length} orders printed`;
  statCashEarned.textContent = `₹${cashRevenue}`;
  statOnlineEarned.textContent = `₹${onlineRevenue}`;

  printsCountHeader.textContent = `${totalOrdersCount} Jobs`;

  countAll.textContent = totalOrdersCount;
  countCash.textContent = cashOrders.length;
  countOnline.textContent = onlineOrders.length;
}

// Render Orders List
function renderOrders() {
  let list = agentState.orders;
  if (agentState.filter === 'cash') {
    list = list.filter(o => o.paymentMethod === 'cash');
  } else if (agentState.filter === 'online') {
    list = list.filter(o => o.paymentMethod !== 'cash');
  }

  ordersListContainer.innerHTML = '';

  if (list.length === 0) {
    ordersListContainer.appendChild(ordersEmptyState);
    refreshIcons();
    return;
  }

  list.forEach(order => {
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 items-center py-3 px-3 hover:bg-slate-50 transition text-xs border-b border-slate-100';

    const isPaid = order.paymentStatus === 'paid';
    const isColor = order.colorMode === 'color';
    const timeFormatted = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let statusHtml = '';
    if (order.status === 'completed') {
      statusHtml = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Completed</span>';
    } else if (order.status === 'printing') {
      statusHtml = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 animate-pulse">Printing</span>';
    } else if (order.status === 'queued') {
      statusHtml = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">In Queue</span>';
    } else {
      statusHtml = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Pending</span>';
    }

    row.innerHTML = `
      <!-- Order No -->
      <div class="col-span-2">
        <span class="font-bold text-slate-900 tracking-wide">${order.token}</span>
        <p class="text-[10px] text-slate-400">${order.customerName || 'Customer'}</p>
      </div>

      <!-- Details -->
      <div class="col-span-4 pr-2">
        <a href="${order.fileUrl}" target="_blank" class="font-medium text-slate-800 hover:text-brand-600 truncate block font-mono" title="${order.originalName}">
          ${order.originalName}
        </a>
        <p class="text-[10px] text-slate-500">
          ${order.pageCount || 1} ${order.pageCount > 1 ? 'pgs' : 'pg'} &bull; ${order.copies || 1} copy &bull; ₹${order.pricing?.totalAmount || 0}
        </p>
      </div>

      <!-- Mode -->
      <div class="col-span-2">
        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${isColor ? 'bg-pink-100 text-pink-700' : 'bg-slate-200 text-slate-700'}">
          ${isColor ? 'Color' : 'B&W'}
        </span>
      </div>

      <!-- Time -->
      <div class="col-span-2 text-slate-500 text-[11px]">
        ${timeFormatted}
      </div>

      <!-- Status & Print Action -->
      <div class="col-span-2 flex items-center justify-end space-x-2">
        ${statusHtml}
        <button class="btn-direct-print p-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition" title="Print Now" data-id="${order.id}">
          <i data-lucide="printer" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;

    ordersListContainer.appendChild(row);
  });

  refreshIcons();
}

// Direct Automated Silent Print Logic
function setOrderStatus(order, status) {
  return fetch(`/api/orders/${order.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  }).catch(() => {});
}

function triggerDirectPrint(order) {
  if (!order || !order.fileUrl) return;

  // Desktop app: silent print straight to the selected Windows printer (no dialog)
  if (window.qpDesktop && window.qpDesktop.printFile) {
    const st = agentState.settings || {};
    const printer = order.colorMode === 'color' ? st.selectedColorPrinter : st.selectedBwPrinter;
    setOrderStatus(order, 'printing');
    window.qpDesktop.printFile({
      url: order.fileUrl, printer: printer || '', copies: order.copies, colorMode: order.colorMode,
      duplex: order.duplex, paperSize: order.paperSize, pageRange: order.pageRange
    }).then(() => setOrderStatus(order, 'completed'))
      .catch((err) => {
        console.warn('Desktop print failed', err);
        setOrderStatus(order, 'queued');
        alert('Print failed for ' + (order.token || 'order') + ': ' + ((err && err.message) || 'printer error').replace(/^Error invoking remote method[^:]*: /, ''));
      });
    return;
  }

  const frame = document.getElementById('silent-print-frame');
  if (frame) {
    frame.src = order.fileUrl;
    frame.onload = () => {
      try {
        setTimeout(() => {
          frame.contentWindow.focus();
          frame.contentWindow.print();
          // Update status to completed after printing
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
        updateStats();
      } else if (data.type === 'ORDER_PAID') {
        const idx = agentState.orders.findIndex(o => o.id === data.order.id);
        if (idx !== -1) {
          agentState.orders[idx] = data.order;
        } else {
          agentState.orders.unshift(data.order);
        }
        playDing();
        renderOrders();
        updateStats();

        // Automatic Printing
        if (agentState.autoPrintPaid) {
          triggerDirectPrint(data.order);
        }
      } else if (data.type === 'ORDER_STATUS_CHANGED') {
        const idx = agentState.orders.findIndex(o => o.id === data.order.id);
        if (idx !== -1) {
          agentState.orders[idx] = data.order;
          renderOrders();
          updateStats();
        }
      }
    } catch (e) {}
  };

  agentState.ws.onclose = () => {
    setTimeout(setupWebSocket, 3000);
  };
}

// Event Listeners
function setupEventListeners() {
  // Copy Shop ID
  btnCopyId.addEventListener('click', () => {
    navigator.clipboard.writeText(shopIdBadge.textContent);
    btnCopyId.textContent = 'Copied!';
    setTimeout(() => { btnCopyId.textContent = 'Copy'; }, 2000);
  });

  // Sync Now
  btnSyncNow.addEventListener('click', async () => {
    btnSyncNow.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>Syncing...</span>`;
    refreshIcons();
    await fetchSettings();
    await fetchPrinters();
    await fetchOrders();
    setTimeout(() => {
      btnSyncNow.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i><span>Synced</span>`;
      refreshIcons();
      setTimeout(() => {
        btnSyncNow.innerHTML = `<i data-lucide="refresh-cw" class="w-3.5 h-3.5 text-slate-500"></i><span>Sync Now</span>`;
        refreshIcons();
      }, 2000);
    }, 600);
  });

  // Shop Open Toggle
  toggleShopOpen.addEventListener('change', async (e) => {
    const isOpen = e.target.checked;
    shopOpenText.textContent = isOpen ? 'Shop Open' : 'Shop Closed';
    shopOpenText.className = isOpen ? 'text-xs font-bold text-emerald-700' : 'text-xs font-bold text-rose-600';
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopOpen: isOpen })
    });
  });

  // Counter Approval Toggles
  toggleCounterPaid.addEventListener('change', async (e) => {
    agentState.autoPrintPaid = e.target.checked;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoPrintEnabled: e.target.checked })
    });
  });

  toggleCounterCash.addEventListener('change', async (e) => {
    agentState.allowCash = e.target.checked;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowCash: e.target.checked })
    });
  });

  // Refresh Printers
  btnRefreshPrinters.addEventListener('click', () => {
    fetchPrinters();
  });

  // Save Printers Selection
  btnSavePrinters.addEventListener('click', async () => {
    btnSavePrinters.textContent = 'Saving...';
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedBwPrinter: printerSelectBw.value,
        selectedColorPrinter: printerSelectColor.value
      })
    });
    btnSavePrinters.textContent = 'Saved!';
    updateReadyPrintersCount();
    setTimeout(() => { btnSavePrinters.textContent = 'Save Settings'; }, 2000);
  });

  // Printer dropdown changes
  printerSelectBw.addEventListener('change', updateReadyPrintersCount);
  printerSelectColor.addEventListener('change', updateReadyPrintersCount);

  // Test Print Buttons
  document.querySelectorAll('.btn-test-print').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.getAttribute('data-type');
      const selected = type === 'bw' ? printerSelectBw.value : printerSelectColor.value;
      btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-brand-600"></i>`;
      refreshIcons();
      try {
        await fetch('/api/printers/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ printerName: selected })
        });
        alert(`Test sheet sent to ${selected || 'Default Printer'}!`);
      } catch (e) {
        alert('Test print error: ' + e.message);
      } finally {
        btn.innerHTML = `<i data-lucide="printer" class="w-3.5 h-3.5"></i>`;
        refreshIcons();
      }
    });
  });

  // Paper & Ink Pills
  document.querySelectorAll('.paper-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.paper-pill').forEach(p => {
        p.className = 'paper-pill px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 hover:bg-slate-100';
      });
      pill.className = 'paper-pill active px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800';
    });
  });

  // Order Filters
  document.querySelectorAll('.order-filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.order-filter-pill').forEach(b => {
        b.className = 'order-filter-pill px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50';
      });
      btn.className = 'order-filter-pill active px-2.5 py-1 rounded-lg text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200';
      agentState.filter = btn.getAttribute('data-filter');
      renderOrders();
    });
  });

  // Print button click in table (delegation)
  ordersListContainer.addEventListener('click', (e) => {
    const printBtn = e.target.closest('.btn-direct-print');
    if (printBtn) {
      const orderId = printBtn.getAttribute('data-id');
      const order = agentState.orders.find(o => o.id === orderId);
      if (order) triggerDirectPrint(order);
    }
  });

  // WhatsApp Report
  btnWhatsappReport.addEventListener('click', () => {
    const today = new Date().toLocaleDateString('en-GB');
    const totalRev = statTotalEarned.textContent;
    const count = statOrdersToday.textContent;
    const text = encodeURIComponent(`*${agentState.settings?.shopName || 'QuickPrint'} - Daily Summary (${today})*\n\nOrders Today: ${count}\nTotal Earned: ${totalRev}\n\nGenerated via QuickPrint Agent.`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  });

  // Save as PDF / Print report
  btnSavePdf.addEventListener('click', () => {
    window.print();
  });

  // Edit Shop Modal
  btnEditShop.addEventListener('click', () => {
    if (agentState.settings) {
      inputShopName.value = agentState.settings.shopName || '';
      inputUpiId.value = agentState.settings.upiId || '';
      inputBwRate.value = agentState.settings.pricing?.bwPerA4Page || 3;
      inputColorRate.value = agentState.settings.pricing?.colorPerA4Page || 10;
    }
    shopSettingsModal.classList.remove('hidden');
  });

  const closeShopModal = () => shopSettingsModal.classList.add('hidden');
  btnCloseShopSettings.addEventListener('click', closeShopModal);
  btnCancelShopSettings.addEventListener('click', closeShopModal);

  btnSaveShopSettings.addEventListener('click', async () => {
    const payload = {
      shopName: inputShopName.value.trim(),
      upiId: inputUpiId.value.trim(),
      pricing: {
        bwPerA4Page: parseFloat(inputBwRate.value) || 3,
        colorPerA4Page: parseFloat(inputColorRate.value) || 10
      }
    };
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    await fetchSettings();
    closeShopModal();
  });
}

window.addEventListener('DOMContentLoaded', init);
