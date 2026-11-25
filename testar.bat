@echo off
setlocal
cd /d "%~dp0"
set "NODE_BIN="
where node.exe >nul 2>&1
if not errorlevel 1 set "NODE_BIN=node.exe"
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_BIN (
  echo Node.js nao foi encontrado. Instale Node.js 22.13 ou mais recente.
  pause
  exit /b 1
)
"%NODE_BIN%" -e "const [major,minor]=process.versions.node.split('.').map(Number); if (major<22 || (major===22 && minor<13)) process.exit(1)"
if errorlevel 1 (
  echo Este projeto precisa do Node.js 22.13 ou mais recente.
  pause
  exit /b 1
)
echo Executando testes com banco temporario isolado...
"%NODE_BIN%" app\server\testes.js
set "RESULTADO=%ERRORLEVEL%"
if "%RESULTADO%"=="0" (echo Todos os testes passaram.) else (echo Os testes falharam. Consulte as mensagens acima.)
pause
exit /b %RESULTADO%
