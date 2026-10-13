# Hospedar sem complicação — Dauntless Launcher Ultimate

O launcher agora separa **Jogar** de **Hospedar servidor**. Não é necessário entender Supabase, Tailscale ou certificados para iniciar o jogo **localmente**.

## Quero apenas jogar neste PC

1. Abra **Escolher servidor → Servidor local**.
2. Na **Visão geral**, clique em **Iniciar serviços** (se necessário), depois **Jogar agora**.
3. A conta Google não é obrigatória para jogar no modo local antigo. **Não crie novo personagem** para tentar corrigir uma conexão.

## Quero hospedar para outras pessoas

Abra **Hospedar servidor** e siga os três passos mostrados na tela.

**1. Preparar este PC**

- Clique em **Iniciar servidor**. O Metagame e o DeployServer precisam responder localmente.
- Para vincular o progresso Google, selecione a **chave administradora original** do host, apenas neste PC. A chave nunca deve ser enviada ao GitHub ou aos amigos.
- **Verificar instalação** é somente leitura, e analisa a configuração, RAM e DLLs. Metagame e DeployServer online **não comprovam** que Ramsgate abriu a porta UDP 8777 ou que uma caçada terminou.

**2. Integrar personagens ao Google (antes de transferir saves)**

- Comece em **Neste PC / rede local**. O launcher sugere automaticamente um dos IPv4 LAN válidos.
- Selecione a **autorização Supabase** original na seção recolhida *Autorização inicial do servidor* ou o código autorizado recebido de outro host. Não recrie o projeto nem as credenciais de criptografia se elas já existem.
- Deixe todos fora do jogo, confira os backups e só então clique **Ativar integração Google neste servidor**.
- O assistente consulta a resposta real de `/launcher/google/status`: uma configuração gravada em disco não basta. Se aparecer *integração pendente*, **não vincule o personagem**. Se a rota estiver ausente (`Unstubbed route`), confira a instalação/compilação do Metagame e o diagnóstico. 
- Depois de confirmar a integração no **servidor de origem**, vincule o personagem **antigo**, mantendo seu `account.key` e seu banco de dados intactos. Só teste o novo host após um backup e vínculo confirmado.

**3. Publicar para amigos de outras redes**

- Uma LAN só funciona na mesma rede: **não aparece no catálogo público**.
- Se os amigos estiverem fora da sua rede, configure **Internet / HTTPS** com um domínio e certificado válido, um **IPv4 público alcançável ou VPS** e as portas **UDP 8770–8777** encaminhadas. A administração TCP **61001 não deve ser exposta**.
- Se estiver sob CGNAT sem acesso de entrada, a opção mais simples poderá ser hospedar em **VPS**. O launcher **não cria uma VPS ou configura o roteador automaticamente**.
- Após a integração Google estar **ativa**, o host ter modo **HTTPS público** e o dono estar **conectado ao Google**, o botão **Publicar meu servidor** fica visível. Convites aparecem somente após o servidor ser publicado e confirmado na lista de servidores próprios.
- Na aba **Conta Google e convites**, os jogadores entram com Google e aceitam seus convites. O mesmo progresso entre servidores ainda exige validação com dois PCs e restaurar um save de teste.

## Mensagens comuns

| Mensagem | O que significa |
|---|---|
| `Unstubbed route GET /launcher/google/status` | O Metagame local não expõe a rota Google; **não está pronto para integração** |
| `POST /launcher/google/sync-now` falha | Não force o backup cloud: primeiro conclua a ativação do host |
| `Game server on port 8777 exited before listening` | O processo nativo caiu antes de aceitar jogadores; verifique RAM, DLLs e logs. Não conclua que é Google/Supabase |
| "Ative primeiro o servidor Google no modo Público" | O host ainda não confirmou conexão HTTPS pública; a publicação fica indisponível até isso estar pronto |
| "Nome de usuário inválido" | Use nome de 3 a 20 letras, números ou `_`, ou um endereço de e-mail Google válido |

## Segurança

- Nunca substitua silenciosamente `account.key`, saves ou as chaves do administrador.
- Não exponha `.env`, `rclone.conf`, chaves privadas, certificados privados e tokens.
- Faça um backup verificado e um teste de restauração antes de modificar qualquer integração de personagem.
- O assistente mostra estados verificados, **não configura acesso de internet automaticamente** nem comprova multiplayer real até o teste fora da LAN.

Diagnóstico aprofundado: [Ramsgate e Google](DIAGNOSTICO-RAMSGATE.md).
