// QuickPrint Shop - Windows desktop app (Electron)
// Loads the shop admin from the QuickPrint server and prints paid orders silently.
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, session, powerSaveBlocker, net, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const pkg = require('./package.json');
function serverUrl() {
  const arg = process.argv.find(a => a.startsWith('--server='));
  const raw = (arg && arg.slice(9)) || process.env.QP_SERVER_URL || pkg.qpServerUrl;
  return String(raw).replace(/\/+$/, '');
}
const SERVER = serverUrl();
const ORIGIN = new URL(SERVER).origin;
const ICON = path.join(__dirname, 'build', 'icon.ico');

let win = null, tray = null, quitting = false;

// ---- single instance ----
if (!app.requestSingleInstanceLock()) { app.quit(); }
else app.on('second-instance', () => showWindow());

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function statusPage(offline) {
  win.loadFile(path.join(__dirname, 'status.html'), { search: offline ? 'offline=1' : '' });
}
function openAdmin() {
  statusPage(false);
  // Small delay so the splash paints; loadURL waits for a sleeping server.
  setTimeout(() => { if (win) win.loadURL(SERVER + '/admin').catch(() => {}); }, 300);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640,
    title: 'QuickPrint Shop', icon: ICON, autoHideMenuBar: true, backgroundColor: '#4f46e5',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.setMenuBarVisibility(false);

  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3 && url.startsWith(ORIGIN)) statusPage(true); // -3 = aborted
  });
  // Stay inside QuickPrint; everything else opens in the normal browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://')) return;
    if (new URL(url).origin !== ORIGIN) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).origin === ORIGIN) return { action: 'allow' }; } catch (e) {}
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // Keep running in the tray so orders keep printing when the window is closed.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
  openAdmin();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON));
  tray.setToolTip('QuickPrint Shop - running');
  const build = () => Menu.buildFromTemplate([
    { label: 'Open QuickPrint', click: showWindow },
    { label: 'Reload', click: () => openAdmin() },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { type: 'separator' },
    { label: 'Quit (stops printing)', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(build());
  tray.on('click', showWindow);
}

// ---------------- IPC: only the QuickPrint site may call these ----------------
function fromTrustedPage(e) {
  try { return new URL(e.senderFrame.url).origin === ORIGIN; } catch (err) { return false; }
}
ipcMain.on('qp:version', (e) => { e.returnValue = app.getVersion(); });
ipcMain.on('qp:retry', () => openAdmin());

ipcMain.handle('qp:printers', async (e) => {
  if (!fromTrustedPage(e)) throw new Error('Not allowed');
  const list = await e.sender.getPrintersAsync();
  return list.map(p => p.name);
});

const DIRECT_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];   // SumatraPDF can print these
const ALLOWED_EXT = DIRECT_EXT.concat(['.doc', '.docx', '.txt']);
const MAX_BYTES = 60 * 1024 * 1024;

function sumatraPath() {
  const p = app.isPackaged ? path.join(process.resourcesPath, 'SumatraPDF.exe') : path.join(__dirname, 'resources', 'SumatraPDF.exe');
  return fs.existsSync(p) ? p : null;
}
function run(file, args, timeout, env) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, env: env ? { ...process.env, ...env } : process.env }, (err, stdout, stderr) => err ? reject(new Error((stderr || err.message).toString().slice(0, 300))) : resolve());
  });
}
async function download(relUrl) {
  const res = await net.fetch(new URL(relUrl, SERVER).href);
  if (!res.ok) throw new Error('Could not download file (' + res.status + ')');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('File too large');
  return buf;
}
function sumatraSettings(job, ext) {
  const parts = [];
  parts.push(job.colorMode === 'color' ? 'color' : 'monochrome');
  parts.push(job.duplex === 'double' ? 'duplexlong' : 'simplex');
  const copies = Math.min(99, Math.max(1, parseInt(job.copies, 10) || 1));
  if (copies > 1) parts.push(copies + 'x');
  const paper = { A4: 'A4', A3: 'A3', Legal: 'legal' }[job.paperSize];
  if (paper) parts.push('paper=' + paper);
  parts.push(ext === '.pdf' ? 'shrink' : 'fit');
  const range = String(job.pageRange || 'all').trim();
  if (range && range !== 'all' && /^[0-9][0-9,\- ]*$/.test(range)) parts.unshift(range.replace(/\s+/g, ''));
  return parts.join(',');
}

ipcMain.handle('qp:print', async (e, job) => {
  if (!fromTrustedPage(e)) throw new Error('Not allowed');
  job = job || {};
  const rel = String(job.url || '');
  if (!/^\/uploads\/[\w.\-]+$/.test(rel)) throw new Error('Invalid file');
  const ext = path.extname(rel).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new Error('File type not supported');
  const printer = String(job.printer || '').slice(0, 200);

  const dir = path.join(os.tmpdir(), 'quickprint');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, crypto.randomBytes(8).toString('hex') + ext);
  let keepMs = 60000;
  fs.writeFileSync(file, await download(rel));
  try {
    const sumatra = sumatraPath();
    if (DIRECT_EXT.includes(ext) && sumatra) {
      const args = printer ? ['-print-to', printer] : ['-print-to-default'];
      args.push('-silent', '-print-settings', sumatraSettings(job, ext), '-exit-when-done', file);
      await run(sumatra, args, 90000);
    } else {
      // Word / text (or no SumatraPDF): hand over to the Windows default app. No colour/duplex control here.
      // File and printer name go through environment variables, never into the command text.
      const cmd = printer
        ? "Start-Process -FilePath $env:QP_FILE -Verb PrintTo -ArgumentList ('\"{0}\"' -f $env:QP_PRINTER) -WindowStyle Hidden"
        : 'Start-Process -FilePath $env:QP_FILE -Verb Print -WindowStyle Hidden';
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], 90000, { QP_FILE: file, QP_PRINTER: printer });
      keepMs = 5 * 60 * 1000; // Word/Notepad may open the file slowly
    }
    return { ok: true };
  } finally {
    setTimeout(() => fs.unlink(file, () => {}), keepMs); // give the spooler / app time to read it
  }
});

// ---------------- lifecycle ----------------
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
  powerSaveBlocker.start('prevent-app-suspension'); // keep the live order connection alive
  createTray();
  createWindow();
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay in tray */ });
