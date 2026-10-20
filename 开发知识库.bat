@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo 正在启动开发模式，页面会在访问时编译。
call npm run dev -- --hostname 127.0.0.1
if errorlevel 1 pause
endlocal
