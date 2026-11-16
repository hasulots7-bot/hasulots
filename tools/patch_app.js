const fs = require('fs');

let js = fs.readFileSync('public/app.js', 'utf8');

// 1. Remove duplicate chooseAllGood at line 1292 and replace with clean choiceEdit / chooseAllGood / confirmEditorAndProceed
const oldChoiceHandlers = `// Choice Handlers (Screenshot 1)
async function chooseAllGood() {
  const canvas = document.getElementById('choiceCanvas');
  if (!canvas) return;

  toast('Preparing your document for printing...');
  canvas.toBlob(async (blob) => {
    const file = new File([blob], 'idcard-autocrop.jpg', { type: 'image/jpeg' });
    await handleFiles([file]);
    goToPreview();
  }, 'image/jpeg', 0.95);
}

function chooseEdit() {
  hide('secChoice');
  show('secEditor');
  initEditorCanvasFromChoice();
}

function initEditorCanvasFromChoice() {
  const a4Canvas = document.getElementById('a4Canvas');
  const choiceCanvas = document.getElementById('choiceCanvas');
  if (!a4Canvas || !choiceCanvas) return;
  a4Canvas.innerHTML = '';
  const img = document.createElement('img');
  img.src = choiceCanvas.toDataURL('image/jpeg', 0.9);
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  img.style.borderRadius = '8px';
  img.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)';
  a4Canvas.appendChild(img);
}`;

const newChoiceHandlers = `// Choice Handlers (Screenshot 1 & 8)
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
        cCtx.filter = \`brightness(\${100 + state.brightness}%) contrast(\${100 + state.contrast}%)\`;
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
}`;

js = js.replace(oldChoiceHandlers, newChoiceHandlers);

// 2. In assembleA4Document, pre-upload the assembled image to /api/upload
const oldAssembleEnd = `  // Switch to Screenshot 1: secChoice ("All Good — Continue" / "Want to Edit")
  hide('secUpload');
  show('secChoice');
  hide('secEditor');
  hide('secPreviewStep');
  hide('secPayment');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}`;

const newAssembleEnd = `  // Update choice screen details
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
}`;

js = js.replace(oldAssembleEnd, newAssembleEnd);

// 3. Add complete editor tools: zoomSliderInput, onRotateSlider, changePaperSize, toggleOrientation,
//    triggerAddDocument, handleAddDocument, changeEditorPage, toolToggleBorder, toggleBorderOn, onBorderSlider
const oldEditorTools = `function toolAutoA4() {
  state.rotation = 0;
  state.brightness = 0;
  state.contrast = 0;
  applyCanvasFilters();
  toast('Auto-fit applied');
}

function toolPerspectiveCrop() {
  toast('Crop corners ready');
}`;

const newEditorTools = `function toolAutoA4() {
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
}`;

js = js.replace(oldEditorTools, newEditorTools);

// 4. Update applyCanvasFilters to include state.zoomScale
const oldApplyFilters = `function applyCanvasFilters(canvas) {
  if (!canvas) canvas = document.getElementById('editorActiveCanvas');
  if (!canvas) return;

  canvas.style.transform = \`rotate(\${state.rotation}deg)\`;
  canvas.style.filter = \`brightness(\${100 + state.brightness}%) contrast(\${100 + state.contrast}%)\`;
}`;

const newApplyFilters = `function applyCanvasFilters(canvas) {
  if (!canvas) canvas = document.getElementById('editorActiveCanvas');
  if (!canvas) return;

  const scale = state.zoomScale || 1;
  canvas.style.transform = \`rotate(\${state.rotation}deg) scale(\${scale})\`;
  canvas.style.filter = \`brightness(\${100 + state.brightness}%) contrast(\${100 + state.contrast}%)\`;
}`;

js = js.replace(oldApplyFilters, newApplyFilters);

// 5. Add generateDemoResumeAndPrint()
const demoResumeFunc = `
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
  if (rExp) rExp.value = '• 3+ years experience in document typing, Tamil & English typing\\n• MS Office, Excel, Photoshop, Tally Prime\\n• Fast and accurate clerical documentation';

  generateResumeAndPrint();
}
`;

if (!js.includes('function generateDemoResumeAndPrint')) {
  js += demoResumeFunc;
}

// 6. Update handlePassportImageFile for proper A4 vs 4x6 grid
const oldPassportGrid = `      const count = activePassportCount || 6;
      const cols = 2;
      const rows = Math.ceil(count / cols);
      const cellW = (canvas.width - 120) / cols;
      const cellH = (canvas.height - 120) / rows;`;

const newPassportGrid = `      const count = activePassportCount || (activePassportSheet === 'a4' ? 24 : 6);
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
      const cellH = (canvas.height - 120) / rows;`;

js = js.replace(oldPassportGrid, newPassportGrid);

fs.writeFileSync('public/app.js', js, 'utf8');
console.log('app.js patched successfully');
