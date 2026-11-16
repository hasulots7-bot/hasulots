# Hasulots QuickPrint

Ore system. Moonu part:

| Part | Enga irukku | Velai |
|---|---|---|
| **Online server** (website + QR order page + shop dashboard + owner panel) | Render (free) + Neon database | Customer QR scan panni file upload, pay |
| **Windows .exe** (`desktop/`) | Shop PC | Online server `/admin` open pannum, paid order-a printer-ku silent-a print pannum |
| **Domain / DNS** | Cloudflare | `qrprint.hasulotstechnologies.com` -> Render |

QR code, order link ellam online server URL-a pathi thaan varum (server request host-la irundhu eduthukkum), so .exe-la irundhu QR paartha adhuve online link.

## 1. Neon database (free)
neon.com > Create project (Singapore) > Connect > connection string copy.

## 2. GitHub
Repo **Private**-a vainga.
```
git init && git add . && git commit -m "QuickPrint" && git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
`.gitignore` irukku, so `node_modules`, `data/`, `uploads/` pogaadhu.

## 3. Render (online server)
New > Web Service > GitHub repo. Build `npm install`, Start `node server.js`, Free.
Environment:
- `DATABASE_URL` = Neon string
- `SUPERADMIN_USER`, `SUPERADMIN_PASS` = owner panel login (strong password)
- `DESKTOP_DOWNLOAD_URL` = (step 5-la kidaikkum)
`AUTH_SECRET` auto-generate aagum.
Deploy mudinja `https://<name>.onrender.com` open pannunga. Logs-la `Neon Postgres connected` varanum.

## 4. Cloudflare domain
1. Domain Cloudflare-la irukkanum (illa-na add pannunga).
2. Render > Settings > Custom Domains > `qrprint.hasulotstechnologies.com` add.
3. Cloudflare DNS > CNAME `print` -> `<name>.onrender.com`. SSL/TLS mode: **Full**.
4. Test: `https://qrprint.hasulotstechnologies.com/admin` open aaganum.

## 5. Windows .exe
1. `desktop/package.json` la `qpServerUrl` = `https://qrprint.hasulotstechnologies.com`.
2. GitHub > Actions > **Build Windows app** > Run workflow (SumatraPDF auto download aagum).
3. Mudinja Artifacts-la `QuickPrint-Shop-Setup-1.0.0.exe` download pannunga.
4. Download link venum na: `git tag app-v1.0.0 && git push --tags` -> Releases-la .exe varum. Adha copy panni Render `DESKTOP_DOWNLOAD_URL`-la podunga. `/download` page-la button velai seiyum.
Windows "Windows protected your PC" kaatum (unsigned) -> More info > Run anyway.

## 6. First test
1. Website `/` > Free Demo form fill pannunga (unga sondha shop).
2. `/owner` login (SUPERADMIN) > Pending > Approve.
3. Shop PC-la .exe install > shop username/password login > printer select (B&W / Color).
4. Dashboard-la QR scan pannunga > file upload > pay > print varanum.

## Gnabagam
- `public/site.js`-la `whatsapp`, `phone`, `email` placeholder (`919999999999`) -> real values.
- Render free: 15 min idle-na sleep. Shop open-a irukkum bodhu first scan slow irukkum. Uploads Render disk-la thaan irukku, restart-la azhiyum (orders database-la safe).
- Seed-la default shop/password (`1234`) neekitten. Ippo yaarum demo form vazhiyaa thaan shop create aagum.
