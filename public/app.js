/**
 * QuickPrint Customer Web App (QR Se Print Client Engine)
 * Fully handles:
 * 1. Shop Info & Pricing Sync
 * 2. Multi-format Uploads (PDF, Images, Word) with live progress
 * 3. PDF.js Instant Rendering & Thumbnail Canvas
 * 4. Image Editing: Rotate, Contrast, Crop
 * 5. Step 3: Print Options (B&W/Color, Duplex, Custom Page Range)
 * 6. Step 4: UPI Dynamic QR (GPay, PhonePe, Paytm, BHIM) + Cash at Counter
 * 7. Live Print Dispatch, Audio Chime & Status Tracker
 */

// Configure PDF.js Worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Global State
const state = {
  shopInfo: {
    name: 'Hasulots technologies',
    address: 'Main Road, Opp. Bus Stand',
    phone: '+91 98765 43210',
    upiId: 'hasulots@upi',
    upiName: 'Hasulots technologies',
    priceBw: 3,
    priceColor: 10,
    publicUrl: ''
  },
  currentStep: 1,
  uploadedFile: null,      // server response: { filename, originalName, pageCount, fileUrl }
  localFile: null,         // raw File object
  pdfDoc: null,            // pdfjs document
  currentPage: 1,
  totalPages: 1,
  selectedPages: [],       // array of 1-based page numbers
  pageRangeMode: 'all',    // 'all' | 'custom'
  colorMode: 'bw',         // 'bw' | 'color'
  isDuplex: false,
  copies: 1,
  totalPrice: 0,
  payMethod: 'online',     // 'online' | 'counter'
  rotation: 0,
  brightness: 0,
  contrast: 0,
  orderId: null,
  orderNumber: null
};

// Utility: Show / Hide
function show(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.classList.remove('hidden');
}
function hide(el) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.classList.add('hidden');
}

// Toast
function toast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// Step Navigation Indicator
function setStep(num) {
  state.currentStep = num;
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById(`s${i}`);
    if (!s) continue;
    s.classList.remove('active', 'done');
    if (i < num) s.classList.add('done');
    else if (i === num) s.classList.add('active');
  }
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', async () => {
  await loadShopInfo();
  setupDragAndDrop();
  selectPayMethod('online');
  setupCustomerWebSocket();
});

// Load Shop Info & Pricing from /api/info
async function loadShopInfo() {
  try {
    const res = await fetch('/api/info');
    if (!res.ok) throw new Error('Failed to fetch info');
    const data = await res.json();
    
    // Check if URL has a specific shopId
    const pathParts = window.location.pathname.split('/');
    const shopSlug = pathParts[pathParts.length - 1];
    
    const settings = data.settings || {};
    state.shopInfo.name = settings.shopName || 'Hasulots technologies';
    state.shopInfo.address = settings.shopAddress || 'Main Road, Opp. Bus Stand';
    state.shopInfo.phone = settings.shopPhone || '+91 98765 43210';
    state.shopInfo.upiId = settings.upiId || 'hasulots@upi';
    state.shopInfo.upiName = settings.upiName || state.shopInfo.name;
    state.shopInfo.priceBw = (settings.pricing && settings.pricing.bwPerA4Page) || 3;
    state.shopInfo.priceColor = (settings.pricing && settings.pricing.colorPerA4Page) || 10;
    state.shopInfo.publicUrl = data.baseUrl || window.location.origin;
    const isShopOpen = settings.shopOpen !== false;
    updateCustomerShopOpenStatus(isShopOpen);
    const phoneEl = document.getElementById('closedShopPhone');
    if (phoneEl) phoneEl.textContent = state.shopInfo.phone || '+91 98765 43210';
    const sNameEl = document.getElementById('closedShopName');
    if (sNameEl) sNameEl.textContent = state.shopInfo.name;

    // Update Header Badges
    const nameEl = document.getElementById('shopName');
    if (nameEl) nameEl.textContent = state.shopInfo.name;

    const addrEl = document.getElementById('shopAddr');
    if (addrEl) addrEl.textContent = state.shopInfo.address;

    const bwEl = document.getElementById('priceBWBadge');
    if (bwEl) bwEl.textContent = `B&W: ₹${state.shopInfo.priceBw}/page`;

    const clrEl = document.getElementById('priceColorBadge');
    if (clrEl) clrEl.textContent = `Color: ₹${state.shopInfo.priceColor}/page`;

    const optBw = document.getElementById('optBWPrice');
    if (optBw) optBw.textContent = `₹${state.shopInfo.priceBw}/page`;

    const optClr = document.getElementById('optColorPrice');
    if (optClr) optClr.textContent = `₹${state.shopInfo.priceColor}/page`;

  } catch (err) {
    console.warn('Using default shop settings:', err);
  }
}

