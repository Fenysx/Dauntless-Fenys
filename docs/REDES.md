# Conectar por LAN ou HTTPS público (sem exigir Tailscale)

Na versão **1.8.0-beta.1**, a navegação principal apresenta **Servidor local** e **Servidores da comunidade**. O host configura a rede em **Escolher servidor → Administração avançada → Conexão do servidor**. Tailscale permanece somente como compatibilidade de instalações antigas, não é obrigatório para novos jogadores.

| Modo | Endereço anunciado | O que o jogador precisa |
|---|---|---|
| Privado — Tailscale | IPv4 Tailscale do host, porta 61000 | Acesso à rede/compartilhamento Tailscale e convite |
| Rede local — LAN | Ex.: `192.168.1.20:61000` | Acesso à mesma rede local e convite |
| Público — HTTPS | Ex.: `https://jogo.seudominio.com` ou `https://jogo.seudominio.com:8443` | Internet e convite; não precisa instalar Tailscale |

Todos os modos integrados usam a mesma identidade Google e progresso no Supabase. Na 1.8 beta, o catálogo e convites Google podem selecionar hosts públicos; veja [COMUNIDADE.md](COMUNIDADE.md). Hospedagem paga em uma VPS não implica cobrança de jogadores. Autorizações VIP são manuais e não processam pagamentos.

## Preparação comum

Configure e compile os serviços conforme [INSTALACAO.md](INSTALACAO.md). Ative o provedor Google e a API conforme [NUVEM.md](NUVEM.md). Selecione a chave administradora local. Mantenha todos fora do jogo antes de ativar ou trocar o modo de rede. A pasta `server/upstream` permanece intacta; as alterações são feitas na cópia de execução.

Para mudar o modo de um host Google, selecione a nova conexão e clique novamente em **Ativar servidor Google**. O modo legado Tailscale pode ser recuperado apenas por compatibilidade. O botão antigo **Configurar acesso Tailscale** é para servidores ainda não integrados; ele não substitui a atualização do cadastro Google.

A troca só anuncia o novo endereço após compilar o Metagame. Se a compilação ou o registro falhar, o launcher restaura os arquivos, módulos, certificados e a configuração anterior. Se a nuvem estiver indisponível durante a restauração do cadastro, o host tenta confirmar o endereço anterior ao reconectar.

## LAN

Escolha **Rede local — LAN** e informe o IPv4 privado **deste computador**, seguido de `:61000`. São aceitas as redes `10.0.0.0/8`, `172.16.0.0/12` e `192.168.0.0/16`. O host valida se o endereço pertence a uma interface local.

Permita TCP 61000, TCP 61099 e UDP 8770–8777 no firewall para os PCs da sua rede. Gere o convite após iniciar os serviços. LAN usa HTTP e chat sem TLS; utilize uma rede confiável. Para jogar entre locais diferentes, escolha Tailscale ou HTTPS público.

## Público HTTPS

1. Tenha um IPv4 público alcançável para as partidas. Um servidor atrás de CGNAT precisa de uma solução que forneça esse acesso, como IP público contratado ou VPS; o launcher não abre portas no provedor.
2. Aponte seu domínio para o servidor. Obtenha um certificado TLS válido, com cadeia completa e chave privada PEM, para o domínio escolhido. Também é possível usar IP no endpoint se o certificado válido incluir esse IP.
3. Escolha **Público — HTTPS**. Informe somente a origem, como `https://jogo.seudominio.com:8443`, sem caminho, usuário ou senha. Informe separadamente o **IPv4 público das partidas**.
4. Selecione o certificado (`fullchain.pem`) e sua chave privada. A ativação verifica se o par é válido, se o certificado ainda não expirou e se corresponde ao endereço. Os clientes validam a cadeia de confiança TLS normalmente; não há opção de ignorar certificado inválido.
5. Encaminhe a porta TCP HTTPS escolhida ao mesmo número de porta do host. Encaminhe também UDP 8770–8777, conservando os números, ao host de jogo. Ajuste firewall e regras da VPS. As portas TCP 61000, 61001 e 61099 continuam locais nesse modo e não devem ser expostas pela configuração de rede.
6. Ative o servidor Google e gere um convite. O convidado entra com Google, cola o código e usa **Jogar Agora**, sem Tailscale.

O gateway HTTPS roda dentro do processo do Metagame. Se houver outro serviço usando a porta 443, use uma porta livre como 8443. No Linux, a porta 443 normalmente exige permissão específica; prefira uma porta alta para o processo. O gateway usa o certificado local selecionado, sem provisionamento ACME automático.

A ativação copia os PEM para `UndauntedMetagame/fenys/public-cert.pem` e `public-key.pem`. Preserve a chave privada e não a publique. Ao renovar o certificado, selecione o par renovado e reative o modo público, fora das partidas. A cópia não acompanha automaticamente alterações nos arquivos de origem.

## O que passa por HTTPS

A API do launcher, o login nativo do cliente, o backend do jogo e os saves usam HTTPS. O chat usa WebSocket sobre TLS (WSS). Como o cliente 1.4.4 espera HTTP, o launcher fornece uma ponte em uma porta livre de `127.0.0.1`; só o trecho dentro do PC fica em HTTP. A ponte recusa páginas de navegador, não segue redirecionamentos e encerra quando o processo do jogo termina ou o launcher fecha. A lista de URLs de QoS é ajustada para a porta local escolhida.

As partidas usam o protocolo UDP do jogo diretamente no IP anunciado. HTTPS não encapsula nem altera esse protocolo. Não existe túnel UDP, abertura automática de portas ou serviço de relay externo nesta versão.

O gateway impede administração, backups, criação de convites e uso da credencial de game server pela entrada pública. Esses comandos permanecem no loopback do dono. O gateway público não utiliza o `UndauntedGateway` opcional da base: é a integração `fenys-public-gateway.js`; mantenha o `GATEWAY_SECRET` do modo antigo desativado.

## Validação e limites

Os testes automatizados verificam transporte HTTPS, rejeição de certificado não confiável, bloqueio de rotas administrativas, corpo de requisições, chat WebSocket, QoS e restauração após falha na troca de rede. A integração inicia dois Metagames reais em cada modo (Tailscale, LAN e HTTPS) e confirma vínculo, save, transferência de UID/nível/inventário e recusa de escrita no host antigo. Identidade Google/broker e endereçamento/certificados são isolados nesse teste.

A partida com o cliente proprietário, o OAuth Google real, o encaminhamento de portas do seu roteador e a latência entre PCs continuam exigindo teste no ambiente real. O suporte de hospedagem do executável do jogo no Linux continua separado dessa mudança de rede; o launcher Linux pode conectar a um host remoto e iniciar o cliente por Wine experimental.
