@echo off
rem Starts the TrackingOpsControl dev server in its own window and opens the app in the browser.
rem Stop it with stop-dev.bat (or close the "TrackingOpsControl dev server" window).
setlocal
cd /d "%~dp0"

rem Already running? Just open the app.
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo The dev server is already running on http://localhost:5173
  start "" http://localhost:5173
  exit /b 0
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm wasn't found. Install Node.js from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing packages the first time - this takes a minute...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

rem Vite opens the browser itself once it's ready (server.open in vite.config.ts).
start "TrackingOpsControl dev server" cmd /c "npm run dev"
echo Starting the dev server on http://localhost:5173 - your browser will open when it's ready.
endlocal
