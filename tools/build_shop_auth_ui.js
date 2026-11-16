const fs = require('fs');

// 1. Prepare New Login & Register Overlay for public/admin.html and public/index.html
const newLoginOverlayHtml = `  <!-- ============================================================ -->
  <!-- 🔒 ADMIN & SHOP LOGIN / REGISTRATION OVERLAY                   -->
  <!-- ============================================================ -->
  <div id="admin-login-overlay" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4 transition-all duration-300">
    <div class="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 text-center relative overflow-hidden">
      
      <!-- Top Brand Icon -->
      <div class="w-13 h-13 mx-auto rounded-2xl bg-[#ec2a7a] text-white flex items-center justify-center text-2xl shadow-md shadow-pink-500/25 mb-2.5">
        🖨️
      </div>

      <!-- Navigation Tabs (Login vs Register) -->
      <div class="flex items-center justify-center gap-1.5 p-1 bg-slate-100 rounded-xl max-w-xs mx-auto mb-4 text-xs font-black">
        <button type="button" id="tab-btn-login" onclick="switchLoginTab('login')" class="flex-1 py-1.5 px-3 rounded-lg bg-white text-slate-800 shadow-2xs transition">
          🔐 Shop Login
        </button>
        <button type="button" id="tab-btn-register" onclick="switchLoginTab('register')" class="flex-1 py-1.5 px-3 rounded-lg text-slate-500 hover:text-slate-800 transition">
          ➕ Register Shop
        </button>
      </div>

      <!-- TAB 1: LOGIN FORM -->
      <div id="login-view-form">
        <h2 class="text-xl font-black text-slate-900 leading-tight">Admin &amp; Shop Login</h2>
        <p class="text-xs text-slate-500 mt-0.5">அட்மின் உள்நுழைவு</p>

        <div class="space-y-3.5 my-4 text-left">
          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Username / பயனர் பெயர்</label>
            <input type="text" id="admin-username-input" 
                   class="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-violet-600 focus:outline-none text-slate-800 font-bold text-sm transition"
                   placeholder="admin or shop username" 
                   value="admin"
                   autocomplete="username">
          </div>

          <div>
            <label class="block text-xs font-bold text-slate-600 mb-1">Password / கடவுச்சொல்</label>
            <div class="relative">
              <input type="password" id="admin-password-input" 
                     class="w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 focus:border-violet-600 focus:outline-none text-slate-800 font-bold text-sm transition"
                     placeholder="Enter Password" 
                     autocomplete="current-password"
                     onkeydown="if(event.key==='Enter')verifyLoginSubmit()">
              <button type="button" onclick="togglePasswordVisibility()" class="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-sm p-1" title="Show/Hide">
                👁️
              </button>
            </div>
          </div>
        </div>

        <div id="login-error-msg" class="text-xs font-bold text-rose-600 min-h-[18px] mb-2 text-center opacity-0 transition-opacity">
          Incorrect Password. Default is 1234.
        </div>

        <button type="button" id="btn-submit-pwd" onclick="verifyLoginSubmit()" class="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm shadow-md shadow-violet-500/25 transition active:scale-98">
          Unlock Dashboard / உள்நுழைக →
        </button>

        <div class="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Default: <b>admin / 1234</b></span>
          <button type="button" onclick="switchLoginTab('register')" class="text-violet-600 font-extrabold hover:underline">
            Register New Shop ➕
          </button>
        </div>
      </div>

      <!-- TAB 2: REGISTER NEW SHOP FORM -->
      <div id="register-view-form" class="hidden text-left">
        <h2 class="text-lg font-black text-slate-900 leading-tight text-center">Register New Shop</h2>
        <p class="text-xs text-slate-500 text-center mt-0.5">புதிய கடையை பதிவு செய்ய</p>

        <div class="space-y-2.5 my-3.5 text-xs">
          <div>
            <label class="block font-bold text-slate-600 mb-0.5">Shop Name / கடையின் பெயர் *</label>
            <input type="text" id="reg-shop-name" oninput="onRegisterNameInput(this.value)" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold" placeholder="e.g. Hasulots technologies">
          </div>

          <div>
            <div class="flex items-center justify-between mb-0.5">
              <label class="font-bold text-slate-600">Auto Generated Shop ID / கடை குறியீடு</label>
              <button type="button" onclick="generateRandomShopId()" class="text-violet-600 font-bold hover:underline">🔄 Regenerate</button>
            </div>
            <input type="text" id="reg-shop-id" class="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-violet-700" placeholder="QP_SHOP" readonly>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Login Username *</label>
              <input type="text" id="reg-username" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold" placeholder="e.g. hasulots">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Password *</label>
              <input type="text" id="reg-password" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold" placeholder="e.g. 1234">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Shop Phone / மொபைல்</label>
              <input type="tel" id="reg-phone" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold" placeholder="9876543210">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Shop UPI ID (GPay/PhonePe)</label>
              <input type="text" id="reg-upi-id" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" placeholder="shop@upi">
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">B&amp;W Rate (₹/page)</label>
              <input type="number" id="reg-bw-rate" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold" value="3">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-0.5">Color Rate (₹/page)</label>
              <input type="number" id="reg-color-rate" class="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold" value="10">
            </div>
          </div>
        </div>

        <div id="reg-error-msg" class="text-xs font-bold text-rose-600 min-h-[16px] mb-2 text-center opacity-0 transition-opacity"></div>

        <button type="button" onclick="submitShopRegistration()" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-500/25 transition active:scale-98">
          ✨ Register Shop &amp; Open Kiosk / கடையை பதிவு செய் →
        </button>

        <div class="mt-2.5 pt-2 border-t border-slate-100 text-center">
          <button type="button" onclick="switchLoginTab('login')" class="text-xs text-slate-500 hover:text-slate-800 font-bold">
            ‹ Back to Login / உள்நுழைய செல்க
          </button>
        </div>
      </div>

    </div>
  </div>`;