// Shop Info Modal
function openShopInfo() {
  const modal = document.getElementById('shopInfoModal');
  const box = document.getElementById('shopInfoBox');
  if (!modal || !box) return;

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="margin:0;font-size:17px;font-weight:800;color:var(--ink);">🏪 ${state.shopInfo.name}</h3>
      <button onclick="closeShopInfo()" style="border:none;background:none;font-size:20px;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:13px;color:var(--ink-2);line-height:1.7;">
      <p style="margin:4px 0;">📍 <b>Address:</b> ${state.shopInfo.address}</p>
      <p style="margin:4px 0;">📞 <b>Phone:</b> ${state.shopInfo.phone || 'Available at Counter'}</p>
      <p style="margin:4px 0;">💳 <b>UPI ID:</b> <code>${state.shopInfo.upiId}</code></p>
      <p style="margin:4px 0;">⚡ <b>Features:</b> Automatic Silent Print · Instant UPI / Cash</p>
    </div>
    <div style="margin-top:16px;">
      <button onclick="closeShopInfo()" style="width:100%;padding:12px;background:var(--violet);color:#fff;border:none;border-radius:12px;font-weight:700;font-size:14px;cursor:pointer;">Close</button>
    </div>
  `;
  modal.style.display = 'flex';
}

function closeShopInfo() {
  const modal = document.getElementById('shopInfoModal');
  if (modal) modal.style.display = 'none';
}

// Drag & Drop
function setupDragAndDrop() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;

  ['dragenter', 'dragover'].forEach(evt => {
    zone.addEventListener(evt, e => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(evt => {
    zone.addEventListener(evt, e => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });

  zone.addEventListener('drop', e => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });
}

// --- STEP 1: FILE UPLOAD ---
function handleFileUpload(input) {
  if (input && input.files && input.files.length > 0) {
    handleFiles(input.files);
  }
}

async function handleFiles(files) {
  const file = files[0];
  if (!file) return;

  state.localFile = file;

  // Show upload progress
  const upWrap = document.getElementById('upProgWrap');
  const upBar = document.getElementById('upProgBar');
  const upPct = document.getElementById('upProgPct');
  if (upWrap) upWrap.style.display = 'block';

  // Upload to server
  const formData = new FormData();
  formData.append('file', file);

  try {
    let progress = 20;
    const progInt = setInterval(() => {
      if (progress < 90) {
        progress += 15;
        if (upBar) upBar.style.width = `${progress}%`;
        if (upPct) upPct.textContent = `${progress}%`;
      }
    }, 150);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    clearInterval(progInt);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Upload failed');
    }

    if (upBar) upBar.style.width = '100%';
    if (upPct) upPct.textContent = '100%';

    const data = await res.json();
    const fileInfo = data.file || data;
    state.uploadedFile = {
      filename: fileInfo.fileId || fileInfo.filename,
      originalName: fileInfo.originalName,
      pageCount: fileInfo.pageCount || 1,
      url: fileInfo.url
    };
    state.totalPages = fileInfo.pageCount || 1;
    state.selectedPages = Array.from({ length: state.totalPages }, (_, i) => i + 1);

    // Render Preview
    await renderInitialThumbnail(file);

    setTimeout(() => {
      if (upWrap) upWrap.style.display = 'none';
      showChoiceScreen();
    }, 300);

  } catch (err) {
    if (upWrap) upWrap.style.display = 'none';
    alert(`Upload Error: ${err.message}`);
  }
}

// Render Page 1 to #choiceCanvas
async function renderInitialThumbnail(file) {
  const canvas = document.getElementById('choiceCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const sub = document.getElementById('choiceSub');
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  if (sub) sub.textContent = `${file.name} · ${sizeMB} MB · ${state.totalPages} page(s)`;

  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      state.pdfDoc = await loadingTask.promise;
      state.totalPages = state.pdfDoc.numPages;
      state.selectedPages = Array.from({ length: state.totalPages }, (_, i) => i + 1);

      const page = await state.pdfDoc.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      return;
    } catch (pdfErr) {
      console.warn('PDF.js render fallback:', pdfErr);
    }
  }

  // Image fallback
  if (file.type.startsWith('image/')) {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    };
    img.src = URL.createObjectURL(file);
    return;
  }

  // Document placeholder
  canvas.width = 400;
  canvas.height = 500;
  ctx.fillStyle = '#f8f7fc';
  ctx.fillRect(0, 0, 400, 500);
  ctx.fillStyle = '#7c3aed';
  ctx.font = 'bold 36px "Plus Jakarta Sans"';
  ctx.textAlign = 'center';
  ctx.fillText('📄 ' + (file.name.split('.').pop().toUpperCase()), 200, 240);
  ctx.font = '16px "Plus Jakarta Sans"';
  ctx.fillStyle = '#666';
  ctx.fillText(`${state.totalPages} Page Document`, 200, 280);
}

// --- STEP 2: CHOICE & EDITOR ---
function showChoiceScreen() {
  hide('secUpload');
  hide('secEditor');
  hide('secPreviewStep');
  hide('secPayment');
  hide('secSuccess');
  show('secChoice');
  setStep(2);
}

function chooseAllGood() {
  // Fast path: skip editor, jump to preview
  goToPreview();
}

function chooseEdit() {
  hide('secChoice');
  show('secEditor');
  renderEditorCanvas();
}

function backToUpload() {
  hide('secChoice');
  hide('secEditor');
  hide('secPreviewStep');
  hide('secPayment');
  hide('secSuccess');
  show('secUpload');
  setStep(1);
}

function renderEditorCanvas() {
  const container = document.getElementById('a4Canvas');
  const choiceCanvas = document.getElementById('choiceCanvas');
  if (!container || !choiceCanvas) return;

  container.innerHTML = '';
  const edCanvas = document.createElement('canvas');
  edCanvas.id = 'editorActiveCanvas';
  edCanvas.width = choiceCanvas.width;
  edCanvas.height = choiceCanvas.height;
  const ctx = edCanvas.getContext('2d');
  ctx.drawImage(choiceCanvas, 0, 0);

  applyCanvasFilters(edCanvas);
  container.appendChild(edCanvas);

  const ind = document.getElementById('pageIndicator');
  if (ind) ind.textContent = `Showing Page ${state.currentPage} of ${state.totalPages} Pages`;
}

function applyCanvasFilters(canvas) {
  if (!canvas) canvas = document.getElementById('editorActiveCanvas');
  if (!canvas) return;

  const scale = state.zoomScale || 1;
  canvas.style.transform = `rotate(${state.rotation}deg) scale(${scale})`;
  canvas.style.filter = `brightness(${100 + state.brightness}%) contrast(${100 + state.contrast}%)`;
}

// Editor Tools
function nudgeRotation(deg) {
  state.rotation = (state.rotation + deg) % 360;
  applyCanvasFilters();
  toast(`Rotated ${state.rotation}°`);
}

function resetRotation() {
  state.rotation = 0;
  applyCanvasFilters();
}

function toolToggleRotate() {
  const panel = document.getElementById('rotatePanel');
  if (panel) panel.classList.toggle('hidden');
}

function toolToggleAdjust() {
  const panel = document.getElementById('adjustPanel');
  if (panel) panel.classList.toggle('hidden');
}

function applyAdjustments() {
  const b = document.getElementById('adjBrightness');
  const c = document.getElementById('adjContrast');
  if (b) state.brightness = parseInt(b.value, 10);
  const bVal = document.getElementById('adjBrightnessVal');
  if (bVal) bVal.textContent = state.brightness;

  if (c) state.contrast = parseInt(c.value, 10);
  const cVal = document.getElementById('adjContrastVal');
  if (cVal) cVal.textContent = state.contrast;

  applyCanvasFilters();
}

function resetAdjustments() {
  state.brightness = 0;
  state.contrast = 0;
  const b = document.getElementById('adjBrightness');
  if (b) b.value = 0;
  const c = document.getElementById('adjContrast');
  if (c) c.value = 0;
  applyAdjustments();
}

function toolAutoA4() {
  state.rotation = 0;
  state.brightness = 0;
  state.contrast = 0;
  state.zoomScale = 1;
  const zs = document.getElementById('zoomSlider');
  if (zs) zs.value = 50;
  applyCanvasFilters();
  toast('Auto-fit applied');
}

function zoomSliderInput(val) {
  const factor = 0.5 + (parseInt(val, 10) / 100) * 1.5; // 0.5x to 2.0x
  state.zoomScale = factor;
  applyCanvasFilters();
}

function onRotateSlider() {
  const rotSlider = document.getElementById('rotSlider');
  if (rotSlider) {
    state.rotation = parseInt(rotSlider.value, 10);
    const rotVal = document.getElementById('rotVal');
    if (rotVal) rotVal.textContent = state.rotation + '°';
    applyCanvasFilters();
  }
}

function changePaperSize() {
  const sel = document.getElementById('paperSizeSel');
  if (sel) {
    state.paperSize = sel.value;
    toast('Paper size: ' + sel.value.toUpperCase());
  }
}

function toggleOrientation() {
  state.isLandscape = !state.isLandscape;
  const btn = document.getElementById('orientBtn');
  if (btn) {
    btn.textContent = state.isLandscape ? '📃 Landscape' : '📄 Portrait';
  }
  toast(state.isLandscape ? 'Landscape layout' : 'Portrait layout');
}

function toolPerspectiveCrop() {
  const choiceCanvas = document.getElementById('choiceCanvas');
  if (!choiceCanvas) return;
  const img = new Image();
  img.onload = () => {
    cropSourceImage = img;
    initPerspectiveCropOverlay();
  };
  img.src = choiceCanvas.toDataURL();
}

function triggerAddDocument() {
  const inp = document.getElementById('addDocInput');
  if (inp) {
    inp.value = '';
    inp.click();
  }
}

function handleAddDocument(input) {
  if (!input || !input.files || input.files.length === 0) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const addImg = new Image();
    addImg.onload = () => {
      const choiceCanvas = document.getElementById('choiceCanvas');
      if (!choiceCanvas) return;
      const ctx = choiceCanvas.getContext('2d');
      // If single card, append added document to bottom half!
      const targetW = 760;
      const targetH = Math.round(targetW * (addImg.height / addImg.width));
      const x = Math.round((choiceCanvas.width - targetW) / 2);
      const y = Math.round(choiceCanvas.height / 2) + 40;

      ctx.drawImage(addImg, x, y, targetW, targetH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, targetW, targetH);

      renderEditorCanvas();
      toast('Document added to page');
    };
    addImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function changeEditorPage(delta) {
  const next = state.currentPage + delta;
  if (next >= 1 && next <= state.totalPages) {
    state.currentPage = next;
    renderEditorCanvas();
  }
}

let photoBorderActive = false;
function toolToggleBorder() {
  const p = document.getElementById('borderPanel');
  if (p) p.classList.toggle('hidden');
}

function toggleBorderOn() {
  photoBorderActive = !photoBorderActive;
  const btn = document.getElementById('borderToggleBtn');
  if (btn) btn.textContent = photoBorderActive ? 'On' : 'Off';
  const edCanvas = document.getElementById('editorActiveCanvas');
  if (edCanvas) {
    edCanvas.style.outline = photoBorderActive ? '3px solid #000' : 'none';
  }
}

function onBorderSlider() {
  const s = document.getElementById('borderSlider');
  const v = document.getElementById('borderVal');
  if (s && v) {
    v.textContent = s.value;
    const edCanvas = document.getElementById('editorActiveCanvas');
    if (edCanvas && photoBorderActive) {
      edCanvas.style.outline = s.value + 'px solid #000';
    }
  }
}

// --- STEP 3: PREVIEW & OPTIONS ---
async function goToPreview() {
  hide('secChoice');
  hide('secEditor');
  hide('secPayment');
  hide('secSuccess');
  show('secPreviewStep');
  setStep(3);

  // Setup page range box if multipage
  const rangeBox = document.getElementById('pageRangeBox');
  const rangeTotal = document.getElementById('rangeTotalPages');
  if (rangeTotal) rangeTotal.textContent = state.totalPages;

  if (state.totalPages > 1) {
    if (rangeBox) rangeBox.style.display = 'block';
    const nav = document.getElementById('previewPageNav');
    if (nav) nav.style.display = 'flex';
  } else {
    if (rangeBox) rangeBox.style.display = 'none';
  }

  // Setup duplex row
  const dupRow = document.getElementById('duplexRow');
  if (dupRow && state.totalPages > 1) {
    dupRow.style.display = 'block';
  }

  await renderPreviewPage(state.currentPage);
}

function backToEditor() {
  hide('secPreviewStep');
  show('secChoice');
  setStep(2);
}

async function renderPreviewPage(pageNum) {
  const img = document.getElementById('finalPreviewImg');
  const curNum = document.getElementById('curPgNum');
  const totNum = document.getElementById('totalPgNum');
  if (curNum) curNum.textContent = pageNum;
  if (totNum) totNum.textContent = state.totalPages;

  const pill = document.getElementById('pvPagesPill');
  const effCount = getEffectivePageCount();
  if (pill) pill.textContent = `${effCount} Page${effCount > 1 ? 's' : ''}`;

  if (state.pdfDoc) {
    try {
      const page = await state.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.2 });
      const offCanvas = document.createElement('canvas');
      offCanvas.width = viewport.width;
      offCanvas.height = viewport.height;
      const ctx = offCanvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      if (img) img.src = offCanvas.toDataURL();
      return;
    } catch (err) {
      console.warn('PDF preview render error:', err);
    }
  }

  // Fallback to choiceCanvas
  const choiceCanvas = document.getElementById('choiceCanvas');
  if (choiceCanvas && img) {
    img.src = choiceCanvas.toDataURL();
  }
}

function changePreviewPage(delta) {
  const next = state.currentPage + delta;
  if (next >= 1 && next <= state.totalPages) {
    state.currentPage = next;
    renderPreviewPage(state.currentPage);
  }
}

// Page Range
function setPageRangeMode(mode) {
  state.pageRangeMode = mode;
  const allBtn = document.getElementById('rangeAllBtn');
  const custBtn = document.getElementById('rangeCustomBtn');
  const input = document.getElementById('rangeInput');

  if (mode === 'all') {
    if (allBtn) allBtn.classList.add('on');
    if (custBtn) custBtn.classList.remove('on');
    if (input) input.classList.add('hidden');
    state.selectedPages = Array.from({ length: state.totalPages }, (_, i) => i + 1);
  } else {
    if (allBtn) allBtn.classList.remove('on');
    if (custBtn) custBtn.classList.add('on');
    if (input) input.classList.remove('hidden');
    updateRangeFromInput();
  }

  const pill = document.getElementById('pvPagesPill');
  const eff = getEffectivePageCount();
  if (pill) pill.textContent = `${eff} Page${eff > 1 ? 's' : ''}`;
}

function updateRangeFromInput() {
  const input = document.getElementById('rangeInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    state.selectedPages = Array.from({ length: state.totalPages }, (_, i) => i + 1);
    return;
  }

  const pages = new Set();
  const parts = val.split(',');
  for (const part of parts) {
    const sub = part.trim();
    if (sub.includes('-')) {
      const [start, end] = sub.split('-').map(n => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.max(1, start); p <= Math.min(state.totalPages, end); p++) {
          pages.add(p);
        }
      }
    } else {
      const p = parseInt(sub, 10);
      if (!isNaN(p) && p >= 1 && p <= state.totalPages) {
        pages.add(p);
      }
    }
  }

  state.selectedPages = Array.from(pages).sort((a, b) => a - b);
  const pill = document.getElementById('pvPagesPill');
  const eff = getEffectivePageCount();
  if (pill) pill.textContent = `${eff} Page${eff > 1 ? 's' : ''}`;
}

function getEffectivePageCount() {
  return state.selectedPages.length > 0 ? state.selectedPages.length : 1;
}

// Color Mode
function setColorMode(mode) {
  state.colorMode = mode;
  const bw = document.getElementById('optBW');
  const clr = document.getElementById('optColor');
  if (mode === 'bw') {
    if (bw) bw.classList.add('sel');
    if (clr) clr.classList.remove('sel');
  } else {
    if (clr) clr.classList.add('sel');
    if (bw) bw.classList.remove('sel');
  }
}

// Duplex Toggle
function toggleDuplex() {
  state.isDuplex = !state.isDuplex;
  const opt = document.getElementById('optDuplex');
  if (!opt) return;
  if (state.isDuplex) {
    opt.classList.add('sel');
  } else {
    opt.classList.remove('sel');
  }
}

// --- STEP 4: PAYMENT ---
function goToOptions() {
  hide('secPreviewStep');
  show('secPayment');
  setStep(4);
  updatePriceSummary();
}

function backToOptions() {
  hide('secPayment');
  show('secPreviewStep');
  setStep(3);
}

function changeCopies(delta) {
  const next = state.copies + delta;
  if (next >= 1 && next <= 50) {
    state.copies = next;
    const num = document.getElementById('copiesNum');
    if (num) num.textContent = state.copies;
    updatePriceSummary();
  }
}

function updatePriceSummary() {
  const pages = getEffectivePageCount();
  const rate = state.colorMode === 'bw' ? state.shopInfo.priceBw : state.shopInfo.priceColor;
  let total = pages * state.copies * rate;

  // Duplex slight discount if active
  if (state.isDuplex && pages > 1) {
    total = Math.max(1, Math.round(total * 0.9));
  }

  state.totalPrice = Math.max(1, total);

  // Update Summary UI
  const sumType = document.getElementById('sumType');
  if (sumType) sumType.textContent = state.colorMode === 'bw' ? 'B&W Print' : 'Color Print';

  const sumPerPage = document.getElementById('sumPerPage');
  if (sumPerPage) sumPerPage.textContent = `₹${rate}/page`;

  const sumPages = document.getElementById('sumPages');
  if (sumPages) sumPages.textContent = `${pages} page(s) × ${state.copies} copy`;

  const sumAmt = document.getElementById('sumPagesAmt');
  if (sumAmt) sumAmt.textContent = `₹${state.totalPrice}`;

  const sumTotal = document.getElementById('sumTotal');
  if (sumTotal) sumTotal.textContent = `₹${state.totalPrice}`;

  const payAmt = document.getElementById('payConfirmAmt');
  if (payAmt) payAmt.textContent = `₹${state.totalPrice}`;

  const upiQrAmt = document.getElementById('upiQrAmount');
  if (upiQrAmt) upiQrAmt.textContent = `Amount: ₹${state.totalPrice}`;

  // Update Dynamic UPI Links & QR
  generateUpiLinks();
}

function selectPayMethod(method) {
  state.payMethod = method;
  const pmOnline = document.getElementById('pmOnline');
  const pmCounter = document.getElementById('pmCounter');
  const qrWrap = document.getElementById('upiQrWrap');
  const payNote = document.getElementById('payNote');
  const payConfirmBtn = document.getElementById('payConfirmBtn');

  if (method === 'online') {
    if (pmOnline) pmOnline.classList.add('sel');
    if (pmCounter) pmCounter.classList.remove('sel');
    if (qrWrap) qrWrap.classList.remove('hidden');
    if (payNote) payNote.textContent = 'Instant silent print will start immediately after payment verification.';
    if (payConfirmBtn) {
      const pc = payConfirmBtn.querySelector('.pc-tx');
      if (pc) pc.textContent = '💳 Pay via UPI & Print';
    }
  } else {
    if (pmCounter) pmCounter.classList.add('sel');
    if (pmOnline) pmOnline.classList.remove('sel');
    if (qrWrap) qrWrap.classList.add('hidden');
    if (payNote) payNote.textContent = 'Pay cash at counter. Shopkeeper will confirm and your document will print.';
    if (payConfirmBtn) {
      const pc = payConfirmBtn.querySelector('.pc-tx');
      if (pc) pc.textContent = '💵 Confirm Order (Pay Cash)';
    }
  }
}

// Generate Dynamic UPI QR & App Links
async function generateUpiLinks() {
  const upiId = state.shopInfo.upiId || 'shop@upi';
  const name = encodeURIComponent(state.shopInfo.upiName || 'QuickPrint');
  const amt = state.totalPrice;
  const note = encodeURIComponent(`Order-QP-${Date.now().toString().slice(-4)}`);

  const upiUri = `upi://pay?pa=${upiId}&pn=${name}&am=${amt}&tn=${note}&cu=INR`;

  // App specific links
  const gpayLink = document.getElementById('btnGPay');
  if (gpayLink) gpayLink.href = upiUri;

  const phonepeLink = document.getElementById('btnPhonePe');
  if (phonepeLink) phonepeLink.href = `phonepe://pay?pa=${upiId}&pn=${name}&am=${amt}&tn=${note}&cu=INR`;

  const paytmLink = document.getElementById('btnPaytm');
  if (paytmLink) paytmLink.href = `paytmmp://pay?pa=${upiId}&pn=${name}&am=${amt}&tn=${note}&cu=INR`;

  const bhimLink = document.getElementById('btnBhim');
  if (bhimLink) bhimLink.href = upiUri;

  // Fetch QR Code Image from server /api/qr
  try {
    const res = await fetch(`/api/qr?text=${encodeURIComponent(upiUri)}&width=200`);
    if (res.ok) {
      const data = await res.json();
      const qrImg = document.getElementById('upiQrImg');
      if (qrImg) qrImg.src = data.qr;
    }
  } catch (err) {
    console.warn('QR generation fetch failed:', err);
  }
}

