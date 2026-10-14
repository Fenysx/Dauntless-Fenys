# Instalação — Dauntless Launcher Ultimate

> Versão beta: não considere o projeto pronto para uso público antes de testar o login Google real, os saves do personagem e as partidas em dois PCs.

## Requisitos

- Windows para executar o cliente 1.4.4; Linux/Wine ainda é experimental.
- Arquivos compatíveis do **Dauntless 1.4.4** obtidos legitimamente, incluindo binários e DLLs exigidos pelo cliente. Os arquivos proprietários não fazem parte do instalador do launcher.
- Para hospedar: Metagame, DeployServer, Node.js **24** e configuração válida de banco e `.env`. Consulte os guias da base em `server/upstream/docs`.

## Baixar e executar o projeto para desenvolvimento

Em uma instalação própria com Git e Node.js 24:

```bash
git clone https://github.com/Fenysx/Dauntless-Fenys.git
cd Dauntless-Fenys
npm ci
npm test
npm start
```

O repositório está privado enquanto preparamos a publicação; uma conta autorizada é necessária para cloná-lo.

## Preparar servidor local

Na raiz do projeto, execute `npm run server:prepare` **somente em uma instalação de desenvolvimento**. O comando gera uma cópia da base em `runtime/server`, instala dependências e compila os serviços. Ele recusa sobrescrever uma pasta de execução existente.

Configure Metagame e DeployServer nesse destino conforme [Operação e diagnóstico](OPERACAO.md); especialmente `.env`, caminho do banco SQLite, chaves de host/game server e binários do cliente necessários para cidade/caçada. Para diagnosticar sem modificar saves, execute `npm run doctor` e consulte a saída.

Se optar pelo instalador beta do launcher, lembre que ele **não** instala o jogo nem todo o servidor automaticamente. Selecione a pasta do servidor em **Hospedar servidor → Arquivos e diagnóstico (avançado)** e o executável em **Configurações**.

## Usar com o personagem atual

Para jogar sozinho, escolha **Servidor local** e inicie os serviços. Para continuar com o mesmo personagem no Google, ative o Google no **servidor que possui o save original**, entre com sua conta Google e use **Vincular meu personagem atual ao Google**. Confirme que a nuvem mostra o personagem antes de trocar de servidor.

Não apague `undaunted.db`, `account.key` ou backups antes de confirmar o vínculo, a revisão do save e uma caçada salva. Se a integração Google não responder, não crie uma conta substituta. Veja [Guia do launcher](GUIA-LAUNCHER.md).

## Servidores da comunidade

Para participar de um servidor publicado, o jogador usa Google e o catálogo/convites do sino. Para hospedar pela internet, configure HTTPS público e conectividade UDP com [Redes](REDES.md) e [Comunidade](COMUNIDADE.md). O processo precisa permanecer ativo no computador do host.

## Testes e distribuição

Execute `npm test` e `npm run test:integration` em um checkout descartável, com Node.js 24. Os testes de integração preparam duas instâncias do Metagame e podem alterar a pasta de teste. Não aponte para o banco de produção.

O GitHub Actions ainda precisa voltar a executar os jobs antes de publicar outra beta. O sucesso de testes estáticos isolados não equivale a um instalador validado nem a uma partida real.
