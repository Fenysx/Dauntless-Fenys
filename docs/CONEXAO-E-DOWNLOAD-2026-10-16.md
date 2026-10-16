# Hospedagem privada, recuperação por key e instalação do jogo

## Fluxo visual (Dauntless Launcher Ultimate)

A aparência **vinho/preto** do launcher foi mantida. As capturas do Dauntless Revived foram utilizadas como referência de comportamento, não para copiar sua identidade visual.

### Servidor local / Hospedar

1. Em **Servidor local / Hospedar**, clique **Ligar meu servidor** para iniciar Metagame e DeployServer.
2. Para jogar em casas diferentes, instale e conecte o **Tailscale** nos dois computadores; compartilhe a máquina do anfitrião pelo painel do Tailscale e peça ao amigo para aceitar.
3. Clique em **Verificar Tailscale** e **Iniciar host privado**. O endereço \`100.x.y.z:61000\` deve ser detectado automaticamente.
4. Em **Convidar amigos ou publicar um servidor**, selecione o modo Tailscale, confirme a identidade administrativa e a integração Google do host. Gere o **convite de jogador DLU3**. Não entregue chaves administrativas.
5. No launcher do amigo, teste a API do host pelo endereço privado, entre no Google, cole o DLU3 e clique **Jogar agora**. As portas UDP da partida (8770–8777) precisam alcançar o anfitrião pela VPN.

**Importante:** o teste TCP 61000 e a confirmação de Google não comprovam que o jogo já se conecta à Ramsgate ou às caçadas; é obrigatório testar entre dois PCs.

### Recuperar personagem: duas opções

- **Google/Supabase:** método principal; confirme o vínculo no servidor de origem antes de migrações. Login não importa o save sozinho.
- **Key original:** em **Configurações → Recuperar personagem → Recuperar com key**, selecione o seu \`account.key\` ou \`.txt\`. O Metagame valida a identidade antes de registrar o arquivo para o servidor atual. A key é alternativa **quando o acesso ao jogo está operando em modo legado**; selecionar a key não substitui automaticamente um personagem que está ativo pelo Google. Use **Salvar backup da key** para gravar uma cópia privada, fora do repositório.

Não envie \`account.key\`, chaves administrativas, tokens Google, autorização Supabase nem chaves do Discord ao GitHub. Não remova \`undaunted.db\` e backups antes de validar um personagem em caçada real.

## Baixar ou reparar o Dauntless 1.4.4

O protocolo original do Dauntless Revived foi identificado dentro do código upstream incluído no projeto:

- **Manifesto:** \`http://<IP Tailscale>:61002/content/v1/manifest\` (sem senha).
- **Arquivos:** \`GET /content/v1/files/<caminho>\`.
- **Autenticação dos arquivos:** cabeçalho \`x-undaunted-user-api-key\` com a **key pessoal da conta já registrada**. O convite obtido pelo Discord permite **participar/registrar**, mas **não é a key pessoal** para baixar os arquivos.
- **Integridade:** o launcher inclui uma cópia fixa do manifesto original de **410 arquivos** do Dauntless 1.4.4, totalizando **10.893.512.875 bytes**. O manifesto recebido do host deve corresponder exatamente em \`build\`, tamanho, caminhos e SHA-256. Não aceitamos que o host determine sozinho quais arquivos podem ser executados.
- **Instalação:** em **Configurações → Instalação e reparo**, selecione uma pasta, digite a URL do manifesto e a key pessoal da conta desse host. O launcher verifica cada arquivo e preserva arquivos divergentes em \`.dlu-backup\` somente após baixar uma cópia íntegra. Os três binários críticos (EXE e DLLs) ainda passam pelos hashes fixados na inicialização.
- **Key privada:** não fica no GitHub nem em \`settings.json\`. É usada em memória somente durante o download e removida do campo da tela ao terminar.

Para usar a hospedagem própria como fonte de arquivos, o servidor anfitrião também precisa instalar/configurar/iniciar o serviço \`UndauntedContent\`, expor somente TCP **61002** para a rede Tailscale e apontar \`CONTENT_GAME_DIR\` para uma cópia legítima e verificada do cliente 1.4.4. **O botão Ligar meu servidor inicia Metagame e DeployServer; não provisiona automaticamente o servidor de conteúdo.**

Existe também um adaptador para hosts autorizados que forneçam manifesto alternativo JSON com \`version: "1.4.4"\`, \`files\` contendo \`path\`, \`size\` e \`sha256\`, e endpoints \`files/<path>\`. Nesse protocolo alternativo, o cabeçalho é \`X-Download-Key\`, se a fonte o exigir. Esse formato não está confirmado no Discord original e não deve ser confundido com a API real do Dauntless Revived.

O download só usa HTTPS ou HTTP no IPv4 Tailscale (\`100.64.0.0/10\`), não segue redirecionamentos e recusa caminhos inseguros. Ele não inicia o executável automaticamente nem contorna a autenticação do servidor.

**Ainda precisa de validação prática:** conectar à fonte de conteúdo real no Tailscale, confirmar key e permissões de acesso, baixar a árvore completa de 410 arquivos, executar a verificação e abrir uma caçada.

## Validação e limites

- \`npm test\` inclui testes de segurança do manifesto, transferência simulada, reparo e cópia de key no contrato IPC.
- \`npm run test:integration\` e testes de serviço precisam de variáveis/servidores reais para testar funcionalidades profundas.
- Em Windows, verificar o instalador, os botões, a gravação em disco e a criação de backup de chave.
- Em duas máquinas, testar o acesso Tailscale, TCP/UDP, Google, convite, criação de personagem novo, recuperação com key e persistência de inventário depois da caçada.
- Na nuvem, conferir diretamente Supabase, políticas RLS, duplicação, lease, revisões e restauração de personagem. **Nenhum teste local isolado substitui essas verificações**.


## Convite original do Discord: URL \`dauntless-revived://join\`

O Discord original envia um **convite de registro**, e não uma chave pessoal de download. O link público **v2** traz \`host\`, \`port\`, \`fp\` (fingerprint SHA-256 do certificado TLS), \`code\` de uso único e o nome do servidor. Esse link permite registrar **uma nova conta** no servidor escolhido; após o registro, o Metagame retorna uma chave \`UUK_…\`, que o launcher precisa manter protegida e usar para baixar arquivos do mesmo host. O convite **v1** é exclusivo para o Tailscale e pode trazer link de compartilhamento.

A aba **Escolher servidor → Convite do Dauntless Revived original** reconhece o formato v1/v2 e mostra apenas uma prévia sanitizada. **Essa implementação ainda não faz registro real, download de arquivo em servidor público, nem verifica a identidade TLS do servidor**. Nunca transmita a key ou o código de registro por HTTP para IP público; o protocolo correto exige uma conexão TLS cuja identidade seja conferida com \`fp\` **antes de enviar qualquer credencial ou requisição**. O fluxo público completo requer um transporte TLS pinado para cadastro e download, além de armazenamento criptografado da chave. Também exige um relay de jogo pinado (o jogo 1.4.4 fala HTTP local).

Não exponha códigos de registro de uso único no GitHub, logs ou chats. Se forem publicados, use um convite novo concedido pelo administrador. O modo Tailscale continua preferencial para hospedar o **servidor local próprio**; \`mode=public\` de um servidor comunitário é uma rota de entrada independente e **não requer Tailscale**.