// Confirm & Pay / Create Order
async function confirmAndPay() {
  if (!state.uploadedFile) {
    alert('Please upload a file first.');
    return;
  }

  const isOnline = state.payMethod === 'online';
  await submitFinalOrder(isOnline ? 'completed' : 'pending_cash');
}

// Simulation button for testing auto-print
async function simulatePaymentSuccess() {
  await submitFinalOrder('completed');
}

async function submitFinalOrder(paymentStatus) {
  const payConfirmBtn = document.getElementById('payConfirmBtn');
  if (payConfirmBtn) payConfirmBtn.disabled = true;

  try {
    const payload = {
      fileId: state.uploadedFile.filename,
      originalName: state.uploadedFile.originalName,
      pageCount: getEffectivePageCount(),
      pageRange: state.pageRangeMode === 'custom' ? state.selectedPages.join(',') : 'all',
      copies: state.copies,
      colorMode: state.colorMode,
      duplex: state.isDuplex ? 'double' : 'single',
      customerName: 'Mobile Customer'
    };

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('Order creation failed');
    const data = await res.json();
    const order = data.order || data;

    state.orderId = order.id;
    state.orderNumber = order.token || order.id.slice(-6);

    // Order registered in pending payment queue.
    // Document will process ONLY after shopkeeper confirms payment or UPI webhook fires!

    playChime();
    showSuccessScreen(order);

  } catch (err) {
    alert(`Order Error: ${err.message}`);
    if (payConfirmBtn) payConfirmBtn.disabled = false;
  }
}

