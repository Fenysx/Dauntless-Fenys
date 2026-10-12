# Dauntless Fenys — 1.4.0 beta

Launcher comunitário para Dauntless Revived 1.4.4. Esta versão conecta **hosts de jogo independentes a uma única autoridade de dados**, com backups criptografados no Google Drive já configurado pelo dono. Não distribui o jogo original e não é afiliado à Phoenix Labs ou Epic Games.

## O personagem é global

Todos os hosts da mesma rede usam o banco do PC central. Personagem, UID, nível, XP, inventário, loadouts, progressão, guildas, amizades, Slayer Links e placares de Trials são lidos/salvos pelas APIs do mesmo Metagame. Ao trocar de host, não é criado outro personagem nem copiado um save para um segundo banco de jogo.

O computador do host continua executando seus próprios servidores nativos/Ramsgate/caçadas. Sua instância de Metagame funciona como gateway autenticado: encaminha as APIs para a autoridade, valida a chave dos game servers locais e recebe alocações assinadas. Chat/XMPP também é encaminhado ao PC central, com os mesmos tokens e relações sociais. Filas públicas são separadas por host; parties podem ser alocadas juntas em um host autorizado.

Se o PC central ou a VPN ficarem offline, as APIs recusam gravações locais e o launcher não usa um personagem antigo. **Seu PC central e o serviço Metagame precisam ficar ligados**. Serviços iniciados pelo launcher são encerrados ao fechar o Fenys; mantenha os launchers dos hosts abertos durante a sessão. O Google Drive guarda backups; o serviço de jogo e a autoridade SQLite rodam no PC central escolhido pelo usuário.

## Ativar no PC do dono

A configuração existente é preservada: `DB_FILENAME=C:/dr/data/undaunted.db`, Metagame local TCP 61000, DeployServer local TCP 61001 e rclone `dauntless-crypt` sobre `dauntless-drive:Dauntless-Backups`.

1. Entre com o perfil administrador já validado no Metagame (por exemplo, Fenys).
2. Ligue o Tailscale e inicie os serviços por este launcher. Todos devem estar fora do jogo para ativar a integração.
3. Abra **Conectar servidor**, selecione **Meu PC central + Google Drive**, escolha o IP Tailscale e informe `rclone` ou o caminho do executável já instalado.
4. Clique em **Ativar rede global neste computador**. O launcher confirma `dauntless-crypt` do tipo `crypt`, salva os fontes/.env anteriores, conserva o caminho do banco, instala os módulos, compila e reinicia os serviços. Se a compilação falhar, restaura os fontes/configurações anteriores.
5. Use **Consultar backup no Drive** ou **Enviar backup agora**. Sucesso só aparece após envio e `cryptcheck`; falta de autorização, integridade ou conectividade permanece como pendência.

O endpoint continua privado: listener original em loopback e listener adicional no IP Tailscale. O DeployServer e o roteador de hosts TCP 61004 permanecem no loopback. Os computadores precisam de autorização na rede Tailscale e firewall/ACL para TCP 61000/61099 e UDP 8770–8777. O launcher não altera a conta Tailscale ou o firewall automaticamente.

## Adicionar o host do Ygor

1. No PC central, use **Gerar autorização para outro host** e envie o código ao Ygor.
2. No launcher do Ygor, entre com o administrador local, selecione a pasta do seu Dauntless Revived e inicie os serviços.
3. Em **Conectar servidor**, escolha **Host de jogo conectado ao PC central**, informe seu IP Tailscale, cole a autorização e ative a rede.
4. O host registra sua identidade Ed25519 e integra as contas antigas no banco central, mantendo UID, personagens, chaves, progresso e dados sociais/Trials. Não ganha privilégios de administrador central. O banco local é preservado e deixa de receber saves de jogo.
5. Cada host usa **Gerar código de conexão** para convidar jogadores. O jogador cola o código em **Entrar no servidor** e depois usa **Jogar Agora**. O dono recebe o aviso de entrada/saída no launcher.

Autorizações de host e códigos de jogador têm funções distintas, são aleatórios, válidos por 15 minutos e de uso único. A conta existente continua com a mesma chave e personagem após a integração. Novos jogadores criam uma conta na rede central com o convite de cadastro do Metagame; o código `FENYSC2` seleciona o host de jogo.

Para voltar ao PC central, feche o jogo e use **Voltar ao PC central**. Para outro host, use o código dele. A confirmação de saída pode levar até 90 segundos para o heartbeat expirar. O vínculo global é persistido antes da requisição; **Recuperar sincronização** confirma uma operação cuja resposta se perdeu sem duplicar o vínculo.

### Migração sem substituição de personagens

Antes de compilar/alterar o host, uma pré-validação transacional confirma a migração e reverte sua cópia de teste. A importação definitiva só ocorre depois da compilação. Se a resposta da importação se perder, o host mantém o modo global e confirma o resultado ao repetir a ativação; não volta a gravar um save local.

