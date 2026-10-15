# Hospedagem simplificada — Dauntless Launcher Ultimate

Objetivo: **ligar um servidor**, **receber amigos** e **permitir que outros administradores publiquem servidores**, mantendo saves locais protegidos.

## 1. Jogar sozinho

Abra **Hospedar servidor → Ligar e jogar → Iniciar meu servidor**, ou selecione o servidor local em **Escolher servidor**.

- Isso inicia somente Metagame e DeployServer. Não prova que o servidor nativo de Ramsgate/caçadas está funcionando: é preciso testar a partida.
- Não é necessário habilitar Google nem publicar um servidor para jogar localmente.
- Não recrie personagem, não substitua `account.key` e não apague `undaunted.db`.

## 2. Convidar um amigo de outra casa (exemplo: Ygor)

Em **Hospedar servidor → Convidar amigos ou abrir ao público**:

1. Primeiro ligue Metagame e DeployServer pelo launcher, e selecione **a conta administradora original** do servidor.
2. Selecione **Amigos de outras casas / servidor público**. Um servidor em rede local não atende pessoas em outras casas. Este modo ainda requer domínio HTTPS/certificado válido, IPv4 acessível (ou VPS) e UDP 8770–8777 encaminhadas.
3. Confirme o backup e, com todos fora do jogo, clique **Preparar acesso Google neste servidor**. A autorização Supabase existente é detectada automaticamente, quando possível, ou pode ser escolhida na configuração inicial. O botão só fica ativo depois das verificações obrigatórias.
4. Confirme que a rota Google responde e que o host foi registrado; depois conecte o personagem original ao Google, sem criar personagem novo.
5. Em **Compartilhar meu servidor**, escolha **Só quem eu convidar**, informe o nome e clique **Salvar servidor e compartilhar**.
6. Em **Convidar amigo**, digite o e-mail Google/usuário do amigo e clique **Enviar convite**. Ele entra em **Conta Google e convites**, aceita a notificação e seleciona o servidor em **Escolher servidor**.

O convite gerencia autorização do jogador, **não substitui um endereço público funcional**. O launcher não instala VPN, configura o roteador ou contrata uma VPS sozinho. Não publique a porta TCP 61001.

## 3. Criar um servidor público

A pessoa que hospeda faz a mesma preparação do passo 2, mas em **Compartilhar meu servidor → Quem pode entrar?**, escolhe **Público — aparecer na lista**. O host deve estar realmente acessível pela internet.

Pessoas com infraestrutura própria podem hospedar no próprio PC/VPS. Administradores de novos hosts precisam de autorização de host, obtida via **Avançado → Gerar autorização para outro servidor** por uma autoridade Google existente; **não compartilhe o arquivo `authorization.json` original**.

A versão atual **não oferece uma VPS, relay UDP ou configuração HTTPS automática**. Portanto publicar um host público com apenas um clique ainda depende de um serviço de acesso externo que não faz parte deste projeto.

## O que aparece na nova tela

- **1 • Meu servidor:** iniciar, desligar e conferir o estado real dos dois serviços.
- **2 • Jogar com outras pessoas:** selecionar rede local ou internet, preparar Google, compartilhar para convidados ou público e convidar.
- **Diagnóstico e arquivos:** recolhido; usar somente quando algo não funcionar.
- **Avançado • Outros anfitriões e backups:** reservado a quem administra o host.

A aba **Escolher servidor** é para jogadores: selecionar o servidor local ou escolher um servidor do catálogo. Eles não precisam ver certificados, chave de administrador ou configurações do Supabase.

## Problemas comuns

| Mensagem | Significado |
| --- | --- |
| `Unstubbed route GET /launcher/google/status` | Metagame ativo, mas integração Google não instalada/ativa; não vincule o personagem |
| Ativação Google desabilitada | Confira serviços iniciados pelo launcher, conta administradora original, autorização, IP e certificados conforme o modo |
| ServerStatus funciona, mas Ramsgate falha | O jogo nativo ainda exige teste de porta 8777, DLLs, RAM e logs |
| Servidor LAN não aparece na comunidade | Normal: a lista pública requer um host Google publicado e acessível externamente |
| Convite aceito, mas não conecta | Investigue HTTPS público e portas UDP, não crie outro personagem |

## Segurança

Nunca envie tokens de sessão, `account.key`, chaves privadas, `.env`, `authorization.json` ou segredos de hospedagem. Mantenha backup verificável do banco e do personagem antes de ativar e sincronizar o host. A integração e as caçadas em dois computadores precisam ser testadas na prática.

Diagnóstico avançado: [Ramsgate e Google](DIAGNOSTICO-RAMSGATE.md).