// --- SUCCESS SCREEN ---
function showSuccessScreen(order) {
  hide('secPayment');
  show('secSuccess');
  setStep(4);

  // Mark all 4 steps done
  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById(`s${i}`);
    if (s) {
      s.classList.remove('active');
      s.classList.add('done');
    }
  }

  const ordEl = document.getElementById('orderId');
  if (ordEl) ordEl.textContent = `ORDER #${order.id}`;

  const numBox = document.getElementById('ordNoBox');
  const numEl = document.getElementById('ordNoNum');
  if (numBox && numEl) {
    numBox.style.display = 'block';
    numEl.textContent = state.orderNumber;
  }

  const finalAmt = document.getElementById('finalAmount');
  if (finalAmt) finalAmt.textContent = `₹${state.totalPrice}`;

  // Start animated tracking
  animateTracking(order);
}

function animateTracking(order) {
  const t1 = document.getElementById('track1');
  const t2 = document.getElementById('track2');
  const t3 = document.getElementById('track3');
  const t4 = document.getElementById('track4');

  if (t1) t1.className = 'status-step-row done';
  if (t2) t2.className = order.paymentStatus === 'completed' ? 'status-step-row done' : 'status-step-row active';
  if (t3) t3.className = 'status-step-row active';

  // Live poll order status from server until payment is verified and printed
  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const d = await res.json();
        const cur = d.order || d;
        if (cur.paymentStatus === 'paid' || cur.status === 'queued' || cur.status === 'printing' || cur.status === 'completed') {
          if (t2) {
            t2.className = 'status-step-row done';
            const t2Txt = t2.querySelector('p');
            if (t2Txt) t2Txt.textContent = '2. Payment Confirmed ✅';
          }
          if (t3) {
            t3.className = 'status-step-row done';
            const t3Txt = document.getElementById('track3Text') || t3.querySelector('p');
            if (t3Txt) t3Txt.textContent = '3. Printing on Physical Printer 🖨️';
          }
        }
        if (cur.status === 'completed') {
          clearInterval(pollInterval);
          if (t4) {
            t4.className = 'status-step-row done active';
            const t4Txt = document.getElementById('track4Text') || t4.querySelector('p');
            if (t4Txt) t4Txt.textContent = '4. Printed Successfully! Collect at Counter';
          }
          const collTitle = document.getElementById('collectTitle');
          if (collTitle) collTitle.textContent = '🎉 Print Ready at Counter!';
          const collMsg = document.getElementById('collectMsg');
          if (collMsg) collMsg.textContent = 'Your prints are ready. Please collect them at the shop counter.';
          playChime();
        }
      }
    } catch (e) {
      console.warn('Status poll warning:', e);
    }
  }, 2000);
}

