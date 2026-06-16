@echo off
title Trading Research Backtester

echo Controleren of poort 5173 al in gebruik is...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Write-Host ('Stoppen PID ' + $_); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo.
echo Trading Research Backtester starten op http://localhost:5173
echo Druk Ctrl+C om te stoppen.
echo.
node server/index.mjs
