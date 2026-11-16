const fs = require('fs');

const js = fs.readFileSync('public/agent.js', 'utf8');

// Find all function calls: word followed by (
const calls = new Set();
const regex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
let m;
while ((m = regex.exec(js)) !== null) {
  calls.add(m[1]);
}

// Built-ins and standard APIs
const builtins = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'fetch', 'alert', 'confirm', 'prompt', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll', 'getElementById',
  'getElementsByClassName', 'getElementsByTagName', 'appendChild', 'removeChild', 'createElement',
  'getAttribute', 'setAttribute', 'removeAttribute', 'closest', 'contains', 'matches',
  'preventDefault', 'stopPropagation', 'focus', 'blur', 'click', 'submit', 'reset',
  'trim', 'split', 'slice', 'substring', 'substr', 'toLowerCase', 'toUpperCase', 'replace', 'replaceAll',
  'includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'match', 'search',
  'push', 'pop', 'shift', 'unshift', 'forEach', 'map', 'filter', 'reduce', 'reduceRight',
  'some', 'every', 'find', 'findIndex', 'join', 'concat', 'reverse', 'sort', 'flat', 'flatMap',
  'keys', 'values', 'entries', 'assign', 'freeze', 'stringify', 'parse',
  'round', 'floor', 'ceil', 'abs', 'min', 'max', 'random', 'sqrt', 'hypot',
  'setDate', 'getDate', 'getDay', 'getFullYear', 'getHours', 'getMinutes', 'getSeconds',
  'getTime', 'toISOString', 'toLocaleDateString', 'toLocaleTimeString', 'toDateString',
  'setItem', 'getItem', 'removeItem', 'clear', 'writeText', 'open', 'print', 'reload',
  'exec', 'test', 'log', 'warn', 'error', 'info', 'debug', 'table',
  'resolve', 'reject', 'then', 'catch', 'finally', 'all', 'race',
  'add', 'remove', 'toggle', 'has', 'write', 'end', 'send', 'close',
  'FormData', 'Date', 'RegExp', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Set', 'Map',
  'Promise', 'WebSocket', 'QRCode', 'Error', 'FileReader', 'File', 'Blob', 'Image', 'URL'
]);

console.log('Total calls:', calls.size);
for (const fn of calls) {
  if (builtins.has(fn)) continue;
  // Check if defined in js
  const isDefined = js.includes('function ' + fn) || js.includes(fn + ' =') || js.includes(fn + ':');
  if (!isDefined) {
    console.log('POTENTIALLY UNDEFINED:', fn);
  }
}