// Feedback
function sendFeedback(isPositive) {
  const thanks = document.getElementById('fbThanks');
  if (thanks) {
    thanks.style.display = 'block';
    thanks.textContent = isPositive ? '🙏 Thank you for the positive feedback!' : '🙏 Thank you! We will improve.';
  }
}

// Audio Chime
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);       // D5
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch (e) {
    // ignore
  }
}


// ============================================================
// 📱 SPECIALIZED CUSTOMER SERVICES & MODALS (Screenshot Exact Match)
// ============================================================

let activeResumeTemplate = 'classic';
let activePassportSheet = '4x6';
let activePassportCount = 4;

// ============================================================
// 1. AUTO CROP ENGINE & WIZARD (ID CARD / AADHAAR / PAN / VOTER)
// ============================================================

let cropDocType = 'idcard';
let cropCurrentSide = 'front'; // 'front' | 'back'
let cropSourceImage = null;
let cropFrontCanvas = null;
let cropBackCanvas = null;
let cropCorners = [
  { x: 0.08, y: 0.12 },
  { x: 0.92, y: 0.12 },
  { x: 0.92, y: 0.88 },
  { x: 0.08, y: 0.88 }
];
let activeDragCorner = -1;

function openAutoCropModal() {
  cropCurrentSide = 'front';
  cropFrontCanvas = null;
  cropBackCanvas = null;
  show('modalAutoCrop');
  show('cropStepDocType');
  hide('cropStepSource');
  hide('cropStepFrontDone');
}

function closeAutoCropModal() {
  hide('modalAutoCrop');
}

function showCropStepDocType() {
  show('cropStepDocType');
  hide('cropStepSource');
  hide('cropStepFrontDone');
}

function selectCropDocType(type) {
  cropDocType = type;
  hide('cropStepDocType');
  show('cropStepSource');
  hide('cropStepFrontDone');
}

function triggerCameraCapture() {
  closeAutoCropModal();
  const input = document.getElementById('cropCameraInput') || document.getElementById('cameraCaptureInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function triggerFilePickerForCrop() {
  closeAutoCropModal();
  const input = document.getElementById('cropFileInput') || document.getElementById('fileInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function handleCropFileInput(input) {
  if (!input || !input.files || input.files.length === 0) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      cropSourceImage = img;
      initPerspectiveCropOverlay();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Perspective Crop Canvas & Drag Logic (Screenshot 2)
function initPerspectiveCropOverlay() {
  show('cropOverlay');
  const stage = document.getElementById('cropStage');
  const canvas = document.getElementById('cropCanvas');
  if (!stage || !canvas || !cropSourceImage) return;

  const maxW = stage.clientWidth || 340;
  const maxH = stage.clientHeight || 450;
  
  let w = cropSourceImage.naturalWidth || cropSourceImage.width;
  let h = cropSourceImage.naturalHeight || cropSourceImage.height;
  
  const scale = Math.min(maxW / w, maxH / h, 1);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas._imgScale = scale;

  // Reset 4 corners to standard inset
  cropCorners = [
    { x: 0.08, y: 0.12 },
    { x: 0.92, y: 0.12 },
    { x: 0.92, y: 0.88 },
    { x: 0.08, y: 0.88 }
  ];

  drawCropCanvas();
  bindCropCanvasEvents();
}

function drawCropCanvas() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || !cropSourceImage) return;
  const ctx = canvas.getContext('2d');
  const cw = canvas.width;
  const ch = canvas.height;

  // 1. Draw base photo
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(cropSourceImage, 0, 0, cw, ch);

  // Convert normalized corners to pixel coords
  const pts = cropCorners.map(p => ({ x: p.x * cw, y: p.y * ch }));

  // 2. Dark overlay outside the quad
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.rect(0, 0, cw, ch);
  // Cut out the polygon
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.closePath();
  ctx.fill();

  // 3. Polygon stroke (Neon purple / emerald)
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.closePath();
  ctx.stroke();

  // 4. Corner Handles (Glow circle with inner point)
  pts.forEach((pt) => {
    // Outer glow
    ctx.fillStyle = 'rgba(168, 85, 247, 0.45)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
    ctx.fill();

    // Solid circle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function bindCropCanvasEvents() {
  const canvas = document.getElementById('cropCanvas');
  if (!canvas || canvas._hasEvents) return;
  canvas._hasEvents = true;

  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    const pos = getPointerPos(e);
    const px = pos.x * canvas.width;
    const py = pos.y * canvas.height;

    activeDragCorner = -1;
    let minDist = 34; // touch threshold in px

    cropCorners.forEach((c, idx) => {
      const cx = c.x * canvas.width;
      const cy = c.y * canvas.height;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < minDist) {
        minDist = dist;
        activeDragCorner = idx;
      }
    });
  }

  function onPointerMove(e) {
    if (activeDragCorner === -1) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    cropCorners[activeDragCorner] = {
      x: Math.max(0, Math.min(1, pos.x)),
      y: Math.max(0, Math.min(1, pos.y))
    };
    drawCropCanvas();
  }

  function onPointerUp() {
    activeDragCorner = -1;
  }

  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  canvas.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
}

function cropFullPhoto() {
  cropCorners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ];
  drawCropCanvas();
}

function cropCancel() {
  hide('cropOverlay');
}

function cropApply() {
  if (!cropSourceImage) return;
  hide('cropOverlay');

  const sw = cropSourceImage.naturalWidth || cropSourceImage.width;
  const sh = cropSourceImage.naturalHeight || cropSourceImage.height;

  // Calculate destination dimensions
  let targetW = 1000;
  let targetH = 630; // standard 85.6 x 54 ratio for ID cards (Aadhaar / PAN / Voter)

  if (cropDocType === 'certificate') {
    targetW = 1200;
    targetH = 1697; // A4 aspect ratio
  } else if (cropDocType === 'admit') {
    targetW = 1200;
    targetH = 848;  // Half A4 aspect ratio
  } else if (cropDocType === 'auto') {
    const distTop = Math.hypot((cropCorners[1].x - cropCorners[0].x) * sw, (cropCorners[1].y - cropCorners[0].y) * sh);
    const distBot = Math.hypot((cropCorners[2].x - cropCorners[3].x) * sw, (cropCorners[2].y - cropCorners[3].y) * sh);
    const distLeft = Math.hypot((cropCorners[3].x - cropCorners[0].x) * sw, (cropCorners[3].y - cropCorners[0].y) * sh);
    const distRight = Math.hypot((cropCorners[2].x - cropCorners[1].x) * sw, (cropCorners[2].y - cropCorners[1].y) * sh);
    targetW = Math.max(200, Math.round(Math.max(distTop, distBot)));
    targetH = Math.max(200, Math.round(Math.max(distLeft, distRight)));
  }

  // Generate perspective de-skewed canvas
  const cropped = perspectiveWarpQuad(cropSourceImage, cropCorners, targetW, targetH);

  if (cropCurrentSide === 'front') {
    cropFrontCanvas = cropped;
    if (cropDocType === 'idcard') {
      // Show "Front side ho gaya" screen (Screenshot 5)
      show('modalAutoCrop');
      hide('cropStepDocType');
      hide('cropStepSource');
      show('cropStepFrontDone');
      updateFrontPreviewCanvas();
    } else {
      // Single-sided A4 document (Certificate / Admit / Auto)
      assembleA4Document(cropFrontCanvas, null);
    }
  } else if (cropCurrentSide === 'back') {
    cropBackCanvas = cropped;
    closeAutoCropModal();
    // Combine Front & Back on single A4 sheet
    assembleA4Document(cropFrontCanvas, cropBackCanvas);
  }
}

