const fs = require('fs');
const path = require('path');

// 1. UPDATE public/order.html
const orderHtmlPath = path.join(__dirname, '..', 'public', 'order.html');
let orderHtml = fs.readFileSync(orderHtmlPath, 'utf8');

// Update secChoice buttons if not already updated
const oldChoiceRegex = /<button onclick="chooseAllGood\(\)"[\s\S]*?<\/div>\s*<\/div>\s*<div id="secEditor"/;
const newChoiceHtml = `<button onclick="chooseAllGood()" style="width:100%;background:#16a34a;color:#fff;border:none;border-radius:15px;padding:17px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:16px;cursor:pointer;box-shadow:0 8px 22px rgba(22,163,74,.26);margin-bottom:8px;">
        ✅ All Good — Continue / அச்சிடச் செல்க
      </button>
      <p style="font-size:12px;color:var(--muted);text-align:center;margin-bottom:14px;line-height:1.5;">
        File prints exactly as it is — cleanest and fastest
      </p>

      <button onclick="chooseEdit()" style="width:100%;background:#fff;color:var(--ink);border:1.5px solid var(--line);border-radius:15px;padding:15px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;font-size:15px;cursor:pointer;">
        ✏️ Want to Edit / திருத்த விரும்புகிறேன்
      </button>
      <p style="font-size:12px;color:var(--muted);text-align:center;margin-top:6px;line-height:1.5;">
        To rotate, crop, adjust brightness or add more documents
      </p>
    </div>
  </div>

  <div id="secEditor"`;

if (oldChoiceRegex.test(orderHtml)) {
  orderHtml = orderHtml.replace(oldChoiceRegex, newChoiceHtml);
  console.log('Updated secChoice buttons in order.html');
}

// Add Live Camera Modal (Screenshot 7) before </body> if not present
if (!orderHtml.includes('id="modalLiveCamera"')) {
  const liveCameraHtml = `
<!-- ============================================================ -->
<!-- LIVE CAMERA SCANNER OVERLAY (Screenshot 7)                  -->
<!-- ============================================================ -->
<div id="modalLiveCamera" class="hidden" style="position:fixed; inset:0; z-index:100020; background:#050508; display:none; flex-direction:column; align-items:center; justify-content:space-between; touch-action:none;">
  <!-- Top bar -->
  <div style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:16px 20px; z-index:10; background:linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);">
    <button type="button" onclick="closeLiveCamera()" style="background:rgba(255,255,255,0.15); color:#fff; border:none; border-radius:50%; width:40px; height:40px; font-size:18px; font-weight:800; cursor:pointer;">✕</button>
    <div style="color:#fff; font-weight:800; font-size:14px; letter-spacing:0.5px;">Auto Crop Camera Scanner</div>
    <button type="button" onclick="flipLiveCamera()" style="background:rgba(255,255,255,0.15); color:#fff; border:none; border-radius:50%; width:40px; height:40px; font-size:16px; cursor:pointer;" title="Flip Camera">🔄</button>
  </div>

  <!-- Video Viewport with Center Guide Box (Screenshot 7) -->
  <div style="position:relative; width:100%; flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;">
    <video id="liveCameraVideo" autoplay playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
    
    <!-- Green Alignment Guide (Screenshot 7) -->
    <div style="position:absolute; width:84%; max-width:380px; height:62%; max-height:480px; border:2.5px solid #22c55e; border-radius:24px; box-shadow:0 0 0 9999px rgba(0,0,0,0.52); pointer-events:none; display:flex; flex-direction:column; justify-content:flex-end; align-items:center; padding-bottom:14px;">
      <span style="background:rgba(34,197,94,0.25); color:#4ade80; border:1.5px solid #22c55e; border-radius:99px; padding:5px 16px; font-size:12px; font-weight:800; display:flex; align-items:center; gap:6px; backdrop-blur-xs;">
        ✓ Document mil gaya / ஆவணம் கண்டறியப்பட்டது
      </span>
    </div>
  </div>

  <!-- Bottom Shutter Bar -->
  <div style="width:100%; padding:20px 20px 36px; display:flex; align-items:center; justify-content:space-around; z-index:10; background:linear-gradient(to top, rgba(0,0,0,0.8), transparent);">
    <button type="button" onclick="triggerFilePickerForCrop()" style="background:rgba(255,255,255,0.12); color:#e2e8f0; border:none; border-radius:14px; padding:10px 14px; font-size:12px; font-weight:700; cursor:pointer;">📁 Gallery</button>
    <button type="button" onclick="captureLiveCameraFrame()" style="width:74px; height:74px; border-radius:50%; background:#fff; border:5px solid rgba(255,255,255,0.35); box-shadow:0 4px 20px rgba(0,0,0,0.6); cursor:pointer; active:scale-95; transition:transform 0.1s;" aria-label="Take Photo"></button>
    <div style="width:68px;"></div>
  </div>
</div>
`;
  orderHtml = orderHtml.replace('</body>', `${liveCameraHtml}\n</body>`);
  console.log('Added modalLiveCamera to order.html');
}

fs.writeFileSync(orderHtmlPath, orderHtml, 'utf8');

// 2. UPDATE public/app.js
const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// We need to inject or replace:
// 1. Live camera logic: triggerCameraCapture, captureLiveCameraFrame, closeLiveCamera, flipLiveCamera
// 2. True perspective warp: perspectiveWarp & drawTriangle
// 3. Updated cropApply using perspectiveWarp

const liveCameraJs = `
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
`;

// Replace cropApply in app.js with the perspective-aware version
const oldCropApplyRegex = /function cropApply\(\)\s*\{[\s\S]*?if \(cropCurrentSide === 'front'\)/;
const newCropApplyHtml = `function cropApply() {
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

  if (cropCurrentSide === 'front')`;

if (oldCropApplyRegex.test(appJs)) {
  appJs = appJs.replace(oldCropApplyRegex, newCropApplyHtml);
  console.log('Replaced cropApply with perspectiveWarp in app.js');
}

// Append liveCameraJs if not already present
if (!appJs.includes('modalLiveCamera')) {
  appJs += '\n' + liveCameraJs;
  console.log('Appended liveCameraJs and perspective transform functions to app.js');
}

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('Enhancements successfully applied to public/order.html and public/app.js');
