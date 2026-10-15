@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Dauntless Launcher Ultimate - Instalador corrigido beta 10
chcp 65001 >nul 2>&1
set "PROJECT=%USERPROFILE%\Dauntless-Fenys-Atualizado"
set "LOG=%TEMP%\Dauntless-beta10-corrigido.log"
set "SETUP=%PROJECT%\release\Dauntless Launcher Ultimate Setup 1.8.0-beta.10.exe"

echo.
echo ========================================================
echo   DAUNTLESS LAUNCHER ULTIMATE - BETA.10 - CORRIGIDO
echo ========================================================
echo.
echo Feche o jogo, o launcher e os processos do servidor.
echo Este script NAO remove personagens, saves ou chaves.
echo Ele somente atualiza o projeto do LAUNCHER e gera o instalador.
echo.
pause

if not exist "%PROJECT%\.git" goto no_repo
where git >nul 2>&1
if errorlevel 1 goto missing_git
where node >nul 2>&1
if errorlevel 1 goto missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_node
cd /d "%PROJECT%"
if errorlevel 1 goto no_repo
echo.
echo Pasta do projeto: "%PROJECT%"
echo Versao Node:
node --version

echo.
echo [1/5] Conferindo modificacoes locais...
git diff --quiet
if errorlevel 1 goto local_changes
git diff --cached --quiet
if errorlevel 1 goto local_changes

echo.
echo [2/5] Baixando atualizacao do GitHub...
git pull --ff-only origin main > "%LOG%" 2>&1
if errorlevel 1 goto failed_git
for /f %%V in ('node -p "require('./package.json').version"') do set "VERSION=%%V"
if not "%VERSION%"=="1.8.0-beta.10" goto wrong_version

echo.
echo [3/5] Reinstalando dependencias corretamente...
echo (Pode demorar alguns minutos.)
call npm.cmd ci >> "%LOG%" 2>&1
if errorlevel 1 goto failed_npm

echo.
echo [4/5] Executando testes do launcher...
call npm.cmd test >> "%LOG%" 2>&1
if errorlevel 1 goto failed_tests

echo.
echo [5/5] Criando instalador para Windows...
call npm.cmd run build:win >> "%LOG%" 2>&1
if errorlevel 1 goto failed_build
if not exist "%SETUP%" goto failed_build

echo.
echo INSTALADOR GERADO:
echo "%SETUP%"
echo.
echo Abrindo instalador. Conclua as telas de instalacao.
start "" "%SETUP%"
if errorlevel 1 goto failed_build
echo.
echo ATENCAO: a atualizacao do Metagame e do autosave do
echo servidor sera feita DEPOIS, com backup verificado.
echo.
pause
exit /b 0

:no_repo
echo.
echo ERRO: nao encontrei o projeto em:
echo "%PROJECT%"
echo Nenhum arquivo foi modificado.
goto ending
:missing_git
echo ERRO: o programa Git nao foi encontrado neste Windows.
goto ending
:missing_node
echo ERRO: Node.js ou npm nao esta instalado ou nao esta no PATH.
goto ending
:local_changes
echo ERRO: existem alteracoes locais de codigo.
echo Parei para nao sobrescrever seus arquivos.
goto ending
:wrong_version
echo ERRO: codigo baixado nao corresponde a beta.10.
echo Versao encontrada: %VERSION%
goto logs
:failed_git
echo ERRO: falha ao baixar a atualizacao (Git).
goto logs
:failed_npm
echo ERRO: falha ao instalar dependencias (npm ci).
goto logs
:failed_tests
echo ERRO: um ou mais testes reprovaram a atualizacao.
echo A instalacao foi interrompida para sua seguranca.
goto logs
:failed_build
echo ERRO: o instalador Windows nao foi gerado.
goto logs
:logs
echo.
echo ===== ULTIMAS LINHAS DO ERRO =====
powershell.exe -NoProfile -Command "if(Test-Path -LiteralPath '%LOG%'){Get-Content -LiteralPath '%LOG%' -Tail 55}"
echo ==================================
echo Relatorio completo:
echo "%LOG%"
:ending
echo.
echo Nenhum save nem conta Google foi apagado por este script.
echo Se houver erro, mande uma FOTO da tela acima sem chaves.
echo.
pause
exit /b 1
