# QuickPrint Cloud — Deployment Guide (SaaS)

Deploy the multi-shop QuickPrint platform to your VPS and point
`www.qrprint.hasulotstechnologies.com` at it. Each shop keeps running a tiny
**print agent** on its own PC so jobs reach the shop's local printer.

## 1. What's in this repo

| Path | What it is |
| --- | --- |
| `cloud/server.js` | Multi-tenant Express backend: owner signup/login (JWT), shops, orders, payments, print-agent API |
| `cloud/public/index.html` | Marketing landing page (`/`) with signup + owner login links |
| `cloud/public/signup.html` | Owner self-signup form (`/signup.html`) |
| `cloud/public/owner.html` + `agent.js` | Shop Owner console (`/owner`) |
| `cloud/public/admin.html` + `platform.js` | Platform Admin console (`/admin`) |
| `cloud/public/order.html` + `app.js` | Customer page opened by scanning the QR (`/order?shop=QP_...`) |
| `agent/print-agent.js` | Local print agent that runs on each shop PC |
| `server.js`, `public/`, `*.exe` | The original single-PC (Windows) app — not used on the VPS |

## 2. VPS prerequisites

- Ubuntu 22.04+ (any Linux is fine) with a public IP.
- Node.js 18+:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  ```
- **LibreOffice Writer** — converts customer `.doc/.docx` files to PDF for preview:
  ```bash
  sudo apt install -y libreoffice-writer fonts-dejavu
  ```
- DNS: `qrprint.hasulotstechnologies.com` and `www.qrprint.hasulotstechnologies.com`
  A records pointing at the VPS IP.

## 3. Copy the code

```bash
# from your PC
scp -r cloud agent DEPLOY.md user@YOUR_VPS_IP:/opt/quickprint/

# on the VPS
cd /opt/quickprint/cloud
npm install
mkdir -p data uploads
```

## 4. Environment variables

Create `/opt/quickprint/cloud/.env` (or set them in the systemd/pm2 config):

```ini
PORT=4000
JWT_SECRET=replace-with-a-long-random-string
PUBLIC_URL=https://www.qrprint.hasulotstechnologies.com
QP_DATA_DIR=/opt/quickprint/cloud/data
QP_UPLOADS_DIR=/opt/quickprint/cloud/uploads
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-now
```

- `PUBLIC_URL` is the address printed inside every shop's QR code.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` are the platform `/admin` login.
  **Change the default `admin` / `1234` before going live.**
- Keep `JWT_SECRET` private; rotate it if it ever leaks (owners get logged out).

## 5. Run it (pm2)

```bash
sudo npm install -g pm2
cd /opt/quickprint/cloud
pm2 start server.js --name quickprint-cloud
pm2 save
pm2 startup     # run the command it prints, so it survives a reboot
```

## 6. Nginx reverse proxy + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/quickprint`:

```nginx
server {
    listen 80;
    server_name qrprint.hasulotstechnologies.com www.qrprint.hasulotstechnologies.com;
    client_max_body_size 25M;          # Word/PDF uploads

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;    # WebSocket: live order updates
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/quickprint /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d qrprint.hasulotstechnologies.com -d www.qrprint.hasulotstechnologies.com
```

`https://www.qrprint.hasulotstechnologies.com` now serves the portal.

## 7. Shop owner flow

1. Owner opens `https://www.qrprint.hasulotstechnologies.com/` → **Create shop account**.
2. Fills shop name, username, password, phone, UPI ID and per-page rates.
   The shop gets a unique `shopId` such as `QP_SRIBALAJIX_558`.
3. Logs in at `/owner`:
   - QR code + printable counter poster (QR points at `/order?shop=QP_...`).
   - **⚙️ Shop Settings → “Get / regenerate agent token”** → copy the token and the
     ready-made command for the print agent.
   - Shop open/closed switch, pricing, UPI ID, password, today's orders, CSV export,
     printable day summary.
4. Every customer order arrives as *Awaiting verification*. The owner checks the UPI
   reference and presses **Verify & Print** (or **Reject** with a reason).

## 8. Local print agent (each shop PC)

The cloud can't reach a shop's printer, so the shop PC runs a small agent.

On Windows:

```bat
cd C:\quickprint
node agent\print-agent.js ^
  --cloud https://www.qrprint.hasulotstechnologies.com ^
  --shop  QP_SRIBALAJIX_558 ^
  --token THE_TOKEN_FROM_THE_OWNER_CONSOLE
```

Options:

```bash
node print-agent.js --cloud URL --shop SHOP_ID --token TOKEN [--printer "HP LaserJet"] [--dir C:\jobs] [--poll 4000]
```

- `--printer` prints to a specific Windows printer instead of the default.
- Install [SumatraPDF](https://www.sumatrapdfreader.org/) on the shop PC for
  silent, window-free PDF printing (recommended). Without it the agent falls
  back to the shell print verb, which can fail for images.
- `PRINT_CMD` env overrides printing completely, e.g. `PRINT_CMD=SumatraPDF.exe -silent -print-to-default "{file}"`.
- The agent retries a failed job 3 times, then marks it `print_failed` so the
  owner can re-queue it instead of printing the same file forever.
- Wrap it in a `.bat`/`.vbs` launcher and put it in Windows Startup.

## 9. Customer flow

Customer scans the shop's QR poster → `/order?shop=QP_XXXX`:

1. Upload PDF / photo / Word / Excel / PowerPoint (Word is converted to PDF so it
   previews properly).
2. Pick pages, copies, colour/B&W.
3. Pay by UPI (enters the UTR reference) or pay cash at the counter.
4. The order waits for the owner to verify; if rejected, the customer sees the reason.

No app install and no customer account at any point.

## 10. Backups

v1 stores everything in `cloud/data/*.json` plus `cloud/uploads/`:

```bash
# daily at 2am
0 2 * * * tar -czf /backups/quickprint-$(date +\%F).tar.gz /opt/quickprint/cloud/data /opt/quickprint/cloud/uploads
```

For hundreds of shops, migrate the JSON helpers in `cloud/server.js` to PostgreSQL.

## 11. Updating

```bash
cd /opt/quickprint
# copy the new code over, then
cd cloud && npm install
pm2 restart quickprint-cloud
```

Web assets are served with `no-store` so a deploy needs no cache clearing. If a
shop PC still shows an old page, hard-refresh once.

## 12. API quick reference

| Method | Route | Auth |
| --- | --- | --- |
| POST | `/api/owner/signup` | – |
| POST | `/api/owner/login` | – → JWT |
| POST | `/api/admin/login` | – → JWT |
| GET | `/api/settings?shopId=` | – |
| POST | `/api/settings` | owner |
| POST | `/api/upload` | – (403 when shop closed) |
| GET | `/api/orders?shopId=` | owner |
| POST | `/api/orders` | – (403 when shop closed) |
| POST | `/api/orders/:id/claim-payment` | – (customer) |
| POST | `/api/orders/:id/verify` | owner |
| POST | `/api/agent/register` | owner → agent token |
| GET | `/api/agent/jobs` | agent token |
| POST | `/api/agent/jobs/:id/done` \| `/fail` | agent token |