// 2. Prepare Comprehensive Shop Settings Modal
const newShopConfigModalHtml = `  <!-- ============================================================ -->
  <!-- 🏪 COMPLETE SHOP CONFIGURATION & REGISTRATION MODAL          -->
  <!-- ============================================================ -->
  <div id="modal-shop-config" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4" onclick="if(event.target===this)closeShopConfigModal()">
    <div class="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 text-slate-800 relative max-h-[90vh] overflow-y-auto">
      
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center text-lg shadow-xs">⚙️</div>
          <div>
            <h3 class="text-base font-black text-slate-900 leading-tight">Shop Settings &amp; Pricing</h3>
            <p class="text-xs text-slate-500">கடை விபரங்கள், கட்டணம் &amp; பாஸ்வேர்டு</p>
          </div>
        </div>
        <button type="button" onclick="closeShopConfigModal()" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm flex items-center justify-center transition">✕</button>
      </div>

      <div class="space-y-4 text-xs">
        
        <!-- SECTION 1: SHOP IDENTIFICATION -->
        <div class="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
          <h4 class="font-black text-slate-900 text-xs flex items-center gap-1.5">
            <span>🏪</span> Shop Information &amp; Identification
          </h4>

          <div>
            <label class="block font-bold text-slate-600 mb-1">Shop Name / கடையின் பெயர் *</label>
            <input type="text" id="modal-shop-name" class="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold bg-white text-sm" placeholder="e.g. Hasulots technologies">
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-bold text-slate-600">Shop ID / கடை குறியீடு</label>
              <button type="button" onclick="autoGenerateModalShopId()" class="text-violet-600 font-extrabold hover:underline text-[11px]">🔄 Auto Generate ID</button>
            </div>
            <input type="text" id="modal-shop-id" class="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono font-bold bg-white text-violet-700" placeholder="QP_HASULOTS">
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-600 mb-1">Shop Phone / தொலைபேசி</label>
              <input type="tel" id="modal-shop-phone" class="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold bg-white" placeholder="+91 98765 43210">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Address / முகவரி</label>
              <input type="text" id="modal-shop-address" class="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold bg-white" placeholder="Main Road, Opp. Bus Stand">
            </div>
          </div>
        </div>

        <!-- SECTION 2: ADMIN CREDENTIALS -->
        <div class="p-3.5 bg-violet-50/60 rounded-2xl border border-violet-200/80 space-y-3">
          <h4 class="font-black text-violet-900 text-xs flex items-center gap-1.5">
            <span>🔐</span> Admin Login Credentials / உள்நுழைவு விபரம்
          </h4>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-600 mb-1">Admin Username</label>
              <input type="text" id="modal-admin-username" class="w-full px-3 py-2 border border-violet-200 rounded-xl font-bold bg-white" placeholder="admin">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Admin Password</label>
              <input type="text" id="modal-admin-password" class="w-full px-3 py-2 border border-violet-200 rounded-xl font-bold bg-white" placeholder="1234">
            </div>
          </div>
        </div>

        <!-- SECTION 3: PRICING & PAYMENT -->
        <div class="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-3">
          <h4 class="font-black text-emerald-900 text-xs flex items-center gap-1.5">
            <span>💳</span> Payment Options &amp; Print Pricing
          </h4>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block font-bold text-slate-600 mb-1">Shop UPI ID (GPay / PhonePe) *</label>
              <input type="text" id="modal-upi-id" class="w-full px-3 py-2 border border-emerald-200 rounded-xl font-mono font-bold bg-white text-emerald-800" placeholder="hasulots@upi">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">UPI Payee Display Name</label>
              <input type="text" id="modal-upi-name" class="w-full px-3 py-2 border border-emerald-200 rounded-xl font-bold bg-white" placeholder="Hasulots technologies">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2.5">
            <div>
              <label class="block font-bold text-slate-600 mb-1">B&amp;W Rate (₹/page)</label>
              <input type="number" id="modal-bw-rate" class="w-full px-3 py-2 border border-emerald-200 rounded-xl font-bold bg-white" placeholder="3">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Color Rate (₹/page)</label>
              <input type="number" id="modal-color-rate" class="w-full px-3 py-2 border border-emerald-200 rounded-xl font-bold bg-white" placeholder="10">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Duplex Disc %</label>
              <input type="number" id="modal-duplex-discount" class="w-full px-3 py-2 border border-emerald-200 rounded-xl font-bold bg-white" placeholder="15">
            </div>
          </div>
        </div>

      </div>

      <!-- Action Footer -->
      <div class="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        <button type="button" onclick="openNewShopRegistrationFromModal()" class="px-3.5 py-2 rounded-xl text-violet-700 bg-violet-50 hover:bg-violet-100 font-extrabold text-xs transition">
          ➕ Register New Shop
        </button>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeShopConfigModal()" class="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs transition">
            Cancel
          </button>
          <button type="button" onclick="saveShopConfig()" class="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-xs shadow-md shadow-violet-600/25 transition active:scale-95">
            💾 Save Settings / சேமிக்க
          </button>
        </div>
      </div>

    </div>
  </div>`;

