# Hospedar Dauntless com amigos pelo Tailscale — beta.14

O modo **Servidor privado • Tailscale** utiliza a infraestrutura Metagame e DeployServer existente, com Tailscale como rede privada. Não precisa abrir portas no roteador nem ter IPv4 público. Os dois computadores precisam de Tailscale instalado e autenticado.

**O que o botão faz:** detecta a VPN pelo comando local `tailscale status --json`, confirma que o endereço Tailscale corresponde à interface do Windows, inicia os serviços locais por meio do launcher e mostra o IP privado `100.x.x.x:61000`. Não autentica no Tailscale por você, não modifica firewall e não altera saves.

## No PC que hospeda

1. Instale [Tailscale no Windows](https://tailscale.com/download/windows), abra e entre na sua conta.
2. No launcher, acesse **Hospedar servidor → Servidor privado • Tailscale → Verificar Tailscale**. Se disser desconectado, abra o app Tailscale e entre na sua conta.
3. Clique em **Iniciar host privado**. O launcher tentará iniciar **Metagame TCP 61000** e **DeployServer TCP 61001**. Caso falhe, abra **Diagnóstico e arquivos do servidor**; confira `dist/server.js`, `.env`, Node.js e a instalação.
4. Se ainda não estiver integrado, abra **Convidar amigos ou publicar um servidor** (o painel abrirá automaticamente), confirme **Amigos em outra casa (Tailscale privado)**, selecione a conta administradora original e a autorização Google/Supabase, e escolha **Preparar acesso Google neste servidor**. **Faça backup de `C:\\dr\\data\\undaunted.db` e encerre todas as partidas antes de ativar ou atualizar esse módulo.** O launcher precisa reconfigurar os serviços e preservar o personagem original.
5. Depois de ativar, confirme status Google e clique **Gerar convite de jogador**. Um convite `DLU3.` é temporário (cerca de 15 minutos) e não dá acesso administrativo.
6. Clique **Compartilhar PC no Tailscale**. No painel oficial, escolha este computador e compartilhe o dispositivo com a conta Tailscale do seu amigo; opcionalmente cole o link no launcher para incluir nas instruções. Esse link dá acesso de rede ao dispositivo: envie somente à pessoa certa.

## No PC do amigo

1. Instale o Tailscale, faça login e **aceite o compartilhamento** deste computador; estar logado apenas no próprio Tailscale não significa acesso automático ao host.
2. Com o servidor compartilhado alcançável pela VPN, abra o Dauntless Launcher Ultimate → **Conta Google e convites** e entre com Google.
3. Em **Escolher servidor → Entrar no servidor de um amigo**, cole o código **DLU3**, confirme a conta/personagem (não crie um personagem novo se já existe um antigo) e entre.
4. Antes do convite, abra **Escolher servidor → Testar o servidor Tailscale do amigo**. Digite o IP privado `100.x.x.x:61000` do anfitrião e clique **Testar conexão Tailscale**. O teste confere que o Tailscale do convidado está conectado, que a porta TCP 61000 responde e que a rota Google está registrada — sem enviar senha, chave administrativa ou personagem.
5. Se as verificações passarem, entre usando o código DLU3 e clique **Jogar agora**. Esse diagnóstico **não testa as portas UDP de Ramsgate/caçadas**: valide a partida real com dois PCs.

## Conexão e segurança

- **Tailscale e Google fazem coisas diferentes:** Tailscale transporta a rede privada; Google e Supabase validam o personagem e o progresso. O modo Tailscale não requer publicar no catálogo público.
- **Firewall do Windows:** pode precisar permitir tráfego de entrada pela interface Tailscale para TCP **61000**, chat TCP **61099** e UDP **8770–8777**, conforme versão/configuração do servidor. Configure somente para a interface/rede privada, nunca publique portas administrativas TCP **61001** na internet. O launcher **não cria regras automaticamente**; o teste de conexão do convidado ajuda a detectar bloqueio de TCP 61000.
- **CGNAT:** normalmente não impede o transporte Tailscale; o desempenho depende da conectividade direta/relay do Tailscale.
- **Acesso externo:** verificar que Metagame e DeployServer responderam localmente **não prova** que o outro PC consegue acessar a partida. Teste de verdade duas máquinas, a entrada, a Ramsgate, uma caçada e a persistência dos itens.
- **Segredos:** não publique `.env`, `*.key`, `google-host.json`, autorização Supabase ou a chave administrativa. O link Tailscale só deve ir para o amigo autorizado, e o código DLU3 tem prazo.
- **Troca de host:** encerre o jogo e confirme a sincronização Google antes de trocar de servidor para evitar conflitos de revisão.

O launcher **não faz instalação silenciosa do Tailscale nem configura regras automáticas no roteador/firewall**. Os botões de download/compartilhamento abrem páginas oficiais. A integração completa só é considerada funcional após testar a partida real entre dois computadores.
