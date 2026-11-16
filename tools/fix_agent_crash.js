const fs = require('fs');

let js = fs.readFileSync('public/agent.js', 'utf8');

// Add playDing and refreshIcons definition at the very top of agent.js
const helpers = `// ============================================================
// 🔔 AUDIO DING & ICON REFRESH HELPERS (Global)
// ============================================================
function playDing() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {}
}

function refreshIcons() {
  try {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (e) {}
}

window.playDing = playDing;
window.refreshIcons = refreshIcons;

`;

if (!js.includes('function refreshIcons()')) {
  js = helpers + js;
}

fs.writeFileSync('public/agent.js', js, 'utf8');
console.log('Added refreshIcons and playDing to agent.js');
