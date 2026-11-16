# Hasulots QuickPrint

Node/Express server + **Neon Postgres** (free) database. **Render** (free)-la host aagum -> `print.hasulotstechnologies.com`

## Folder structure
```
public/     -> website files (index, admin, order, standee, js, css)
seed/       -> first-time data (shops, settings). Database empty-a irundha auto import aagum
desktop/    -> shop PC launcher files (.bat, .vbs, .cs)
tools/      -> old dev helper scripts (production-ku vendaam)
server.js   -> main server
store.js    -> Neon Postgres / local-file data layer
```

## 1. Local-la test
```
npm install
npm start          # http://localhost:4000/admin.html
```
`DATABASE_URL` set pannaadha local JSON mode-la odum (data/ folder). Login: `admin` / `1234`

## 2. Neon database (free, card vendaam)
1. https://neon.com > Sign up > Create project (region: Singapore `ap-southeast-1` nalladhu)
2. Dashboard > **Connect** > connection string copy pannunga
   (`postgresql://user:pass@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`)
3. Tables-a naan create pannala vendaam, server first start-la thaanaa create pannum.

## 3. GitHub
Repo **Private**-a vainga.
```
git init && git add . && git commit -m "QuickPrint" && git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

## 4. Render (free)
1. New > Web Service > GitHub repo select
2. Build: `npm install`  |  Start: `node server.js`  |  Instance type: Free
3. Environment > `DATABASE_URL` = Neon connection string paste
4. Deploy. Logs-la `🐘 Neon Postgres connected` + `🌱 Seeded ...` varanum.

## 5. Domain
Render > Settings > Custom Domains > `print.hasulotstechnologies.com`.
DNS-la Render kudukkura **CNAME** add pannunga (`print` -> `xxxx.onrender.com`).


## Owner (company) login & shop approval flow
1. Render > Environment-la set pannunga: `SUPERADMIN_USER`, `SUPERADMIN_PASS` (strong password). `AUTH_SECRET` auto-generate aagum.
2. Owner panel: `https://print.hasulotstechnologies.com/owner` (illa `/superadmin`)
3. Shop owner website-la **"1 Week Free Demo"** form fill pannuvanga (name, WhatsApp, shop, address, email, username, password).
4. Request owner panel-la **Pending** aa varum (blue banner + count). Owner **Approve** click pannina 1 week demo start aagum, WhatsApp message button varum.
5. Shop owner `/admin`-la login pannalaam. Approve aagala-na login-la "waiting for approval" nu varum.
6. Demo mudinjadhum owner **Renew** (Monthly / Yearly / Lifetime / custom days) click pannina licence extend aagum. Suspend, Reset password, History ellam anga irukku.

## Website pages
`/` (landing), `/features`, `/setup-guide`, `/about`, `/contact`. Header/footer, phone, WhatsApp, email ellam **`public/site.js`**-la ulla `SITE_CONFIG`-la mattum maathunga (WhatsApp `919999999999` placeholder-a irukku, unga real number podunga).

## Gnabagam
- Render free: 15 min idle-na server sleep aagum, first open slow (30-60 sec). Apram normal.
- Neon free: 5 min idle-na database sleep aagum, first query konjam slow. Data safe, pause aagaadhu.
- Neon free limit 1 GB. Thaandina new data save aagaadhu (bill varaadhu).
- `uploads/` (customer files) Render disk-la temporary. Shops/orders/settings database-la safe.
- Login security (open `/api/settings`, `admin`/`1234`, plain passwords) live-ku munna fix pannanum.

## Owner panel (v2)
- Sidebar: Dashboard, Shops, Requests, Payments, Settings.
- **Settings**: demo days, plan prices/days, UPI + bank details, owner username/password change (saved in DB `config` table; overrides Render env login once changed).
- **Create Shop**: username + password auto-generate (🔄 for another). Plan select panna amount auto-fill.
- **Renew / Approve / Create**: payment method (UPI/Cash/Bank/Card/Cheque/Other), Paid / Pay-later, reference, UPI QR. Pay-later dues Payments tab-la "Mark paid".
- **Shops → ⋯ → Extend days**: demo/licence-ku extra days kudukka.
