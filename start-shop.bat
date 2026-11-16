@echo off
title QuickPrint Server
echo ============================================================
echo   Starting QuickPrint Server & Public Internet Tunnel...
echo ============================================================
echo.
echo Starting Server...
start "QuickPrint Server" cmd /k "node server.js"
timeout /t 3 /nobreak >nul

rem Which console should open on this PC? (owner or admin)
set "ROLE=owner"
if exist "%~dp0data\role.txt" set /p ROLE=<"%~dp0data\role.txt"

echo.
if /i "%ROLE%"=="admin" (
    echo Opening Platform Admin Console...
    start http://localhost:4000/admin
) else (
    echo Opening Shop Owner Console...
    start http://localhost:4000/owner
)
start http://localhost:4000/standee.html

echo.
echo QuickPrint is Ready!
echo Customer QR page: http://localhost:4000/  (scan only - no app install)
echo ============================================================
pause