function updateFrontPreviewCanvas() {
  const canvas = document.getElementById('frontPreviewCanvas');
  if (!canvas || !cropFrontCanvas) return;
  const maxW = 240;
  const scale = maxW / cropFrontCanvas.width;
  canvas.width = maxW;
  canvas.height = Math.round(cropFrontCanvas.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(cropFrontCanvas, 0, 0, canvas.width, canvas.height);
}

function rotateFrontCrop() {
  if (!cropFrontCanvas) return;
  const rotated = document.createElement('canvas');
  rotated.width = cropFrontCanvas.height;
  rotated.height = cropFrontCanvas.width;
  const ctx = rotated.getContext('2d');
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(cropFrontCanvas, -cropFrontCanvas.width / 2, -cropFrontCanvas.height / 2);
  cropFrontCanvas = rotated;
  updateFrontPreviewCanvas();
}

function printFrontOnly() {
  closeAutoCropModal();
  assembleA4Document(cropFrontCanvas, null);
}

function startBackSideCapture() {
  cropCurrentSide = 'back';
  hide('cropStepFrontDone');
  show('cropStepSource');
}

// Assemble Final A4 Sheet (Screenshot 1)
function assembleA4Document(front, back) {
  // A4 dimensions at 150 DPI: 1240 x 1754
  const a4 = document.getElementById('choiceCanvas');
  if (!a4) return;
  a4.width = 1240;
  a4.height = 1754;
  const ctx = a4.getContext('2d');

  // Pure White Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, a4.width, a4.height);

  if (!back) {
    // Single card or document centered
    if (cropDocType === 'idcard') {
      const targetW = 760;
      const targetH = Math.round(targetW * (front.height / front.width));
      const x = Math.round((a4.width - targetW) / 2);
      const y = 320;
      ctx.drawImage(front, x, y, targetW, targetH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, targetW, targetH);
    } else {
      const scale = Math.min((a4.width - 100) / front.width, (a4.height - 100) / front.height);
      const targetW = Math.round(front.width * scale);
      const targetH = Math.round(front.height * scale);
      const x = Math.round((a4.width - targetW) / 2);
      const y = Math.round((a4.height - targetH) / 2);
      ctx.drawImage(front, x, y, targetW, targetH);
    }
  } else {
    // Both Front and Back on single A4 sheet! (Aadhaar & Voter Xerox Standard)
    const targetW = 760;
    const frontH = Math.round(targetW * (front.height / front.width));
    const backH = Math.round(targetW * (back.height / back.width));

    const frontX = Math.round((a4.width - targetW) / 2);
    const frontY = 220;

    const backX = Math.round((a4.width - targetW) / 2);
    const backY = frontY + frontH + 180;

    // Draw Front
    ctx.drawImage(front, frontX, frontY, targetW, frontH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(frontX, frontY, targetW, frontH);

    // Draw Back
    ctx.drawImage(back, backX, backY, targetW, backH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(backX, backY, targetW, backH);

    // Subtle dashed cutting guide line in between
    ctx.strokeStyle = '#cbd5e1';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    const midY = frontY + frontH + 90;
    ctx.moveTo(120, midY);
    ctx.lineTo(a4.width - 120, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Update choice screen details
  const sub = document.getElementById('choiceSub');
  if (sub) {
    sub.textContent = back ? 'ID Card (Front & Back) · A4 Sheet · 1 page' : 'Document · A4 Sheet · 1 page';
  }

  // Pre-upload the assembled canvas so state.uploadedFile is ready immediately
  a4.toBlob(async (blob) => {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'idcard_assembled.jpg');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        const fileInfo = data.file || data;
        state.uploadedFile = {
          filename: fileInfo.fileId || fileInfo.filename,
          originalName: back ? 'ID_Card_Front_Back_A4.jpg' : 'Document_A4.jpg',
          pageCount: 1,
          url: fileInfo.url
        };
        state.totalPages = 1;
        state.selectedPages = [1];
      }
    } catch (e) {
      console.warn('Assemble upload error:', e);
    }
  }, 'image/jpeg', 0.95);

  // Switch to Screenshot 1 / 8: secChoice ("All Good — Continue" / "Want to Edit")
  hide('secUpload');
  show('secChoice');
  hide('secEditor');
  hide('secPreviewStep');
  hide('secPayment');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Choice Handlers (Screenshot 1 & 8)
function chooseAllGood() {
  // Fast path: Advance directly to Step 3 (Print Preview)
  goToPreview();
}

function chooseEdit() {
  hide('secChoice');
  show('secEditor');
  renderEditorCanvas();
}

function backToChoice() {
  hide('secEditor');
  show('secChoice');
  setStep(2);
}

// Bake editor transformations (rotation, brightness, contrast) into choiceCanvas
async function confirmEditorAndProceed() {
  const choiceCanvas = document.getElementById('choiceCanvas');
  const edCanvas = document.getElementById('editorActiveCanvas');
  if (choiceCanvas && edCanvas) {
    const isRotated = (state.rotation % 360 !== 0);
    const isFiltered = (state.brightness !== 0 || state.contrast !== 0);

    if (isRotated || isFiltered) {
      const rad = (state.rotation * Math.PI) / 180;
      const temp = document.createElement('canvas');
      temp.width = choiceCanvas.width;
      temp.height = choiceCanvas.height;
      const tCtx = temp.getContext('2d');
      tCtx.drawImage(choiceCanvas, 0, 0);

      let nw = temp.width;
      let nh = temp.height;
      if (Math.abs(state.rotation % 180) === 90) {
        nw = temp.height;
        nh = temp.width;
      }
      choiceCanvas.width = nw;
      choiceCanvas.height = nh;
      const cCtx = choiceCanvas.getContext('2d');

      if (isFiltered) {
        cCtx.filter = `brightness(${100 + state.brightness}%) contrast(${100 + state.contrast}%)`;
      }
      cCtx.translate(nw / 2, nh / 2);
      cCtx.rotate(rad);
      cCtx.drawImage(temp, -temp.width / 2, -temp.height / 2);
      cCtx.filter = 'none';

      // Reset transforms
      state.rotation = 0;
      state.brightness = 0;
      state.contrast = 0;

      // Upload the edited file so the printer prints the edited version!
      choiceCanvas.toBlob(async (blob) => {
        try {
          const formData = new FormData();
          formData.append('file', blob, 'edited_document.jpg');
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          if (res.ok) {
            const data = await res.json();
            const fileInfo = data.file || data;
            state.uploadedFile = {
              filename: fileInfo.fileId || fileInfo.filename,
              originalName: 'Edited_Document.jpg',
              pageCount: 1,
              url: fileInfo.url
            };
          }
        } catch (err) {
          console.warn('Auto upload edited canvas error:', err);
        }
      }, 'image/jpeg', 0.95);
    }
  }
  goToPreview();
}

// 2. PASSPORT PHOTO MODAL
function openPassportModal() {
  show('modalPassport');
}

function closePassportModal() {
  hide('modalPassport');
}

function selectPassportSheet(sheet) {
  activePassportSheet = sheet;
  const b4 = document.getElementById('sheet4x6Box');
  const ba = document.getElementById('sheetA4Box');
  if (sheet === '4x6') {
    if (b4) b4.classList.add('sel');
    if (ba) ba.classList.remove('sel');
  } else {
    if (ba) ba.classList.add('sel');
    if (b4) b4.classList.remove('sel');
  }
}

function setPassportCount(n, el) {
  activePassportCount = n;
  if (el && el.parentElement) {
    el.parentElement.querySelectorAll('.count-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
  }
}

function triggerPassportUpload() {
  closePassportModal();
  const pf = document.getElementById('passportFileInput');
  if (pf) pf.click();
  else {
    const fi = document.getElementById('fileInput');
    if (fi) fi.click();
  }
}

function handlePassportImageFile(input) {
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // Compose Passport Grid on Canvas
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 1800; // 4x6 proportion
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const count = activePassportCount || (activePassportSheet === 'a4' ? 24 : 6);
      if (activePassportSheet === 'a4') {
        canvas.width = 1240;
        canvas.height = 1754; // A4
      } else {
        canvas.width = 1200;
        canvas.height = 1800; // 4x6
      }
      const cols = activePassportSheet === 'a4' ? (count > 24 ? 6 : (count > 12 ? 4 : 3)) : (count > 6 ? 4 : 2);
      const rows = Math.ceil(count / cols);
      const cellW = (canvas.width - 120) / cols;
      const cellH = (canvas.height - 120) / rows;

      let drawn = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (drawn >= count) break;
          const x = 60 + c * cellW + 10;
          const y = 60 + r * cellH + 10;
          const w = cellW - 20;
          const h = cellH - 20;

          // Draw photo with cutting border
          ctx.drawImage(img, x, y, w, h);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          drawn++;
        }
      }

      canvas.toBlob((blob) => {
        const passportFile = new File([blob], 'passport_' + count + '_photos.jpg', { type: 'image/jpeg' });
        handleFiles([passportFile]);
      }, 'image/jpeg', 0.95);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 3. RESUME MAKER MODAL
function openResumeModal() {
  show('modalResume');
  show('resumeStepTemplate');
  hide('resumeStepDetails');
  const rs1 = document.getElementById('rs1');
  const rs2 = document.getElementById('rs2');
  if (rs1) rs1.className = 'r-step active';
  if (rs2) rs2.className = 'r-step';
}

function closeResumeModal() {
  hide('modalResume');
}

function selectResumeTpl(tpl) {
  activeResumeTemplate = tpl;
  ['tplClassic', 'tplBlue', 'tplModern', 'tplCV'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('sel');
  });
  const selEl = document.getElementById('tpl' + tpl.charAt(0).toUpperCase() + tpl.slice(1));
  if (selEl) selEl.classList.add('sel');
}

function proceedToResumeDetails() {
  hide('resumeStepTemplate');
  show('resumeStepDetails');
  const rs1 = document.getElementById('rs1');
  const rs2 = document.getElementById('rs2');
  if (rs1) rs1.className = 'r-step done';
  if (rs2) rs2.className = 'r-step active';
}

function backToResumeTemplate() {
  show('resumeStepTemplate');
  hide('resumeStepDetails');
  const rs1 = document.getElementById('rs1');
  const rs2 = document.getElementById('rs2');
  if (rs1) rs1.className = 'r-step active';
  if (rs2) rs2.className = 'r-step';
}

function generateResumeAndPrint() {
  const name = document.getElementById('resName')?.value || 'Ramesh Kumar';
  const phone = document.getElementById('resPhone')?.value || '+91 9876543210';
  const email = document.getElementById('resEmail')?.value || 'ramesh@example.com';
  const role = document.getElementById('resRole')?.value || 'Executive / Professional';
  const edu = document.getElementById('resEdu')?.value || 'Graduate (2022)';
  const exp = document.getElementById('resExp')?.value || 'Skills: MS Office, Tally, English & Tamil Communication';

  // Create High-Res A4 Resume Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754; // A4 @ 150 DPI
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Template specific drawing
  if (activeResumeTemplate === 'blue') {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(0, 0, canvas.width, 180);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(name.toUpperCase(), 80, 90);
    ctx.font = '24px sans-serif';
    ctx.fillText(role + '  |  ' + phone + '  |  ' + email, 80, 140);
  } else if (activeResumeTemplate === 'modern') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 360, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(name, 40, 120);
    ctx.font = '20px sans-serif';
    ctx.fillText(phone, 40, 180);
    ctx.fillText(email, 40, 220);
  } else if (activeResumeTemplate === 'cv') {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 44px serif';
    ctx.textAlign = 'center';
    ctx.fillText(name.toUpperCase(), canvas.width / 2, 110);
    ctx.font = '22px sans-serif';
    ctx.fillText(phone + '  •  ' + email + '  •  ' + role, canvas.width / 2, 160);
    ctx.textAlign = 'left';
  } else {
    // Classic
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 46px sans-serif';
    ctx.fillText(name.toUpperCase(), 80, 110);
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(phone + '   |   ' + email, 80, 155);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80, 180);
    ctx.lineTo(canvas.width - 80, 180);
    ctx.stroke();
  }

  // Resume Body Content
  let startX = activeResumeTemplate === 'modern' ? 420 : 80;
  let curY = activeResumeTemplate === 'blue' ? 260 : (activeResumeTemplate === 'cv' ? 240 : 260);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('PROFESSIONAL SUMMARY', startX, curY);
  curY += 40;
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText('Motivated and detail-oriented ' + role + ' ready to contribute effectively.', startX, curY);
  curY += 70;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('EDUCATION & QUALIFICATION', startX, curY);
  curY += 40;
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(edu, startX, curY);
  curY += 70;

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('EXPERIENCE & KEY SKILLS', startX, curY);
  curY += 40;
  ctx.font = '22px sans-serif';
  ctx.fillStyle = '#334155';
  const lines = exp.split('\n');
  lines.forEach(l => {
    ctx.fillText(l, startX, curY);
    curY += 36;
  });

  closeResumeModal();
  toast('Resume Generated Successfully!');

  canvas.toBlob((blob) => {
    const resumeFile = new File([blob], 'Resume_' + name.replace(/\s+/g, '_') + '.png', { type: 'image/png' });
    handleFiles([resumeFile]);
  }, 'image/png');
}

