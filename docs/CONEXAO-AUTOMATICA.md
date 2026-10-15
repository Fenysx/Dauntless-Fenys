# Conexão automática — beta.7

O launcher oferece **Detecção automática** em **Hospedar servidor** e **Entrar no jogo**. A detecção é feita no computador em que o botão é pressionado, sem transferência de chaves, arquivos de personagem ou segredos para o Supabase.

## O que funciona agora

- Identifica interfaces IPv4 privadas (Wi-Fi e Ethernet com prioridade sobre adaptadores virtuais) e preenche o IPv4 local do anfitrião.
- Solicita ao serviço STUN público `stun.l.google.com:19302` o IPv4 de saída, quando UDP/DNS estiverem disponíveis. Esse endereço **não prova acesso ao servidor**.
- Se o anfitrião escolher o modo público, sugere o IPv4 de saída no campo avançado das partidas. O nome HTTPS/certificado **não é inventado nem preenchido**.
- A opção do jogador **Detectar conexão automaticamente** faz o mesmo diagnóstico local e atualiza o catálogo do Supabase com a conta Google existente. **O jogador não digita IP e o anfitrião não precisa saber o IP do amigo**.
- **Limpar preferências antigas de conexão** cria cópia local de `settings.json` e remove apenas campos de redes antigas reconhecidos; preserva a identidade do host Google, saves, `account.key`, chaves admin, personagens e configuração cloud. Não desconecta automaticamente um host ativo.
- Os testes das telas impedem que botões de publicação sejam liberados só porque um IP público foi descoberto; precisa validar host Google com HTTPS e partidas.

## O que ainda exige infraestrutura externa

A operação UDP nativa do Dauntless Revived utiliza portas da família **8770–8777**. Para um amigo jogar fora do Wi-Fi local há duas partes distintas:

1. **API HTTP(S)** do Metagame, com endpoint HTTPS acessível e identidade Google corretamente registrada.
2. **UDP das partidas**, com IPv4 público encaminhado ou um *relay/túnel UDP* compatível.

Descobrir IP via STUN **não perfura a rede sozinho**. Provedores com CGNAT podem impedir entrada direta. Não publique TCP 61001 (porta administrativa), não abra o Metagame sem autenticação e não exponha certificados/chaves no GitHub.

Cloudflare Tunnel publica HTTP(S), mas não resolve acesso UDP de qualquer cliente de jogo sem componente adicional. Serviços como playit.gg suportam tunelamento TCP/UDP, mas suas ofertas de UDP genérico, HTTPS e múltiplas portas podem exigir plano premium, instalação de agente, reivindicação de conta e configuração inicial. Nada disso está provisionado nesta beta.7.

**Portanto não declare “pronto para a internet” nem “amigo conectado” sem teste real de HTTPS, UDP e jogo em dois PCs diferentes.**

## Como testar

1. No PC anfitrião, abra **Hospedar servidor → Detectar e preencher minha rede automaticamente**; veja a confirmação do IP local.
2. Para jogar local, selecione LAN. Para testar acesso externo, selecione Internet e execute novamente a detecção; ela sugerirá o IPv4 de saída, se disponível, mas **não liberará** a ativação sem HTTPS/certificado e outros pré-requisitos.
3. Com ambos fora do jogo, inicie Metagame e DeployServer no launcher; execute diagnóstico e integre Google somente com a chave admin original e autorização legítima do host. Preserve o banco local.
4. No PC do amigo, abra **Entrar no jogo → Detectar conexão automaticamente**, faça login Google, aceite o convite e selecione o servidor no catálogo.
5. Confirme a partida real em Ramsgate e em uma caçada no PC de cada jogador. Se falhar, colete diagnóstico sem compartilhar senhas ou chaves.

## Segurança e compatibilidade

A limpeza não apaga bancos, não gira chaves, não altera tabelas Supabase, não instala VPN, não modifica firewall nem abre portas UPnP silenciosamente. Os dados de rede detectados são utilizados apenas na interface deste PC; a consulta STUN para IP de saída é uma requisição de descoberta UDP para o provedor STUN.

Por enquanto, o modo público continua uma configuração avançada. Um relay UDP com provisionamento remoto exigirá infraestrutura e credenciais próprias, com consentimento do dono.
