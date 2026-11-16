const fs = require('fs');

// 1. Update public/admin.html & public/index.html
function fixHtml(file) {
  let html = fs.readFileSync(file, 'utf8');

  // Ensure modal has style="display:none;"
  html = html.replace(
    'id="modal-shop-config" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"',
    'id="modal-shop-config" style="display:none;" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"'
  );

  // Bump agent.js cache buster to v30
  html = html.replace(/\/agent\.js\?v=\d+/g, '/agent.js?v=30');

  // Add inline fallback functions in <head> for instant reliability
  const inlineScript = `  <script>
    function openShopConfigModal() {
      const m = document.getElementById('modal-shop-config');
      if (m) {
        m.style.display = 'flex';
        m.classList.remove('hidden');
      }
      if (window.populateShopConfigModal) window.populateShopConfigModal();
    }
    function closeShopConfigModal() {
      const m = document.getElementById('modal-shop-config');
      if (m) {
        m.style.display = 'none';
        m.classList.add('hidden');
      }
    }
  </script>
</head>`;

  if (!html.includes('function openShopConfigModal() {')) {
    html = html.replace('</head>', inlineScript);
  }

  fs.writeFileSync(file, html, 'utf8');
  console.log('Fixed ' + file);
}

fixHtml('public/admin.html');
fixHtml('public/index.html');

// 2. Update public/agent.js
let agentJs = fs.readFileSync('public/agent.js', 'utf8');

// Ensure functions are attached to window
const windowExpose = `
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
`;

if (!agentJs.includes('window.openShopConfigModal = openShopConfigModal')) {
  agentJs += windowExpose;
}

// In openShopConfigModal, ensure modal.style.display = 'flex'
agentJs = agentJs.replace(
  'modal.classList.remove(\'hidden\');',
  'modal.style.display = \'flex\'; modal.classList.remove(\'hidden\');'
);
agentJs = agentJs.replace(
  'modal.classList.add(\'hidden\');',
  'modal.style.display = \'none\'; modal.classList.add(\'hidden\');'
);

fs.writeFileSync('public/agent.js', agentJs, 'utf8');
console.log('Fixed public/agent.js');

// 3. Update server.js to not cache .js files
let serverJs = fs.readFileSync('server.js', 'utf8');
serverJs = serverJs.replace(
  "filePath.endsWith('sw.js') || filePath.endsWith('.html')",
  "filePath.endsWith('sw.js') || filePath.endsWith('.html') || filePath.endsWith('.js')"
);
fs.writeFileSync('server.js', serverJs, 'utf8');
console.log('Fixed server.js cache headers');
