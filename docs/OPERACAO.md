# Operação e diagnóstico

## Portas no modo privado

| Porta/protocolo | Uso | Alcance esperado |
|---|---|---|
| TCP 61000 | Metagame e API do launcher | Loopback e listener autenticado no IP Tailscale do host |
| TCP 61001 | DeployServer | Somente loopback; não disponibilizar a jogadores |
| TCP 61099 | Chat XMPP/WebSocket | Local e relay privado conforme configuração |
| UDP 8770–8777 | Processos de caçada/cidade/treino | Jogadores autorizados via Tailscale |
| TCP 43967 | Retorno OAuth do launcher | Somente `127.0.0.1`, durante o login |
| HTTPS 443 de saída | Supabase/Google e serviços externos | Saída dos PCs; não é uma porta pública do seu host |

Tailscale é o transporte privado. O convite admite o jogador no servidor, mas não resolve permissões da VPN, firewall ou suspensão do computador. O host deve continuar ligado e conectado.

## Onde ficam os dados

| Dado | Local |
|---|---|
| Configuração do launcher | `settings.json` no `userData` do Electron; instalações antigas podem manter o diretório anterior |
| Sessão Google | `google-session.bin` protegido quando o sistema permite; caso contrário, memória |
| Banco do host | Caminho `DB_FILENAME` do `.env` do Metagame |
| Configuração dos serviços | `.env` em cada diretório da cópia de trabalho |
| Identidade/autorizações do host | Subdiretório `fenys` do Metagame configurado |
| Backups de alterações de configuração | `fenys-backups` no Metagame |
| Progresso canônico Google | Schema privado `fenys_global` no Supabase |
| Configurações do jogo no Windows | `%LOCALAPPDATA%/Archon/Saved/Config/WindowsClient` |

`fenys-backups` é backup de configuração/patch, não garantia de backup completo dos jogadores. Guarde também o banco, credenciais administrativas e de game server, chaves de assinatura/identidade, `.env`, outbox pendente e configuração da nuvem. Com SQLite em execução, use backup consistente pela API do SQLite; não copie somente o `.db` ignorando WAL. Para uma cópia offline, encerre o jogo e os serviços de forma limpa primeiro.

## Problemas comuns

| Sintoma | Verificação e ação |
|---|---|
| `dist/server.js ou .env não encontrado` | Confirme a pasta selecionada no launcher, a compilação e o `.env` de cada serviço |
| Erro de módulo `better-sqlite3` | Confirme Node 24, arquitetura e ferramentas nativas; execute `npm ci` no serviço afetado |
| Porta já ocupada / serviço iniciado fora do launcher | Identifique o processo; encerre a instância manual antes de configurar ou iniciar outra |
| Google indisponível | Confira provedor, client ID/secret, audiência de teste e URLs de retorno no projeto correto |
| API de personagens não publicada | GET `/functions/v1/fenys-global/players` precisa retornar versão 3; confirme função e schema |
| Ativação expirada | Confira se o SQL da autorização foi aplicado ao projeto certo e se ainda está no prazo |
| Host inacessível | Confira VPN, compartilhamento, IP Tailscale, firewall, portas e se o PC está acordado |
| Arquivo de jogo diferente | Confira os hashes; não misture cliente 2.1.1 com DLLs de 1.4.4 |
| Jogo abre, mas personagem/caçada não carrega | Confira `Game.ini` do usuário Windows do host, chave de game server, logs do Metagame e DeployServer |
| Sessão já em outro servidor | Feche o jogo e peça a saída normal; se o host caiu, aguarde a sessão expirar |
| Save não sincronizado | Preserve banco e outbox do host; recupere a conexão antes de forçar outra sessão ou apagar arquivos |
| Wine/prefixo inválido | Confirme executável Wine, `drive_c`, `system.reg` e dependências gráficas do prefixo selecionado |

A aba Atividades mostra saídas dos serviços. Antes de compartilhar logs, remova tokens, nomes pessoais, caminhos privados e chaves. Uma mensagem de API acessível não comprova a execução da partida.

## Encerrar, atualizar e recuperar

Peça aos jogadores para saírem, confirme o último save e encerre os serviços pelo processo que os iniciou. Faça backup consistente. Prepare a nova versão em outra pasta, valide configurações e só então mude o caminho do launcher. Conserve a versão antiga e o backup até conferir personagens e inventários.

Se a nuvem contém uma revisão mais recente, não force a substituição pelo banco antigo. Recupere o snapshot confirmado com o fluxo normal. Se o disco de um host foi perdido antes de confirmar o save remoto, aquele progresso pode não ser recuperável.

Após formatar somente o PC do jogador, a recuperação do modo Google é entrar na mesma conta e conectar a um host integrado. Isso pressupõe que o personagem já tenha sido vinculado e sincronizado. Uma chave antiga perdida antes do primeiro vínculo não é recuperada apenas pelo e-mail.
