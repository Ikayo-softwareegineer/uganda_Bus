@echo off
setlocal
set "PHP=%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe"

if not defined ADMIN_PASSWORD (
    echo Set ADMIN_PASSWORD in the environment before starting the server.
    pause
    exit /b 1
)

if not exist "%PHP%" (
    where php >nul 2>nul
    if errorlevel 1 (
        echo PHP was not found. Install PHP 8.3 or add PHP to your PATH, then try again.
        pause
        exit /b 1
    )
    set "PHP=php"
)

powershell -NoProfile -Command "if (Test-NetConnection 127.0.0.1 -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
    echo Port 8000 is already in use. Close the other server, then run this launcher again.
    pause
    exit /b 1
)

cd /d "%~dp0"
start "Uganda Bus PHP Server" "%PHP%" -S 127.0.0.1:8000 -t "%~dp0" "%~dp0router.php"
powershell -NoProfile -Command "$ready = $false; for ($i = 0; $i -lt 20; $i++) { if (Test-NetConnection 127.0.0.1 -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue) { $ready = $true; break }; Start-Sleep -Milliseconds 500 }; if (-not $ready) { exit 1 }"
if errorlevel 1 (
    echo PHP server did not start. Check the server window for errors.
    pause
    exit /b 1
)
start "" "http://127.0.0.1:8000/"
