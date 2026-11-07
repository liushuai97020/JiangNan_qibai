@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4173'"
node server.mjs
