@echo off
setlocal
title QuickPrint Desktop App Installer
color 0b

echo ================================================================
echo        QuickPrint - Windows Desktop Application Setup
echo ================================================================
echo.
echo This installer creates shortcuts for THIS PC's role.
echo Run QuickPrint-Setup.exe first to choose Shop Owner or Admin.
echo.

set "APP_DIR=%~dp0"
set "APP_DIR=%APP_DIR:~0,-1%"
set "VBS_PATH=%APP_DIR%\Launch-QuickPrint.vbs"
set "ICON_PATH=%APP_DIR%\public\icon.ico"

rem Role decides the console that opens (owner or admin).
set "ROLE=owner"
if exist "%APP_DIR%\data\role.txt" set /p ROLE=<"%APP_DIR%\data\role.txt"
if /i "%ROLE%"=="admin" (
    set "APP_NAME=QuickPrint Admin"
    set "APP_DESC=QuickPrint - Platform Admin console"
) else (
    set "APP_NAME=QuickPrint Shop Owner"
    set "APP_DESC=QuickPrint - Shop Owner console and print server"
)

echo [1/3] Generating Icons and App Assets...
if not exist "%ICON_PATH%" (
    if exist "%APP_DIR%\create_icons.py" python "%APP_DIR%\create_icons.py"
)

echo [2/3] Creating Windows Desktop Shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$WshShell = New-Object -ComObject WScript.Shell; " ^
    "$Desktop = [System.Environment]::GetFolderPath('Desktop'); " ^
    "$Shortcut = $WshShell.CreateShortcut(\"$Desktop\%APP_NAME%.lnk\"); " ^
    "$Shortcut.TargetPath = 'wscript.exe'; " ^
    "$Shortcut.Arguments = '\"%VBS_PATH%\" %ROLE%'; " ^
    "$Shortcut.WorkingDirectory = '%APP_DIR%'; " ^
    "$Shortcut.IconLocation = '%ICON_PATH%'; " ^
    "$Shortcut.Description = '%APP_DESC%'; " ^
    "$Shortcut.Save(); " ^
    "$StartMenu = [System.Environment]::GetFolderPath('Programs'); " ^
    "$SmShortcut = $WshShell.CreateShortcut(\"$StartMenu\%APP_NAME%.lnk\"); " ^
    "$SmShortcut.TargetPath = 'wscript.exe'; " ^
    "$SmShortcut.Arguments = '\"%VBS_PATH%\" %ROLE%'; " ^
    "$SmShortcut.WorkingDirectory = '%APP_DIR%'; " ^
    "$SmShortcut.IconLocation = '%ICON_PATH%'; " ^
    "$SmShortcut.Description = '%APP_DESC%'; " ^
    "$SmShortcut.Save();"

echo [3/3] Installation Complete!
echo.
echo ================================================================
echo   SUCCESS! QuickPrint shortcuts are ready.
echo.
echo   Role:          %ROLE%
echo   Desktop icon:  "%APP_NAME%"
echo   Start Menu:    "%APP_NAME%"
echo.
echo   Customers do NOT install anything. They scan the shop QR and
echo   use the page on their phone.
echo ================================================================
echo.

set /p LAUNCH="Would you like to launch QuickPrint right now? (Y/N): "
if /i "%LAUNCH%"=="Y" (
    wscript.exe "%VBS_PATH%" %ROLE%
)

exit /b 0
