@echo off
echo Stoppen van Trading Research Backtester op poort 5173...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Write-Host ('Stoppen PID ' + $_); Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"
echo Klaar.