// Update both public/admin.html and public/index.html
function patchHtmlFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf8');

  // 1. Replace old admin login overlay
  const oldOverlayRegex = /<div id="admin-login-overlay"[\s\S]*?<\/header>/;
  const match = oldOverlayRegex.exec(html);
  if (match) {
    const fullMatch = match[0];
    const headerPart = fullMatch.slice(fullMatch.indexOf('<header class="app-header">'));
    const replacement = newLoginOverlayHtml + '\n\n  ' + headerPart;
    html = html.replace(fullMatch, replacement);
  }

  // 2. Add prominent "⚙️ Shop Settings" button in header
  if (!html.includes('id="btn-open-settings"')) {
    const lockBtn = '<button id="btn-lock-agent"';
    const settingsBtn = `<button id="btn-open-settings" onclick="openShopConfigModal()" class="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-violet-600/25 transition active:scale-95" title="Configure Shop Name, Rates & Password">
        <span>⚙️</span>
        <span>Shop Settings</span>
      </button>\n      <button id="btn-lock-agent"`;
    html = html.replace(lockBtn, settingsBtn);
  }

  // Also make header shop name and edit icon clickable to open settings
  html = html.replace(
    '<button id="btn-edit-shop-info" class="text-slate-400 hover:text-indigo-600 p-0.5" title="Edit Store Details & Rates">',
    '<button id="btn-edit-shop-info" onclick="openShopConfigModal()" class="text-slate-400 hover:text-indigo-600 p-0.5" title="Edit Store Details & Rates">'
  );
  html = html.replace(
    '<h1 id="header-shop-name" class="font-black text-base text-slate-900 leading-tight truncate">',
    '<h1 id="header-shop-name" onclick="openShopConfigModal()" class="font-black text-base text-slate-900 leading-tight truncate cursor-pointer hover:text-violet-700 transition" title="Click to edit shop settings">'
  );

  // 3. Replace old modal-shop-config with the new comprehensive modal
  const oldModalRegex = /<!-- Store Config Modal -->[\s\S]*?<\/div>\s*<\/div>/;
  if (oldModalRegex.test(html)) {
    html = html.replace(oldModalRegex, newShopConfigModalHtml);
  } else if (!html.includes('id="modal-shop-config"')) {
    html = html.replace('</body>', newShopConfigModalHtml + '\n</body>');
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log('Patched ' + filePath);
}

patchHtmlFile('public/admin.html');
patchHtmlFile('public/index.html');