// 4. MINI PRINT FROM MENU
function openMiniPrintFromMenu() {
  toast('Please select document for Mini Print (Multiple pages on 1 sheet)');
  const fi = document.getElementById('fileInput');
  if (fi) fi.click();
}

// 5. BIG SIZE PRINT MODAL
function openBigSizeModal() {
  show('modalBigSize');
}

function closeBigSizeModal() {
  hide('modalBigSize');
}

function selectBigSizeFormat(fmt) {
  closeBigSizeModal();
  toast('Selected format: ' + fmt.toUpperCase());
  const fi = document.getElementById('fileInput');
  if (fi) fi.click();
}

// 6. DOCUMENT PRINT DEFAULT
function selectDocPrint() {
  const fi = document.getElementById('fileInput');
  if (fi) fi.click();
}

// 7. DIGITAL SIGN & PASSWORD PDF HELPERS
function showDsigInfo() {
  toast('✍️ Digital Signature Verification Active: All government sign certificates are verified before printing.');
}

function openPasswordModal() {
  const pw = document.getElementById('pwOverlay');
  if (pw) show(pw);
}

// 8. BILINGUAL LANGUAGE SWITCHER (English / Tamil)
function changeCustLang(lang) {
  const isTa = lang === 'ta';
  const nameEl = document.querySelector('.upload-zone h3');
  if (nameEl) nameEl.textContent = isTa ? 'ஆவணத்தை பதிவேற்றவும்' : 'Upload Document';
  
  const hintEl = document.querySelector('.upbtn-hint');
  if (hintEl) hintEl.textContent = isTa ? '👉 கோப்பைத் தேர்ந்தெடுக்க தட்டவும்' : '👉 Tap here or drag & drop your file';

  const btnEl = document.querySelector('.upbtn');
  if (btnEl) btnEl.textContent = isTa ? 'கோப்புகளை தேர்ந்தெடுக்கவும்' : 'Choose Files';

  toast(isTa ? 'மொழி தமிழுக்கு மாற்றப்பட்டது' : 'Language set to English');
}


