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

Em **Configurações → Instalação e reparo**, selecione uma pasta local e informe **uma URL de manifesto do seu host autorizado**. Se o host exigir chave de download, cole a chave obtida por meio do canal legítimo da comunidade somente nessa tela. O launcher envia o cabeçalho \`X-Download-Key\` ao **mesmo host de origem**, não grava a chave no disco nem a acrescenta ao histórico.

**Atenção:** a key do Discord não é uma URL. Para ativar uma fonte específica é necessário confirmar com o administrador qual endpoint entrega o manifesto e como a key deve ser enviada. Não pressupomos que o protocolo atual do Dauntless Revived seja exatamente igual a este novo adaptador; a compatibilidade real com aquele host ainda precisa ser testada. O projeto não distribui o cliente proprietário.

Formato esperado de resposta JSON do host:

\`\`\`json
{
  "version": "1.4.4",
  "files": [
    {
      "path": "Archon/Binaries/Win64/arquivo-exemplo.dat",
      "size": 123,
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    }
  ]
}
\`\`\`

O programa busca cada arquivo relativo à pasta do manifesto em \`files/<caminho URL-encoded>\`. São permitidas fontes HTTPS ou HTTP exclusivamente em IPv4 Tailscale (\`100.64.0.0/10\`). Redirects externos, caminhos \`..\`, links simbólicos e arquivos sem hash SHA-256 válido são recusados. Arquivos saudáveis são reaproveitados; arquivos divergentes são substituídos **somente após conferir hash e tamanho** e o original é preservado com \`.dlu-backup\`. O download não executa binários por conta própria.

Além dos hashes que o host fornece para cada arquivo, os três binários críticos do cliente (executável, \`dxgi.dll\`, \`UndauntedInternalServer.dll\`) precisam coincidir com os **hashes fixados** no código do launcher. Se isso acontecer, o executável é selecionado automaticamente. A opção **Verificar jogo instalado** confere estes três binários; não a árvore completa de 406 arquivos, a menos que o download seja executado contra o manifesto integral.

## Validação e limites

- \`npm test\` inclui testes de segurança do manifesto, transferência simulada, reparo e cópia de key no contrato IPC.
- \`npm run test:integration\` e testes de serviço precisam de variáveis/servidores reais para testar funcionalidades profundas.
- Em Windows, verificar o instalador, os botões, a gravação em disco e a criação de backup de chave.
- Em duas máquinas, testar o acesso Tailscale, TCP/UDP, Google, convite, criação de personagem novo, recuperação com key e persistência de inventário depois da caçada.
- Na nuvem, conferir diretamente Supabase, políticas RLS, duplicação, lease, revisões e restauração de personagem. **Nenhum teste local isolado substitui essas verificações**.
