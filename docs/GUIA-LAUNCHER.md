# Guia do Dauntless Launcher Ultimate — interface atual

> Projeto em beta. Esta documentação descreve as telas efetivamente presentes no launcher após a limpeza de outubro de 2026, não fluxos históricos de versões anteriores.

## As telas principais

- **Visão geral:** status do Metagame, DeployServer, Jogar Agora e atalhos locais.
- **Escolher servidor:** **Servidor local** e **Servidores da comunidade**. A lista da comunidade usa conta Google e mostra apenas servidores disponíveis no catálogo ou autorizados para a conta.
- **Hospedar servidor:** assistente em três passos: iniciar serviços locais, integrar personagens com Google e, opcionalmente, escolher LAN, Tailscale privado ou HTTPS público.
- **Conta Google e convites:** login pelo navegador, consulta e vínculo do personagem antigo, sino de convites, aceitar/recusar convite e nome de usuário.
- **Configurações:** selecionar o executável do jogo e, em **Recuperação de conta antiga**, apontar uma chave de jogador somente quando for necessário migrar um personagem existente.
- **Atividades:** mensagens do launcher e diagnóstico da sessão.

## Jogar sozinho

1. Prepare o servidor local conforme [Instalação](INSTALACAO.md). O launcher não instala automaticamente os arquivos proprietários do jogo.
2. Em **Escolher servidor**, selecione **Servidor local**.
3. Abra **Hospedar servidor** para iniciar Metagame e DeployServer deste PC, se ainda não estiverem rodando.
4. Selecione o executável do cliente em **Configurações** e escolha **Jogar Agora**.

Os indicadores de portas 61000 e 61001 online **não garantem** que Ramsgate ou as caçadas estejam funcionando. Faça ao menos um teste real de partida.

## Recuperar o personagem antigo no Google

1. Faça backup do banco local (por exemplo `undaunted.db`) e da sua chave original **fora do repositório Git**. Não envie essas credenciais para terceiros.
2. Inicie o servidor de origem e configure a integração Google em **Hospedar servidor** com a chave de administrador do próprio Metagame.
3. A ativação só é confirmada depois que o Metagame reiniciado responde que o host Google está registrado.
4. Faça login em **Conta Google e convites** e escolha **Vincular meu personagem atual ao Google**. O programa verifica a chave antiga e a identidade da conta no servidor de origem antes do envio.
5. Use **Conferir personagem na nuvem**; confirme o nome, o UID e a revisão do save antes de formatar ou mudar de servidor.

**Importante:** entrar com Google não transfere sozinho o personagem. A vinculação real e a recuperação depois de uma caçada ainda requerem teste prático; não crie um segundo personagem se o primeiro já existe.

## Entrar na comunidade

Entre com Google, abra **Servidores da comunidade** e selecione um host autorizado. Para servidores privados, aceite primeiro o convite no sino. A conta Google identifica o personagem; cada servidor continua responsável por validar permissões e executar o jogo.

## Hospedar para amigos

O modo **Neste PC / rede local** atende a LAN. O modo **Tailscale privado** atende amigos em redes diferentes sem port forwarding, desde que todos usem Tailscale e o host seja compartilhado. Para o catálogo público sem VPN, **Internet / HTTPS** requer domínio/certificado válido, IPv4 público alcançável ou VPS e portas UDP da partida. Antes de ativar, ambos os serviços locais precisam estar online. Leia [Redes](REDES.md) e [Comunidade](COMUNIDADE.md).

## O que foi retirado da interface

Não há mais assistente de instalação do Tailscale, cadastro clássico por chave de convidado, painel de autoridade global antiga, entrada manual por código legado, painel manual de IP nem categorias VIP para convites novos. Isso simplifica o produto e impede que o usuário misture modelos de personagem diferentes. A **recuperação de conta antiga** permanece porque é necessária para migrar saves existentes. Consulte [Limpeza e motivos](LIMPEZA-2026-10-14.md).
