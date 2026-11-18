@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deskpanel.ps1" -Action Install
if errorlevel 1 pause
