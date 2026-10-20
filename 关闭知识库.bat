@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo 正在关闭 知屿 · 个人知识库...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $root = [IO.Path]::GetFullPath((Get-Location).Path); $items = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.Contains($root + [IO.Path]::DirectorySeparatorChar) -and $_.CommandLine -match 'scripts[\\/]start-local\.mjs|next[\\/]dist[\\/]bin[\\/]next' }); foreach ($item in $items) { if (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue) { taskkill.exe /PID $item.ProcessId /T /F | Out-Null } }; Write-Host ('已关闭本项目的知识库服务，匹配进程数：' + $items.Count)"
if errorlevel 1 (
  echo 关闭失败，请查看上方错误，或回到启动窗口按 Ctrl+C。
  if /i not "%~1"=="--no-pause" pause
  exit /b 1
)

echo.
echo 知识库已关闭，可以按任意键退出。
if /i not "%~1"=="--no-pause" pause >nul
endlocal
