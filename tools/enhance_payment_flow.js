const fs = require('fs');

// 1. In public/agent.js, show clear "Pay & Print" button for unpaid orders
let agentJs = fs.readFileSync('public/agent.js', 'utf8');

const oldActionBtn = `<div class="col-span-2 flex items-center justify-end gap-2">
        \${statusBadge}
        <button class="btn-print-action grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/30 transition hover:bg-violet-700 active:scale-95" title="Print now" data-id="\${order.id}">
          <i data-lucide="printer" class="w-4 h-4"></i>
        </button>
      </div>`;

const newActionBtn = `<div class="col-span-2 flex items-center justify-end gap-2">
        \${statusBadge}
        \${order.paymentStatus !== 'paid' && order.status !== 'completed' ? \`
          <button class="btn-print-action flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 transition active:scale-95" title="Customer Paid -> Print Now" data-id="\${order.id}">
            <span>💵</span> Pay &amp; Print
          </button>
        \` : \`
          <button class="btn-print-action grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-600/30 transition hover:bg-violet-700 active:scale-95" title="Print again" data-id="\${order.id}">
            <i data-lucide="printer" class="w-4 h-4"></i>
          </button>
        \`}
      </div>`;

if (agentJs.includes(oldActionBtn)) {
  agentJs = agentJs.replace(oldActionBtn, newActionBtn);
}

// In agent.js, when btn-print-action is clicked on an unpaid order, also call /api/orders/:id/pay
const oldContainerClick = `  const container = document.getElementById('orders-stream-list') || document.getElementById('orders-container');
  if (container) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-print-action');
      if (btn) {
        const orderId = btn.getAttribute('data-id');
        const order = agentState.orders.find(o => o.id === orderId);
        if (order) triggerDirectPrint(order);
      }
    });
  }`;

const newContainerClick = `  const container = document.getElementById('orders-stream-list') || document.getElementById('orders-container');
  if (container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-print-action');
      if (btn) {
        const orderId = btn.getAttribute('data-id');
        const order = agentState.orders.find(o => o.id === orderId);
        if (order) {
          if (order.paymentStatus !== 'paid') {
            try {
              await fetch(\`/api/orders/\${order.id}/pay\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ txnId: 'COUNTER-CASH-' + Date.now() })
              });
              order.paymentStatus = 'paid';
              order.status = 'queued';
            } catch (payErr) {
              console.warn('Pay update error:', payErr);
            }
          }
          triggerDirectPrint(order);
        }
      }
    });
  }`;

if (agentJs.includes(oldContainerClick)) {
  agentJs = agentJs.replace(oldContainerClick, newContainerClick);
}

fs.writeFileSync('public/agent.js', agentJs, 'utf8');
console.log('agent.js updated successfully');

// 2. In public/app.js, make sure submitFinalOrder does NOT auto-simulate payment before confirmation,
//    and polls order status so customer sees real-time update when shopkeeper confirms!
let appJs = fs.readFileSync('public/app.js', 'utf8');

const oldSubmitPay = `    // If online payment is completed, trigger silent print via /api/orders/:id/pay
    if (paymentStatus === 'completed') {
      try {
        await fetch(\`/api/orders/\${order.id}/pay\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ simulated: true })
        });
      } catch (payErr) {
        console.warn('Payment sync notice:', payErr);
      }
    }`;

// Replace with a clean notice that waits for admin/payment verification
const newSubmitPay = `    // Order registered in pending payment queue.
    // Document will process ONLY after shopkeeper confirms payment or UPI webhook fires!`;

if (appJs.includes(oldSubmitPay)) {
  appJs = appJs.replace(oldSubmitPay, newSubmitPay);
}

// In animateTracking, poll the order status from the server
const oldAnimate = `  // Animate physical printing completion after 3.5 seconds
  setTimeout(() => {
    if (t3) {
      t3.className = 'status-step-row done';
      const txt = document.getElementById('track3Text');
      if (txt) txt.textContent = '3. Sent to Physical Printer';
    }
    if (t4) {
      t4.className = 'status-step-row done active';
      const txt = document.getElementById('track4Text');
      if (txt) txt.textContent = '4. Printed Successfully! Collect at Counter';
    }
    const collTitle = document.getElementById('collectTitle');
    if (collTitle) collTitle.textContent = '🎉 Print Ready at Counter!';
    const collMsg = document.getElementById('collectMsg');
    if (collMsg) collMsg.textContent = 'Your prints are ready. Please collect them at the shop counter.';
  }, 3500);`;

const newAnimate = `  // Live poll order status from server until payment is verified and printed
  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch(\`/api/orders/\${order.id}\`);
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
  }, 2000);`;

if (appJs.includes(oldAnimate)) {
  appJs = appJs.replace(oldAnimate, newAnimate);
}

fs.writeFileSync('public/app.js', appJs, 'utf8');
console.log('app.js updated successfully');
