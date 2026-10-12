# Fenys Classic — Conexão entre servidores (prévia técnica)

Esta implementação é experimental. Preserva o launcher Classic e não modifica o banco do Metagame, inventários, contas ou personagens.

## Como funciona o código

1. O dono do servidor inicia o Metagame e o Tailscale e confirma que o servidor responde no seu endereço privado Tailscale, por exemplo `100.x.y.z:61000`.
2. Na aba **Convites**, o dono informa esse endereço e solicita a geração. O Fenys chama `CreateInvite` no Metagame local (com `account.key` de administrador).
3. O resultado tem formato `FENYS1.<dados>.<checksum>`. Ele inclui **endereço privado do Metagame e código de convite upstream**; não inclui chaves de conta nem de administrador. O checksum é só para erros de cópia; não autentica o anfitrião.
4. O amigo abre **Conectar a um servidor** e cola o código. O Fenys verifica `ServerStatus` e se a sua própria `account.key` é reconhecida por `GetUserInfo` **no servidor de destino**.
5. Somente depois dessas verificações o destino de **Jogar Agora** é alterado. Para um servidor remoto o launcher não inicia os serviços locais.
6. O Fenys consulta `ServerStatus` a cada ~15 s para mostrar entradas reconhecidas pelo Metagame; a presença do jogo tem janela de aproximadamente 90 s, logo o status não é instantâneo.

## Limitação essencial: convite NÃO é login nem sincronização de progresso

No Dauntless Revived, `CreateInvite` gera um código usado pelo `Register` para **criar uma conta nova naquele Metagame**. Ele não é um código universal de conexão ou de transferência de personagem.

A chave `account.key` autentica somente onde a conta existe. Em dois Metagames com bancos diferentes, o mesmo código de convite NÃO faz o outro Metagame reconhecer automaticamente a conta, o personagem ou o inventário original.

Por isso, esta prévia **não chama `Register` automaticamente** nem consome o convite, e recusa selecionar outro servidor caso a chave atual não exista lá. O código compartilhado transporta o endereço e o convite upstream para a etapa futura; ele não é uma garantia de acesso automático a uma conta existente.

Para cumprir o requisito de **um personagem e progressão únicos em servidores independentes**, ainda é preciso projetar e implementar **uma autoridade central para identidade e saves**, utilizada por todos os Metagames participantes, com protocolos autenticados, controle de versão, backups, autorização e prevenção de conflitos de gravação. Não sincronize ou copie bases SQLite ativas pela rede: isso pode corromper dados ou perder progresso. A opção de usar um único Metagame compartilhado para dados deve ser avaliada em conjunto com a topologia e as regras de matchmaking do Dauntless Revived.

## Pré-requisitos de rede e segurança

- O Tailscale precisa estar conectado nos computadores e as regras de ACL devem permitir acesso à porta 61000 do anfitrião.
- O Metagame atualmente pode estar escutando só em `127.0.0.1`, como no exemplo local. Nesse caso o convidado **não poderá acessá-lo pela rede**: será necessário configurar o listener no IP da interface Tailscale. Não exponha a porta publicamente.
- Nunca compartilhar `account.key`, chaves de administrador, `.env` ou arquivos do banco.
- A porta 61001 do DeployServer deve continuar local ao host, conforme a documentação do upstream.
- A validação de endereço do launcher só permite localhost para conexão local e IPs privados da faixa Tailscale ou nomes `*.ts.net` para conexão remota.
- Para testar sem afetar progresso real, use primeiro contas e saves de testes e faça cópias de segurança.

Documentação do Metagame: https://mixutin.github.io/dauntless-revived/reference/api.html
Documentação dos dados: https://mixutin.github.io/dauntless-revived/reference/files.html
