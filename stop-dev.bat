@echo off
rem Stops the TrackingOpsControl dev server started by start-dev.bat (or anything else serving port 5173).
setlocal enabledelayedexpansion
set found=0

rem The window start-dev.bat opened (stops npm and Vite with it).
tasklist /FI "WINDOWTITLE eq TrackingOpsControl dev server*" 2>nul | find /i "cmd.exe" >nul
if not errorlevel 1 (
  taskkill /FI "WINDOWTITLE eq TrackingOpsControl dev server*" /T /F >nul 2>nul
  set found=1
)

rem Anything still listening on the dev port (e.g. started with npm run dev in another terminal).
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":5173 .*LISTENING"') do (
  if not "%%p"=="0" (
    taskkill /PID %%p /T /F >nul 2>nul
    set found=1
  )
)

if "!found!"=="1" (
  echo Stopped the dev server.
) else (
  echo The dev server wasn't running.
)
endlocal
