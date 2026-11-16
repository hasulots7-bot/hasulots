// ============================================================
// QuickPrint Local Print Agent
// Runs on the shop PC. Connects to the cloud server, polls for
// paid/print-ready orders, downloads the file and prints it
// locally, then reports back.
// ============================================================
// Usage:
//   node print-agent.js --cloud https://www.qrprint.hasulotstechnologies.com \
//                       --shop  QP_YOURSHOP_123 \
//                       --token AGENT_TOKEN_FROM_PORTAL
// Or set env vars: CLOUD_URL, SHOP_ID, AGENT_TOKEN
// ============================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, exec } = require('child_process');

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
}

const CLOUD_URL = (arg('cloud') || process.env.CLOUD_URL || '').replace(/\/$/, '');
const SHOP_ID = arg('shop') || process.env.SHOP_ID || '';
const AGENT_TOKEN = arg('token') || process.env.AGENT_TOKEN || '';
const PRINTER_NAME = arg('printer') || process.env.PRINTER_NAME || '';
const POLL_MS = parseInt(arg('poll') || process.env.POLL_MS || '4000', 10);
const DOWNLOAD_DIR = arg('dir') || process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'print-jobs');

if (!CLOUD_URL || !SHOP_ID || !AGENT_TOKEN) {
  console.error('Missing config. Need --cloud, --shop, --token (or env vars).');
  process.exit(1);
}
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(CLOUD_URL + urlPath);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: { 'x-agent-token': AGENT_TOKEN, 'Content-Type': 'application/json' }
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} }); }
        catch (e) { resolve({ status: res.statusCode, data: { raw: data } }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const u = new URL(url.startsWith('http') ? url : CLOUD_URL + url);
    const mod = u.protocol === 'https:' ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

// --- Printing -------------------------------------------------
// Windows printing is unreliable through -Verb Print. Prefer SumatraPDF
// (silent, no window) when it is installed, otherwise fall back to the
// shell print verb for the default printer.
function findSumatra() {
  const candidates = [
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe')
  ];
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) {}
  }
  return null;
}

function printFile(filePath) {
  return new Promise((resolve, reject) => {
    if (process.env.PRINT_CMD) {
      const cmd = process.env.PRINT_CMD.replace(/\{file\}/g, filePath);
      return exec(cmd, (err) => (err ? reject(err) : resolve()));
    }

    if (process.platform === 'win32') {
      const sumatra = findSumatra();
      const isPdf = filePath.toLowerCase().endsWith('.pdf');

      if (sumatra && isPdf) {
        const target = PRINTER_NAME ? `-print-to "${PRINTER_NAME}"` : '-print-to-default';
        return exec(`"${sumatra}" -silent ${target} "${filePath}"`, (err) => {
          if (err) reject(err); else resolve();
        });
      }

      const psTarget = PRINTER_NAME ? `-Verb PrintTo -ArgumentList "\\"${PRINTER_NAME}\\""` : '-Verb Print';
      const cmd = `Start-Process -FilePath "${filePath}" ${psTarget} -PassThru | Out-Null`;
      return exec(`powershell -NoProfile -Command "${cmd}"`, (err) => {
        if (err) reject(err); else resolve();
      });
    }

    if (process.platform === 'darwin') {
      return exec(PRINTER_NAME ? `lp -d "${PRINTER_NAME}" "${filePath}"` : `lp "${filePath}"`, (err) => (err ? reject(err) : resolve()));
    }

    exec(PRINTER_NAME ? `lp -d "${PRINTER_NAME}" "${filePath}"` : `lp "${filePath}"`, (err) => (err ? reject(err) : resolve()));
  });
}

async function processJob(job) {
  console.log(`[agent] New job ${job.token} - ${job.originalName}`);
  const dest = path.join(DOWNLOAD_DIR, job.token + path.extname(job.originalName || job.fileUrl || '.pdf'));
  const fileUrl = job.fileUrl || job.fileUrl;

  // Prevent an endless retry loop (and duplicate prints) for a broken file.
  const attempts = (attemptsByJob[job.id] || 0) + 1;
  attemptsByJob[job.id] = attempts;

  try {
    if (!fs.existsSync(dest)) {
      await downloadFile(fileUrl, dest);
      console.log(`[agent] Downloaded ${job.token} -> ${dest}`);
    }
    await printFile(dest);
    console.log(`[agent] Printed ${job.token}`);
    await request('POST', `/api/agent/jobs/${job.id}/done`, {});
    console.log(`[agent] Reported printed: ${job.token}`);
    delete attemptsByJob[job.id];
  } catch (e) {
    console.error(`[agent] Failed ${job.token} (attempt ${attempts}):`, e.message);
    if (attempts >= 3) {
      await request('POST', `/api/agent/jobs/${job.id}/fail`, { error: String(e.message || 'Print failed') }).catch(() => {});
      delete attemptsByJob[job.id];
      console.error(`[agent] Gave up on ${job.token}; owner must re-queue it.`);
    }
  }
}

let running = false;
const attemptsByJob = {};
async function poll() {
  if (running) return;
  running = true;
  try {
    const r = await request('GET', `/api/agent/jobs?shopId=${encodeURIComponent(SHOP_ID)}`);
    if (r.status === 200 && Array.isArray(r.data.jobs)) {
      for (const job of r.data.jobs) {
        await processJob(job);
      }
    } else if (r.status === 401) {
      console.error('[agent] Unauthorized - check AGENT_TOKEN');
    }
  } catch (e) {
    console.error('[agent] Poll error:', e.message);
  } finally {
    running = false;
  }
}

console.log(`[agent] QuickPrint Print Agent starting`);
console.log(`[agent] Cloud: ${CLOUD_URL}`);
console.log(`[agent] Shop:  ${SHOP_ID}`);
console.log(`[agent] Poll:  every ${POLL_MS}ms`);
console.log(`[agent] Dir:   ${DOWNLOAD_DIR}`);
setInterval(poll, POLL_MS);
poll();