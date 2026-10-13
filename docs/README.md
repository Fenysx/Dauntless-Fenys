# Documentação do projeto

Leia nesta ordem se estiver começando:

1. [Arquitetura e fluxo](ARQUITETURA.md): a função do launcher, Metagame, DeployServer, jogo e nuvem.
2. [Instalação do zero](INSTALACAO.md): baixar, compilar, configurar o host e conectar jogadores.
3. [Nuvem independente](NUVEM.md): banco, função, Google e autorização do primeiro servidor.
4. [Uso do launcher](GUIA-LAUNCHER.md): telas, convites, vínculo de personagem, recuperação e modo legado.
5. [Desenvolvimento e verificação](DESENVOLVIMENTO.md): onde alterar, testes, instaladores e atualização da base.
6. [Diagnóstico e operação](OPERACAO.md): portas, backups, falhas e recuperação.

Consulte também [Redes: Tailscale, LAN e público HTTPS](REDES.md). Tailscale é opcional no modo Google. A documentação original em `server/upstream/docs` também inclui gateway público, bot, frota e outras opções que **não são pré-requisitos** desse modo. Ela registra etapas históricas: para hashes de DLL, use os valores aceitos por `src/main.js`, não um hash antigo de uma página da base.
