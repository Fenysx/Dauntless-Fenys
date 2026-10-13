# Diagnóstico Ramsgate e integração Google — 1.8 beta.4

Esta página explica erros observados nos logs reais do Dauntless Launcher Ultimate. As verificações abaixo **não alteram saves, chaves ou configurações**.

## 1. Ramsgate cai antes de abrir a porta 8777

Exemplo de log:

\`\`\`text
Game server on port 8777 exited with code 3221225786
Could not restart the game server on port 8777: Game server on port 8777 exited before listening
RAMSGATE HAS FALLEN! Restarting!
\`\`\`

- \`3221225786 = 0xC000013A = STATUS_CONTROL_C_EXIT\` é um status de encerramento por evento de controle no Windows. Não prova que o usuário fechou a janela; encerrou-se antes de ficar pronto e o watchdog do DeployServer tenta novamente.
- O Metagame e o DeployServer ainda podem responder na porta 61000/61001 enquanto o servidor nativo de cidade está indisponível. Isso **não** significa que Ramsgate/caçadas estão funcionando.
- O executável em \`GAMESERVER_BINARY_PATH\` deve ser o jogo nativo compatível (Dauntless 1.4.4), com \`dxgi.dll\` e \`UndauntedInternalServer.dll\` na mesma pasta \`Archon/Binaries/Win64\`.
- Se houve encerramento por janela, serviço Windows, execução externa ou watchdog, confirme a origem do encerramento e não altere o processo com suposições.
- O padrão do controlador de memória reserva 3072 MiB livres mais cerca de 1536 MiB para iniciar uma instância. Isso significa **aproximadamente 4,5 GiB livres antes da reserva**, salvo configurações específicas. Menos memória pode impedir uma nova instância; não é prova da causa de \`0xC000013A\`.
- \`RAMSGATE_POOL=1\` usa o modo de cidades sob demanda e requer a DLL de servidor compatível com esse modo. Não troque DLLs ou parâmetros de mundo sem antes confirmar a versão e fazer backup.

### Verificação somente leitura no Windows PowerShell

Primeiro use **Configurações → Administração e diagnóstico do servidor → Verificar instalação** no launcher beta.4. Se precisar conferir as dependências manualmente, ajuste \`$repo\` para a pasta real **sem enviar o conteúdo do .env**:

\`\`\`powershell
$repo = Join-Path $HOME 'dauntless-revived'
$envFile = Join-Path $repo 'UndauntedDeployServer\.env'
if (-not (Test-Path $envFile)) { throw "Arquivo .env do DeployServer não encontrado. Confira a pasta do projeto no launcher." }
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*GAMESERVER_BINARY_PATH=' } | Select-Object -First 1
if (-not $line) { throw 'GAMESERVER_BINARY_PATH não foi configurado.' }
$exe = ($line -split '=',2)[1].Trim().Trim('"').Trim("'")
$dir = Split-Path -Parent $exe
[pscustomobject]@{
    Executavel = Test-Path $exe
    Dxgi = Test-Path (Join-Path $dir 'dxgi.dll')
    ServidorDLL = Test-Path (Join-Path $dir 'UndauntedInternalServer.dll')
    RAMLivreGB = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)
}
\`\`\`

Não envie credenciais, arquivos \`account.key\`, token OAuth nem o conteúdo integral de \`.env\`. O resultado acima exibe apenas quatro verificações.

## 2. "Unstubbed route /launcher/google/status"

Esse log significa que **o Metagame respondeu, mas não reconheceu a rota Google solicitada**. Não confunda o login Google funcionando no launcher com a integração Google do servidor instalada e inicializada.

1. Faça backup de todas as contas e personagens atuais.
2. Com todos os jogadores fora do jogo, execute o diagnóstico do host.
3. Corrija eventuais DLLs, binários e demais bloqueios do servidor antes de tentar a integração.
4. Em **Configurações → Hospedar um servidor — integração Google e comunidade**, selecione o IPv4 LAN válido deste computador; o launcher agora sugere endereços reais. O endereço **127.0.0.1 não é aceito como host LAN no Supabase**. O host público de VPS precisa de HTTPS/certificado/IP público adequados.
5. Ative o servidor Google com autorização legítima do host original. Depois confira \`/launcher/google/status\` e **vincule o personagem antigo**, sem criar outro.
6. Somente depois de confirmar saves faça um teste em outro servidor.

## 3. Hospedar na comunidade

O catálogo da comunidade registra apenas hosts Google autorizados com **endereço HTTPS público**. Um servidor privado LAN não aparecerá no catálogo, mesmo que funcione no mesmo computador. Convites pessoais por Google controlam permissões, mas não substituem conectividade pública TCP/UDP.

Não exponha a porta de administração TCP 61001. Não contrate VPS para validar o ambiente se a partida local ainda cai na porta 8777.

## Limitações

O diagnóstico automático verifica configuração, presença de executável/DLL e RAM, mas **não determina a causa exata de uma queda do executável nativo apenas pelo código de saída**. A causa pode exigir eventos do Windows, logs do processo nativo e teste controlado no computador afetado.
