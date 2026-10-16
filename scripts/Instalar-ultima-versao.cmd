@echo off
setlocal EnableExtensions DisableDelayedExpansion
title DAUNTLESS - Instalar ultima versao
chcp 65001 >nul 2>&1
set "PROJECT=%USERPROFILE%\Dauntless-Fenys-Atualizado"
set "REPORT=%TEMP%\Dauntless-ultima-versao.log"
echo.
echo ===========================================================
echo        DAUNTLESS LAUNCHER ULTIMATE - ULTIMA VERSAO
echo ===========================================================
echo.
echo Feche o jogo, o launcher e os servidores antes de continuar.
echo Este instalador nao remove personagens, chaves ou undaunted.db.
echo.
if not exist "%PROJECT%\.git" goto no_project
where git >nul 2>&1
if errorlevel 1 goto no_git
where node >nul 2>&1
if errorlevel 1 goto no_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto no_node
cd /d "%PROJECT%"
if errorlevel 1 goto no_project
echo [1/2] Conferindo codigo e atualizando GitHub main...
git diff --quiet
if errorlevel 1 goto dirty
git diff --cached --quiet
if errorlevel 1 goto dirty
git pull --ff-only origin main
if errorlevel 1 goto git_error
if not exist "scripts\instalar-ultima-versao.cjs" goto missing_script
echo.
echo [2/2] Instalando versao do package.json e conferindo o EXE...
node "scripts\instalar-ultima-versao.cjs"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
 echo INSTALACAO NAO CONFIRMADA. Confira o ERRO acima.
 echo Log: "%REPORT%"
 echo No PowerShell: Get-Content "$env:TEMP\Dauntless-ultima-versao.log" -Tail 60
) else (
 echo INSTALACAO CONFIRMADA. Verifique a versao no aplicativo aberto.
)
echo.
pause
exit /b %RESULT%
:no_project
echo ERRO: pasta do projeto nao encontrada: "%PROJECT%"
goto failed
:no_git
echo ERRO: Git nao encontrado no Windows.
goto failed
:no_node
echo ERRO: Node.js ou npm nao encontrado. Instale o Node.js primeiro.
goto failed
:dirty
echo ERRO: existem alteracoes locais nos arquivos versionados.
echo Guarde essas alteracoes antes de atualizar. Nada foi apagado.
goto failed
:git_error
echo ERRO: git pull falhou. Confira internet, branch e permissoes.
goto failed
:missing_script
echo ERRO: verificador nao encontrado apos git pull.
goto failed
:failed
echo Nenhum save ou personagem foi alterado por este script.
pause
exit /b 1
