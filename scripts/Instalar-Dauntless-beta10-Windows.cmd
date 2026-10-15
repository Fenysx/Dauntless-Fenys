@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Dauntless Launcher Ultimate - Instalar beta.10
chcp 65001 >nul 2>&1

set "PROJECT=%USERPROFILE%\Dauntless-Fenys-Atualizado"
set "LOG=%TEMP%\Dauntless-beta10-instalacao.log"
set "SETUP=%PROJECT%\release\Dauntless Launcher Ultimate Setup 1.8.0-beta.10.exe"

echo.
echo =========================================================
echo   DAUNTLESS LAUNCHER ULTIMATE - INSTALAR 1.8.0-beta.10
echo =========================================================
echo.
echo Feche o Dauntless, o Launcher Ultimate e seus servidores
echo antes de continuar. Nao apague o banco undaunted.db.
echo Esta atualizacao do LAUNCHER nao restaura nem troca saves.
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

echo [1/4] Verificando alteracoes locais...
git diff --quiet --exit-code
if errorlevel 1 goto local_changes
git diff --cached --quiet --exit-code
if errorlevel 1 goto local_changes

echo [2/4] Atualizando codigo pelo GitHub...
git pull --ff-only origin main > "%LOG%" 2>&1
if errorlevel 1 goto failed_git
for /f %%V in ('node -p "require('./package.json').version"') do set "VERSION=%%V"
if not "%VERSION%"=="1.8.0-beta.10" goto wrong_version

echo [3/4] Testando a versao nova (pode demorar)...
call npm.cmd test >> "%LOG%" 2>&1
if errorlevel 1 goto failed_tests

echo [4/4] Construindo instalador Windows (pode demorar)...
call npm.cmd run build:win >> "%LOG%" 2>&1
if errorlevel 1 goto failed_build
if not exist "%SETUP%" goto failed_build

echo.
echo Testes aprovados. Instalador gerado:
echo "%SETUP%"
echo.
echo O instalador sera aberto agora. Conclua as telas do Windows.
start "" "%SETUP%"
goto done

:no_repo
echo ERRO: projeto Git nao encontrado em:
echo "%PROJECT%"
echo Instale o projeto ou informe onde a pasta atual esta localizada.
goto error_end
:missing_git
echo ERRO: Git nao encontrado. Instale o Git for Windows.
goto error_end
:missing_node
echo ERRO: Node.js ou npm nao encontrado no PATH.
goto error_end
:local_changes
echo ERRO: o projeto tem alteracoes locais; nao vou sobrescreve-las.
echo Salve essas alteracoes antes de atualizar.
goto error_end
:failed_git
echo ERRO: nao foi possivel atualizar pelo GitHub.
goto log_error
:wrong_version
echo ERRO: versao encontrada: %VERSION%
echo Esperado: 1.8.0-beta.10. Atualizacao interrompida.
goto log_error
:failed_tests
echo ERRO: um ou mais testes falharam. Instalacao bloqueada.
goto log_error
:failed_build
echo ERRO: nao foi possivel gerar o instalador. Nada foi instalado.
goto log_error
:log_error
echo.
echo --- Ultimas mensagens do relatorio ---
powershell.exe -NoProfile -Command "if(Test-Path -LiteralPath $env:TEMP\Dauntless-beta10-instalacao.log){Get-Content -LiteralPath $env:TEMP\Dauntless-beta10-instalacao.log -Tail 35}"
echo.
echo Relatorio completo:
echo "%LOG%"
goto error_end
:done
echo.
echo O instalador foi aberto. Verifique depois a versao beta.10.
echo Para habilitar o novo autosave no Metagame, e preciso
echo fazer backup e atualizar o servidor separadamente.
echo.
pause
exit /b 0
:error_end
echo.
echo NENHUM save ou configuracao Google foi apagado por este script.
echo Se houver falha, envie apenas o erro, nunca as chaves.
echo.
pause
exit /b 1
