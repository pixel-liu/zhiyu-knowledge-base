@echo off
setlocal
cd /d "%~dp0"

echo 正在关闭 知屿 · 个人知识库...

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root = [IO.Path]::GetFullPath((Get-Location).Path); $items = Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($root) -and ($_.CommandLine -match 'next[\\/]dist[\\/]bin[\\/]next|next dev|npm-cli.*run dev|npm run dev') }; if ($items) { $items | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Write-Host ('已关闭 ' + @($items).Count + ' 个知识库服务进程。') } else { Write-Host '没有找到正在运行的知识库服务。' }"

echo.
echo 知识库已关闭，可以按任意键退出。
pause >nul
endlocal
