@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 22.13 或更新版本，然后重新打开此脚本。
  pause
  exit /b 1
)

node "%~dp0scripts\start-local.mjs"
if errorlevel 1 (
  echo.
  echo 启动未完成，请查看上方错误提示。按任意键关闭窗口。
  pause >nul
  exit /b 1
)

endlocal
