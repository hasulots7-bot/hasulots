const fs = require('fs');

// 1. Update public/agent.js
let agentJs = fs.readFileSync('public/agent.js', 'utf8');

const oldUpdateMetrics = `function updateMetrics() {
  const today = new Date().toDateString();
  const todayOrders = agentState.orders.filter(o => new Date(o.createdAt).toDateString() === today);

  const totalOrders = todayOrders.length;
  const totalPages = todayOrders.reduce((sum, o) => sum + (o.pageCount || 1) * (o.copies || 1), 0);
  
  const paid = todayOrders.filter(o => o.paymentStatus === 'paid');
  const online = paid.filter(o => o.paymentMethod !== 'cash');
  const cash = paid.filter(o => o.paymentMethod === 'cash');

  const totalRev = paid.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const onlineRev = online.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const cashRev = cash.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);

  document.getElementById('metric-orders-today').textContent = totalOrders;
  document.getElementById('metric-pages-today').textContent = \`\${totalPages} pages\`;
  document.getElementById('metric-total-earned').textContent = \`₹\${totalRev}\`;
  document.getElementById('metric-orders-printed').textContent = \`\${paid.length} orders printed\`;
  document.getElementById('metric-cash-earned').textContent = \`₹\${cashRev}\`;
  document.getElementById('metric-online-earned').textContent = \`₹\${onlineRev}\`;

  document.getElementById('badge-all-count').textContent = totalOrders;
  document.getElementById('badge-cash-count').textContent = cash.length;
  document.getElementById('badge-online-count').textContent = online.length;
}`;

const newUpdateMetrics = `function updateMetrics() {
  const today = new Date().toDateString();
  const todayOrders = agentState.orders.filter(o => {
    try {
      return new Date(o.createdAt).toDateString() === today;
    } catch (e) {
      return false;
    }
  });

  const totalOrders = todayOrders.length;
  const totalPages = todayOrders.reduce((sum, o) => sum + (o.pageCount || 1) * (o.copies || 1), 0);
  
  const paid = todayOrders.filter(o => o.paymentStatus === 'paid' || o.status === 'completed');
  const online = paid.filter(o => o.paymentMethod !== 'cash');
  const cash = paid.filter(o => o.paymentMethod === 'cash');

  const totalRev = paid.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const onlineRev = online.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);
  const cashRev = cash.reduce((sum, o) => sum + (o.pricing?.totalAmount || 0), 0);

  const elOrdersToday = document.getElementById('metric-orders-today');
  if (elOrdersToday) elOrdersToday.textContent = totalOrders;

  const elPagesToday = document.getElementById('metric-pages-today');
  if (elPagesToday) elPagesToday.textContent = \`\${totalPages} pages\`;

  const elTotalEarned = document.getElementById('metric-total-earned');
  if (elTotalEarned) elTotalEarned.textContent = \`₹\${totalRev}\`;

  const elPrintedToday = document.getElementById('metric-printed-today') || document.getElementById('metric-orders-printed');
  if (elPrintedToday) elPrintedToday.textContent = \`\${paid.length} orders printed\`;

  const elCashEarned = document.getElementById('metric-cash-earned');
  if (elCashEarned) elCashEarned.textContent = \`₹\${cashRev}\`;

  const elOnlineEarned = document.getElementById('metric-online-earned');
  if (elOnlineEarned) elOnlineEarned.textContent = \`₹\${onlineRev}\`;

  const countAll = document.getElementById('count-all') || document.getElementById('badge-all-count');
  if (countAll) countAll.textContent = totalOrders;

  const countCash = document.getElementById('count-cash') || document.getElementById('badge-cash-count');
  if (countCash) countCash.textContent = cash.length;

  const countOnline = document.getElementById('count-online') || document.getElementById('badge-online-count');
  if (countOnline) countOnline.textContent = online.length;
}`;

agentJs = agentJs.replace(oldUpdateMetrics, newUpdateMetrics);

// Fix empty state in renderOrders
const oldEmptyCheck = `  if (list.length === 0) {
    if (emptyState) container.appendChild(emptyState);
    refreshIcons();
    return;
  }`;

const newEmptyCheck = `  if (list.length === 0) {
    container.innerHTML = \`
      <div id="empty-orders-state" class="text-center py-10">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-2">📄</div>
        <h3 class="text-base font-black text-slate-800">No orders yet today</h3>
        <p class="text-xs text-slate-400 mt-1 font-medium">New print jobs from customer mobile scans will show up here live.</p>
      </div>
    \`;
    refreshIcons();
    return;
  }`;

agentJs = agentJs.replace(oldEmptyCheck, newEmptyCheck);

// Add active auto-polling every 3 seconds so new orders appear immediately even if WS disconnects
if (!agentJs.includes('setInterval(fetchOrders, 3000)')) {
  agentJs += `\n// Auto-poll orders every 3 seconds so new customer orders reflect immediately\nsetInterval(fetchOrders, 3000);\n`;
}

fs.writeFileSync('public/agent.js', agentJs, 'utf8');
console.log('agent.js updated');

// 2. Add hidden silent-print-frame iframe to public/admin.html and public/index.html
function addSilentFrame(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('id="silent-print-frame"')) {
    content = content.replace('</body>', '  <iframe id="silent-print-frame" style="display:none;" title="Silent Print Frame"></iframe>\n</body>');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Added silent-print-frame to ' + filePath);
  }
}

addSilentFrame('public/admin.html');
addSilentFrame('public/index.html');
