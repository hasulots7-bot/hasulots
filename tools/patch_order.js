const fs = require('fs');

let html = fs.readFileSync('public/order.html', 'utf8');

// 1. In secEditor, make paperSizeSel and orientBtn visible and style like screenshot 7
html = html.replace(
  'style="appearance:auto;font-family:\'Inter\',sans-serif;display:none;"',
  'style="appearance:auto;font-family:\'Plus Jakarta Sans\',sans-serif;font-weight:700;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:12px;background:#fff;color:#1e293b;"'
);

html = html.replace(
  'id="orientBtn" onclick="toggleOrientation()" style="display:none;"',
  'id="orientBtn" onclick="toggleOrientation()"'
);

// 2. In secEditor bottom buttons, replace backToUpload with backToChoice and text with 'OK, Continue'
html = html.replace(
  '<button class="btn btn-grey" onclick="backToUpload()">← Back</button>\n      <button class="btn btn-green" onclick="goToPreview()">✅ Done, Proceed →</button>',
  '<button class="btn btn-grey" onclick="backToChoice()">← Back</button>\n      <button class="btn btn-green" onclick="confirmEditorAndProceed()">✅ OK, Continue</button>'
);

// Also handle CRLF if present
html = html.replace(
  '<button class="btn btn-grey" onclick="backToUpload()">← Back</button>\r\n      <button class="btn btn-green" onclick="goToPreview()">✅ Done, Proceed →</button>',
  '<button class="btn btn-grey" onclick="backToChoice()">← Back</button>\r\n      <button class="btn btn-green" onclick="confirmEditorAndProceed()">✅ OK, Continue</button>'
);

// 3. In modalResume, add Demo Print Check button
const tplContinueBtn = '<button type="button" class="btn-grad-continue" onclick="proceedToResumeDetails()">\n        ✅ Continue →\n      </button>';
const tplContinueBtnCRLF = '<button type="button" class="btn-grad-continue" onclick="proceedToResumeDetails()">\r\n        ✅ Continue →\r\n      </button>';
const tplWithDemo = `<button type="button" class="btn-grad-continue" onclick="proceedToResumeDetails()">
        ✅ Continue →
      </button>
      <button type="button" class="btn-demo-check" onclick="generateDemoResumeAndPrint()" style="width:100%;margin-top:10px;background:#fff;color:#7c3aed;border:1.5px dashed #7c3aed;border-radius:14px;padding:12px;font-weight:800;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">
        <span>🖨️</span> Demo Print Check
      </button>`;

if (html.includes(tplContinueBtn)) {
  html = html.replace(tplContinueBtn, tplWithDemo);
} else if (html.includes(tplContinueBtnCRLF)) {
  html = html.replace(tplContinueBtnCRLF, tplWithDemo);
}

// 4. In modalPassport, add 40 photos pill
const a4Pills = '<span class="count-pill" onclick="event.stopPropagation(); setPassportCount(36, this)">36</span>\n        </div>';
const a4PillsCRLF = '<span class="count-pill" onclick="event.stopPropagation(); setPassportCount(36, this)">36</span>\r\n        </div>';
const a4PillsWith40 = `<span class="count-pill" onclick="event.stopPropagation(); setPassportCount(36, this)">36</span>
          <span class="count-pill" onclick="event.stopPropagation(); setPassportCount(40, this)">40</span>
        </div>`;

if (html.includes(a4Pills)) {
  html = html.replace(a4Pills, a4PillsWith40);
} else if (html.includes(a4PillsCRLF)) {
  html = html.replace(a4PillsCRLF, a4PillsWith40);
}

fs.writeFileSync('public/order.html', html, 'utf8');
console.log('order.html patched successfully');
