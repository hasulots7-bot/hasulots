# QuickPrint Shop - Windows app

Electron app (Windows 10+ x64). Opens the shop `/admin` of the QuickPrint server, so the shop owner logs in with the
username/password from the owner panel, sees the **Customer Scan QR**, and paid orders print **silently** to the
selected Windows printer (B&W / Color printer chosen in the dashboard).

## Build the .exe (GitHub Actions - no Windows PC needed)
1. Push this repo to GitHub (private is fine).
2. Actions > **Build Windows app** > Run workflow. (SumatraPDF is downloaded automatically.)
3. Download `QuickPrint-Shop-Setup-1.0.0.exe` from the run's **Artifacts** (or tag `app-v1.0.0` to get a Release).
4. Upload/keep it as a GitHub **Release** asset, copy the file link, and set it in Render > Environment:
   `DESKTOP_DOWNLOAD_URL = https://github.com/<user>/<repo>/releases/download/app-v1.0.0/QuickPrint-Shop-Setup-1.0.0.exe`
   Now `https://qrprint.hasulotstechnologies.com/download` has a working download button.

## Build on a Windows PC instead
```
cd desktop
(copy SumatraPDF-64.exe to resources\SumatraPDF.exe)
npm install
npm run dist        -> dist\QuickPrint-Shop-Setup-1.0.0.exe
npm start           -> run without installing
```
Test against another server: `npm start -- --server=http://localhost:4000`

## Notes
- Server URL is `qpServerUrl` in `package.json` (or `QP_SERVER_URL` env).
- The installer is unsigned, so Windows SmartScreen shows "Windows protected your PC" -> More info -> Run anyway.
  A code-signing certificate removes this.
- Closing the window keeps the app in the system tray so printing continues. Tray > Quit stops it.
