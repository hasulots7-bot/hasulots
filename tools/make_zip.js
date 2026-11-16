const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetZip = path.resolve(__dirname, '..', '..', 'Hasulots-QuickPrint-Deploy.zip');
if (fs.existsSync(targetZip)) {
  fs.unlinkSync(targetZip);
}

try {
  execSync(`tar --exclude="node_modules" --exclude=".git" --exclude="cloudflared.exe" --exclude="*.exe" --exclude=".system_generated" -a -cf "${targetZip}" *`, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
  const stat = fs.statSync(targetZip);
  console.log('Deploy ZIP successfully created at:', targetZip, 'Size:', (stat.size / 1024 / 1024).toFixed(2), 'MB');
} catch (err) {
  console.error('Tar error:', err);
}
