@echo off
setlocal
cd /d "%~dp0"

echo 正在启动 知屿 · 个人知识库...
echo 启动完成后，请在浏览器打开 http://localhost:3000
echo 按 Ctrl+C 可以停止服务。
echo.

npm run dev

endlocal
