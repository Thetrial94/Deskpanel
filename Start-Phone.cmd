@echo off
cd /d "%~dp0"
if not exist node_modules\node-ical call npm ci --ignore-scripts
if errorlevel 1 exit /b 1
node server/index.mjs --lan
pause
