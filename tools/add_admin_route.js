const fs = require('fs');

let js = fs.readFileSync('server.js', 'utf8');

const target = `// Customer Order Portal Route
app.get(['/order', '/kiosk', '/print', '/print/:shopId'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});`;

const replacement = `// Admin Dashboard Routes (/admin, /admin.html, /dashboard, /)
app.get(['/admin', '/admin.html', '/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Customer Order Portal Route
app.get(['/order', '/order.html', '/kiosk', '/print', '/print/:shopId'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});`;

if (js.includes(target)) {
  js = js.replace(target, replacement);
  fs.writeFileSync('server.js', js, 'utf8');
  console.log('Successfully added /admin route to server.js');
} else {
  console.log('Target not found in server.js');
}