A integração inicial importa 37 tabelas de jogo/sociais/auditoria, incluindo usuários, hashes de chaves, personagens, inventários, progressão, guildas, amizades, links e resultados de Trials. IDs de logs autoincrementais são remapeados. Usuários importados têm `isAdmin=0` no banco central; ser dono de um host não concede administração de toda a rede.

Nomes globais, UIDs, personagens ou chaves em conflito causam rollback da importação inteira. Nenhum personagem é unido pelo nome, substituído ou apagado. Se um nome já estiver usado por outra conta, renomeie a conta local com a ferramenta administrativa antes de integrar o host. Uma importação confirmada não é executada novamente em atualizações do gateway. Credenciais locais de recuperação Discord/ciphertexts vinculados a outro segredo não são transplantados; as chaves existentes e o login local continuam válidos.

Quem usou a beta 1.3 com passaporte portátil deve primeiro retornar todos os personagens aos seus servidores originais. A integração bloqueia bancos com transferências inativas/visitantes para evitar importar um save antigo.

## Google Drive criptografado

O writer SQLite central faz uma cópia consistente do **banco inteiro**, incluindo dados sociais e placares, sem parar os jogadores. Alterações aguardam um backup agrupado a cada minuto. A cópia atual usa `dauntless-crypt:automaticos/globais/atual/undaunted.db`; há também histórico a cada hora em `automaticos/globais/historico/`. O agendamento diário anterior não é apagado ou reconfigurado.

A rotina confirma a configuração `crypt` com criptografia de dados habilitada, usa `rclone copyto`, verifica com `rclone cryptcheck` e só então registra sucesso. Falhas preservam o estado pendente para nova tentativa; a tela mostra a última cópia verificada e se ainda há alterações a enviar. O estado atual é atualizado em vez de criar um novo histórico completo a cada minuto; as três cópias temporárias locais mais recentes são mantidas.

Documentação: [copyto](https://rclone.org/commands/rclone_copyto/), [cryptcheck](https://rclone.org/commands/rclone_cryptcheck/), [config redacted](https://github.com/rclone/rclone/blob/master/docs/content/commands/rclone_config_redacted.md).

## Login e administração

Cada perfil mantém sua senha local com scrypt/sal e sua chave de jogo protegida pelo Electron safeStorage (Windows DPAPI). O renderer não recebe chaves de conta, passaportes privados ou tokens do Drive. O launcher permite uma instância por computador e exige fechar o jogo antes de trocar perfil/host. A mesma conta global pode ser importada em outro computador com sua chave, mas não pode mudar de host enquanto o jogo estiver online.

Os comandos de serviços continuam restritos ao administrador local. Administração das contas globais e remoção de acesso são feitas no PC central pelo administrador central. Remover acesso invalida chave/epoch e preserva personagem/inventário/progresso; a rotina anterior faz backup e exige confirmação pelo nome. Controles locais do gateway não apagam a conta global.

## Validar e compilar

```bash
npm ci
npm test
npm start
```

Instaladores: `npm run build:win` e `npm run build:linux`.

O CI fixa o upstream em `mixutin/dauntless-revived@29477558148a9db66cd1134a5c3df8bea7f9bea5`, compila os overlays e inicia **três Metagames reais**: autoridade mais dois gateways. Valida migração, mesmo UID/personagem, nível atualizado, amizade entre hosts, guilda e placar não vazio, com tokens RSA e APIs nativas. Os testes locais incluem SQLite/HTTP reais, replay, offline, rollback e verificação do backup inteiro.

O cliente nativo e a partida por UDP em dois PCs Windows/Tailscale não existem no runner e precisam ser verificados nos computadores dos jogadores. A compilação Linux do launcher ainda não executa o Dauntless por Wine/Proton. Não declare teste de partida concluído só porque as APIs ou o build passaram.

## Arquitetura da API

`/fenys/cloud/v2` oferece discovery, autorização/cadastro de hosts, migração inicial, convite de jogador, vínculo de conta, presença, RPC e controle dos backups. Hosts assinam cada RPC; a autoridade verifica identidade/realm/timestamp, evita reexecução do mesmo request e encaminha a chamada ao Metagame local com contexto autenticado. Saves de um host anterior são recusados após a troca; alocações de caçadas registram quais hosts podem salvar pelos participantes. Nenhuma rota interna ou caminho codificado é aceito pelo proxy de jogo.

Hosts autorizados são autoridades de simulação confiáveis. Não há anti-cheat ou consenso entre operadores maliciosos; a fonte única do estado é o PC central. Segredos, bancos, backups e configurações rclone não devem ir para o GitHub.

## Licença e créditos

AGPL-3.0-only. Consulte `LICENSE` e `NOTICE.md`. O jogo e suas marcas pertencem aos respectivos titulares. Base: [Dauntless Revived](https://github.com/mixutin/dauntless-revived), [Undaunted](https://github.com/SyST3MDeV/Undaunted).
