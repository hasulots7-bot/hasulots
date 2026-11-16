# 🖨️ QuickPrint — Self-Service QR Printing System

Customers scan a QR code at the shop counter, pick their file on a normal web page, choose the pages and print options, pay, and collect the printout with a token number. **Customers install nothing** — no app, no software, no download. Only the shop PC runs QuickPrint.

> ⚡ **No Customer Wi-Fi Required**: Customers stay on their own 4G/5G. The built-in Cloudflare tunnel gives a public HTTPS link that reaches the shop computer and its printer.

---

## 👥 Two separate consoles

QuickPrint now has two clearly separated roles. First-time setup asks which one this PC is:

| Role | Page | Who uses it |
|---|---|---|
| 🏪 **Shop Owner** | `/owner` | The shop. Printers, pricing, UPI, QR poster, live orders, payment verification and printing. |
| 🛡️ **Platform Admin** | `/admin` | You / the company. Server + tunnel status, shop registry, activating shops, platform admin login. |

The customer page is `/` (also `/order`). It never asks for an install.

Default logins after setup:

- Shop Owner: the username/password entered during setup (fallback `admin` / `1234`)
- Platform Admin: the username/password entered during setup (default `admin` / `1234`)

Change both inside their consoles after the first login.

---

## 🌟 What each part does

### 1. 📱 Customer page (`/` — scan only)
- No app, no APK, no Play Store, no download.
- Upload PDF, JPG, PNG, **DOC/DOCX**, or TXT.
- **Word and text files are converted to PDF on the shop PC**, so the customer sees an in-page preview and can select pages instead of downloading the file.
- Page selection / page range, colour or B&W, copies, duplex, paper size, live price.
- Payment method:
  - **UPI** — scan the dynamic QR, pay, optionally enter the UPI ref/UTR, then send the order to the counter.
  - **Cash** — place the order and pay at the counter.
- **Nothing prints until the shop owner verifies the payment.**
- Live status tracker: Order received → Payment check → Printing → Ready at counter. If the owner rejects the payment, the customer sees the reason immediately.
- 4-digit pickup token shown on the success screen.

### 2. 🏪 Shop Owner console (`/owner`)
- Live order queue with audio alert.
- Each order shows the payment method, UPI reference (if given), amount and document.
- **Verify & Print** — owner confirms the money was received (GPay/PhonePe/cash), then the job is queued and printed.
- **Reject** — owner marks "payment not received"; the customer is told why and nothing is printed.
- Print again / reprint any order.
- Shop settings: name, phone, address, UPI ID, B&W and colour rates, duplex discount.
- Printer selection, auto-print toggle, shop open/closed toggle.
- Customer QR card, big QR modal and printable standee poster.

### 3. 🛡️ Platform Admin console (`/admin`)
- Server status, uptime, local + public URLs, tunnel state.
- Restart the public tunnel (this changes the URL — reprint the QR poster after).
- Shop registry: see all shops, activate a shop, add a new shop with its owner login, UPI ID and rates.
- Platform admin credential change.
- Read-only monitor of the latest orders. Printing and payment verification stay on the owner console.

### 4. 🪧 Counter standee poster (`/standee.html`)
A4 poster with the shop QR, shop name and Tamil + English instructions. Print it and place it at the counter.

---

## 💻 First-time setup (shop PC)

1. Run **`QuickPrint-Setup.exe`**.
2. Choose what this PC is:
   - **Shop Owner PC** — enter shop name, owner username/password, phone, address, UPI ID, B&W and colour rates.
   - **Platform Admin PC** — no shop details needed.
3. Set the platform admin username/password.
4. Tick the pieces you want installed:
   - Desktop shortcut
   - Start Menu shortcut
   - Start QuickPrint automatically at Windows sign-in
5. Click **Install**. Setup writes the configuration, creates only the shortcuts you selected and removes the shortcut for the other role.

The wizard writes `data/first-run.json`; the server applies it on next start, then archives it as `data/first-run.applied.json`. It also writes `data/role.txt` so the launcher knows which console to open.

Manual shortcut creation later: **`Install-QuickPrint.bat`** (uses the installed role).

---

## 🚀 How to run

- Double-click the **QuickPrint Shop Owner** or **QuickPrint Admin** desktop shortcut, or run **`start-shop.bat`**.
- The launcher starts the Node server if needed, then opens the correct console in a standalone window (`--app=...`) with silent printing enabled.
- The server starts the Cloudflare tunnel automatically and prints the public URL in the console.
- Open `/standee.html` and print the QR poster for the counter.

Node dependencies: `npm install` once, then `npm start` (or let the launcher do it).

---

## 🔄 Order + payment flow

1. Customer scans QR → opens `/` → uploads file.
2. Word/TXT is converted to PDF on the server → preview + page selection.
3. Customer chooses pages, copies, colour, duplex → picks UPI or Cash → confirms.
4. Order appears instantly in `/owner`.
5. Customer pays by UPI (or pays cash at the counter).
6. Owner checks the payment, then:
   - **Verify & Print** → `paymentStatus: paid`, status `queued`, auto-print if enabled.
   - **Reject** → status `rejected` with a reason shown to the customer.
7. Customer page updates live. When printing is done the owner marks it completed and the customer sees "Ready at counter".

Statuses: `pending_payment` → `awaiting_verification` → `queued` → `printing` → `completed`, or `rejected`.

---

## 🧩 File map

| File | Purpose |
|---|---|
| `server.js` | Express API, WebSocket, uploads, Word→PDF, page-range PDF, order + payment verification, tunnel |
| `public/order.html`, `app.js`, `customer.css` | Customer scan page |
| `public/owner.html`, `agent.js` | Shop Owner console |
| `public/admin.html`, `platform.js` | Platform Admin console |
| `public/standee.html` | Printable counter QR poster |
| `tools/convert-word.ps1` | Word COM → PDF converter used for DOC/DOCX preview |
| `QuickPrintSetup.cs` | Setup wizard (role + components) |
| `QuickPrint.cs` | Launcher (starts server, opens the right console) |
| `data/settings.json`, `data/shops.json`, `data/orders.json` | Live configuration and orders |

---

## ⚠️ Notes

- Word conversion uses Microsoft Word installed on the shop PC. If Word is missing, the upload is rejected with a "save as PDF and upload again" message.
- Rebuilding printers/QR: the public tunnel URL changes when the tunnel restarts; reprint the standee poster after a restart.
- The platform admin and shop owner consoles use different login endpoints and separate session keys, so one does not unlock the other.
