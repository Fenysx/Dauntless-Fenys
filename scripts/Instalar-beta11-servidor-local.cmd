@echo off
setlocal EnableExtensions DisableDelayedExpansion
title DAUNTLESS - Instalar e conferir beta.11
chcp 65001 >nul 2>&1
set "PROJECT=%USERPROFILE%\Dauntless-Fenys-Atualizado"
echo.
echo =======================================================
echo   DAUNTLESS LAUNCHER ULTIMATE - INSTALAR BETA.11
echo               COM VERIFICACAO FINAL
echo =======================================================
echo.
echo Feche o jogo, o launcher e seus servidores antes de seguir.
echo Esta rotina NAO remove saves, contas, chaves ou undaunted.db.
echo Vai gerar e instalar o launcher, e comprovar a versao.
echo.
pause
if not exist "%PROJECT%\.git" goto no_project
where git >nul 2>&1
if errorlevel 1 goto no_git
where node >nul 2>&1
if errorlevel 1 goto no_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto no_node
cd /d "%PROJECT%"
if errorlevel 1 goto no_project
echo.
echo [1/2] Baixando o codigo mais recente do GitHub...
git diff --quiet
if errorlevel 1 goto dirty
git diff --cached --quiet
if errorlevel 1 goto dirty
git pull --ff-only origin main
if errorlevel 1 goto git_error
if not exist "scripts\instalar-beta11-verificado.cjs" goto missing_script
echo.
echo [2/2] Instalando e CONFERINDO a versao real no Windows...
node "scripts\instalar-beta11-verificado.cjs"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" (
  echo FALHOU: a versao beta.11 nao foi confirmada. Veja o ERRO acima.
  echo Nao foram alterados saves ou credenciais por este script.
) else (
  echo CONFIRMADO: versao beta.11 instalada e executavel identificado.
)
echo.
echo Envie uma foto do final desta janela se houver algum erro.
pause
exit /b %RESULT%
:no_project
echo ERRO: pasta do projeto nao encontrada: "%PROJECT%"
goto failed
:no_git
echo ERRO: Git nao encontrado no Windows.
goto failed
:no_node
echo ERRO: Node.js ou npm nao encontrado no Windows.
goto failed
:dirty
echo ERRO: ha alteracoes locais de codigo; nao vou sobrescrever.
goto failed
:git_error
echo ERRO: git pull falhou; confirme a conexao e as permissoes do GitHub.
goto failed
:missing_script
echo ERRO: arquivo novo do instalador nao foi baixado.
goto failed
:failed
echo Seus saves e seu personagem foram preservados.
echo.
pause
exit /b 1
