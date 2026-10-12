# Dauntless Fenys Classic — 1.0.3 Beta (prévia de conexão)

Launcher comunitário para Dauntless Revived 1.4.4 no Windows. Esta branch preserva o visual Classic 1.0 e mantém o instalador original v1.0.0 inalterado.

**Estado do projeto:** os recursos de geração de convites e conexão por código estão implementados no código-fonte, mas exigem teste real no Windows, e **a sincronização de personagens entre Metagames independentes NÃO está implementada**. Portanto a função não permite ainda que dois amigos troquem de servidores independentes mantendo o mesmo personagem automaticamente.

## Telas
- **Visão geral:** serviços locais, botão Jogar Agora e servidor selecionado.
- **Central do servidor:** inicia e encerra apenas os processos Node pertencentes ao launcher; não reinicia servidores externos.
- **Convites:** valida `INVITECODE` no Metagame local, verifica acesso Tailscale, pede autorização admin, cria convite e empacota endereço + convite no código `FENYS1.…`.
- **Conectar a um servidor:** lê o código, consulta `ServerStatus`, exige que `account.key` já seja reconhecida pelo Metagame de destino e então salva o destino de Jogar Agora. Não cria contas vazias em silêncio.
- **Atividade:** consulta periodicamente a lista de jogadores online e mostra avisos quando a API registra entradas.
- **Versão:** mostra a versão instalada do launcher no topo e na lateral.

## Requisitos
- Windows e Node.js recente (22+), npm.
- Cópia configurada de `dauntless-revived` com Metagame e DeployServer compilados.
- Conta Dauntless Revived com chave `account.key` própria.
- Para conectar outros PCs: Tailscale configurado, Metagame escutando no IP Tailscale do host, regra de firewall/ACL privada permitida para a porta 61000.
- **Não expor a porta 61000 à internet pública nem a 61001 ao Tailscale.**

## Testar o código-fonte

```bash
npm ci
npm test
npm start
```

Instalador de teste Windows: `npm run build:win`. Não substitua o instalador estável antes de testar esta versão em ambiente de desenvolvimento.

## Progresso único em todos os servidores

O banco do Metagame guarda contas, progresso, inventários e personagens localmente. O código do convite não transfere esses dados. Para viabilizar personagem único em vários servidores independentes será preciso backend central autoritativo, compatibilidade de identidade entre instâncias, preservação dos dados e proteção contra gravações concorrentes. **Esse passo não foi feito e não há sincronização automática.**

Veja **[Conexão entre servidores e limitações](docs/CONEXAO-ENTRE-SERVIDORES.md)** antes de usar.

## Licença

Projeto comunitário independente; não distribui jogo, arquivos proprietários ou chaves. Consulte `LICENSE.txt` e `NOTICE.md`. Não publique `.env`, `account.key`, bancos de dados ou backups.