// --- SHOP OPEN / CLOSED STATE MANAGEMENT ---
function updateCustomerShopOpenStatus(isOpen) {
  const closedSec = document.getElementById('secShopClosed');
  const uploadSec = document.getElementById('secUpload');
  const stepsEl = document.querySelector('.steps');
  const choiceSec = document.getElementById('secChoice');
  const editorSec = document.getElementById('secEditor');
  const previewSec = document.getElementById('secPreviewStep');
  const paySec = document.getElementById('secPayment');

  if (!isOpen) {
    if (uploadSec) uploadSec.classList.add('hidden');
    if (choiceSec) choiceSec.classList.add('hidden');
    if (editorSec) editorSec.classList.add('hidden');
    if (previewSec) previewSec.classList.add('hidden');
    if (paySec) paySec.classList.add('hidden');
    if (stepsEl) stepsEl.style.display = 'none';
    if (closedSec) closedSec.classList.remove('hidden');
  } else {
    if (closedSec) closedSec.classList.add('hidden');
    if (stepsEl) stepsEl.style.display = 'flex';
    if (state.currentStep === 1 && uploadSec) {
      uploadSec.classList.remove('hidden');
    }
  }
}

function setupCustomerWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'SETTINGS_UPDATED' && msg.settings) {
          const isOpen = msg.settings.shopOpen !== false;
          updateCustomerShopOpenStatus(isOpen);
        }
      } catch (err) {}
    };
    ws.onclose = () => {
      setTimeout(setupCustomerWebSocket, 3000);
    };
  } catch (e) {}
}

function generateDemoResumeAndPrint() {
  const rName = document.getElementById('resName');
  const rPhone = document.getElementById('resPhone');
  const rEmail = document.getElementById('resEmail');
  const rRole = document.getElementById('resRole');
  const rEdu = document.getElementById('resEdu');
  const rExp = document.getElementById('resExp');

  if (rName) rName.value = 'Rajkishor Kumar Mahato';
  if (rPhone) rPhone.value = '+91 98765 43210';
  if (rEmail) rEmail.value = 'rajkishor.mahato@gmail.com';
  if (rRole) rRole.value = 'Computer Operator & Graphic Designer';
  if (rEdu) rEdu.value = 'B.Com (2022) - First Class | Computer Applications Diploma';
  if (rExp) rExp.value = '• 3+ years experience in document typing, Tamil & English typing\n• MS Office, Excel, Photoshop, Tally Prime\n• Fast and accurate clerical documentation';

  generateResumeAndPrint();
}


// ============================================================
// 📸 LIVE CAMERA SCANNER WITH DOCUMENT GUIDE (Screenshot 7)
// ============================================================
let liveCameraStream = null;
let liveCameraFacingMode = 'environment';

async function triggerCameraCapture() {
  closeAutoCropModal();
  
  // Try Live getUserMedia Camera first
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: liveCameraFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      liveCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = document.getElementById('liveCameraVideo');
      const modal = document.getElementById('modalLiveCamera');
      if (video && modal) {
        video.srcObject = liveCameraStream;
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        await video.play().catch(() => {});
        return;
      }
    } catch (camErr) {
      console.warn('Live camera stream not supported or denied, falling back to native camera:', camErr);
    }
  }

  // Graceful fallback to native device camera
  const input = document.getElementById('cropCameraInput') || document.getElementById('cameraCaptureInput');
  if (input) {
    input.value = '';
    input.click();
  }
}

function closeLiveCamera() {
  if (liveCameraStream) {
    liveCameraStream.getTracks().forEach(t => t.stop());
    liveCameraStream = null;
  }
  const modal = document.getElementById('modalLiveCamera');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
  }
}

async function flipLiveCamera() {
  liveCameraFacingMode = liveCameraFacingMode === 'environment' ? 'user' : 'environment';
  closeLiveCamera();
  await triggerCameraCapture();
}

function captureLiveCameraFrame() {
  const video = document.getElementById('liveCameraVideo');
  if (!video || !video.videoWidth) {
    closeLiveCamera();
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  closeLiveCamera();

  const img = new Image();
  img.onload = () => {
    cropSourceImage = img;
    initPerspectiveCropOverlay();
  };
  img.src = canvas.toDataURL('image/jpeg', 0.95);
}

// ============================================================
// 📐 TRUE 4-POINT PERSPECTIVE WARP (Screenshots 2 & 4)
// ============================================================
function drawPerspectiveTriangle(ctx, im, d0, d1, d2, s0, s1, s2) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  const denom = (s0.x * (s1.y - s2.y) - s1.x * (s0.y - s2.y) + s2.x * (s0.y - s1.y));
  if (Math.abs(denom) > 1e-5) {
    const m11 = - (s0.y * (d1.x - d2.x) - s1.y * (d0.x - d2.x) + s2.y * (d0.x - d1.x)) / denom;
    const m12 = (s0.y * (d1.y - d2.y) - s1.y * (d0.y - d2.y) + s2.y * (d0.y - d1.y)) / denom;
    const m21 = (s0.x * (d1.x - d2.x) - s1.x * (d0.x - d2.x) + s2.x * (d0.x - d1.x)) / denom;
    const m22 = - (s0.x * (d1.y - d2.y) - s1.x * (d0.y - d2.y) + s2.x * (d0.y - d1.y)) / denom;
    const dx = (s0.x * (s1.y * d2.x - s2.y * d1.x) - s0.y * (s1.x * d2.x - s2.x * d1.x) + (s1.x * s2.y - s2.x * s1.y) * d0.x) / denom;
    const dy = (s0.x * (s1.y * d2.y - s2.y * d1.y) - s0.y * (s1.x * d2.y - s2.x * d1.y) + (s1.x * s2.y - s2.x * s1.y) * d0.y) / denom;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(im, 0, 0);
  }
  ctx.restore();
}

function perspectiveWarpQuad(srcImg, corners, targetW, targetH) {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  // Fill with crisp white base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);

  const sw = srcImg.naturalWidth || srcImg.width;
  const sh = srcImg.naturalHeight || srcImg.height;

  // Real pixel coordinates of the 4 corners: 0=TL, 1=TR, 2=BR, 3=BL
  const p0 = { x: corners[0].x * sw, y: corners[0].y * sh };
  const p1 = { x: corners[1].x * sw, y: corners[1].y * sh };
  const p2 = { x: corners[2].x * sw, y: corners[2].y * sh };
  const p3 = { x: corners[3].x * sw, y: corners[3].y * sh };

  // Subdivide destination into a 16x16 grid for super smooth anti-aliased warp
  const steps = 16;
  for (let y = 0; y < steps; y++) {
    for (let x = 0; x < steps; x++) {
      const u0 = x / steps, u1 = (x + 1) / steps;
      const v0 = y / steps, v1 = (y + 1) / steps;

      const d0 = { x: u0 * targetW, y: v0 * targetH };
      const d1 = { x: u1 * targetW, y: v0 * targetH };
      const d2 = { x: u1 * targetW, y: v1 * targetH };
      const d3 = { x: u0 * targetW, y: v1 * targetH };

      // Bilinear interpolation
      const interp = (u, v) => ({
        x: (1 - u) * (1 - v) * p0.x + u * (1 - v) * p1.x + u * v * p2.x + (1 - u) * v * p3.x,
        y: (1 - u) * (1 - v) * p0.y + u * (1 - v) * p1.y + u * v * p2.y + (1 - u) * v * p3.y
      });

      const s0 = interp(u0, v0);
      const s1 = interp(u1, v0);
      const s2 = interp(u1, v1);
      const s3 = interp(u0, v1);

      drawPerspectiveTriangle(ctx, srcImg, d0, d1, d2, s0, s1, s2);
      drawPerspectiveTriangle(ctx, srcImg, d0, d2, d3, s0, s2, s3);
    }
  }

  return canvas;
}
