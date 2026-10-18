@echo off
setlocal
title NU Motion Console
cd /d "%~dp0"
set "PAGE=%~1"
set "DASHBOARD_URL=http://127.0.0.1:8000/%PAGE%"

rem Reuse the server only when it already supports the integrated pages.
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul 2>nul
if errorlevel 1 goto check_python

powershell.exe -NoProfile -Command "try {$response=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/tennis' -TimeoutSec 2; if($response.StatusCode -eq 200){exit 0}}catch{}; exit 1" >nul 2>nul
if not errorlevel 1 goto reuse_server

echo An older NU Motion server is using port 8000. Restarting it...
powershell.exe -NoProfile -Command "try {$status=Invoke-RestMethod 'http://127.0.0.1:8000/api/status' -TimeoutSec 2; if($null -eq $status.serial_connections){exit 2}; $ids=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction Stop ^| Select-Object -ExpandProperty OwningProcess -Unique; foreach($id in $ids){$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id); if($process.Name -notlike 'python*' -or $process.CommandLine -notmatch 'app\.py'){exit 3}}; foreach($id in $ids){Stop-Process -Id $id -Force}; exit 0}catch{exit 4}"
if errorlevel 1 goto port_in_use
timeout /t 2 /nobreak >nul

:check_python

where python >nul 2>nul
if errorlevel 1 goto no_python

echo [1/2] Checking Python packages...
python -c "import fastapi, uvicorn, serial" >nul 2>nul
if errorlevel 1 goto install_packages
goto start_server

:install_packages
echo Installing required packages for the first run...
python -m pip install -r requirements.txt
if errorlevel 1 goto install_failed

:start_server
echo [2/2] Starting NU Motion Console...
echo Page: %DASHBOARD_URL%
echo Select a COM port and click CONNECT in the dashboard.
echo Press Ctrl+C in this window to stop the server.
echo.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$url='%DASHBOARD_URL%'; for($i=0;$i -lt 40;$i++){try{Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 1 ^| Out-Null; Start-Process $url; break}catch{Start-Sleep -Milliseconds 500}}"
python app.py
if errorlevel 1 goto server_failed
goto done

:reuse_server
echo NU Motion Console is already running.
start "" "%DASHBOARD_URL%"
timeout /t 1 /nobreak >nul
exit /b 0

:port_in_use
echo [ERROR] Port 8000 is being used by another program.
echo Close that program and run this BAT again.
pause
exit /b 1

:no_python
echo [ERROR] Python 3 was not found.
echo Install Python 3 and enable Add Python to PATH.
pause
exit /b 1

:install_failed
echo [ERROR] Package installation failed.
pause
exit /b 1

:server_failed
echo.
echo [ERROR] The server stopped or port 8000 is already in use.
pause
exit /b 1

:done
endlocal
