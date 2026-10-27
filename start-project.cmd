@echo off
setlocal
cd /d "%~dp0"
call npm run dev:all
if errorlevel 1 pause
endlocal
