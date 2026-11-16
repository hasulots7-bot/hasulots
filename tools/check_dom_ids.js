const fs = require('fs');
const html = fs.readFileSync('public/admin.html', 'utf8');
const js = fs.readFileSync('public/agent.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const ids = new Set();
while ((match = regex.exec(js)) !== null) {
  ids.add(match[1]);
}

console.log('Total getElementById in agent.js:', ids.size);
for (const id of ids) {
  const found = html.includes(`id="${id}"`);
  if (!found) {
    console.log('MISSING in admin.html:', id);
  }
}
