# Base do servidor

`upstream/` é uma cópia integral da árvore Git do Dauntless Revived no commit **29477558148a9db66cd1134a5c3df8bea7f9bea5**. Origem e árvore estão em [upstream.lock.json](upstream.lock.json). Licença e créditos permanecem nos locais originais.

| Diretório da base | Papel no projeto |
|---|---|
| UndauntedMetagame | Contas, progresso, inventário, grupos, chat e matchmaking; utilizado |
| UndauntedDeployServer | Aloca e supervisiona os processos de partida; utilizado |
| UndauntedInternalServer | DLL C++/SDK que adapta o executável 1.4.4; utilizado |
| UndauntedContent | Dados e ferramentas de conteúdo da base |
| UndauntedLauncher | Launcher original e binários de integração; nosso launcher está em `src/` na raiz do projeto |
| UndauntedGateway | Gateway do modo público original; não usado no fluxo Tailscale atual |
| UndauntedDiscordBot | Bot opcional da base; não configurado pelo nosso launcher |
| deploy, tools, friend-kit | Ferramentas de implantação e operação originais |
| docs, brand, client-mods | Documentação, identidade visual e mods opcionais da base |

Não edite esta pasta para configurar uma instalação. Execute `npm run server:prepare` na raiz: a cópia de trabalho ficará em `runtime/server`. As integrações de `src/fenys-*-setup.js` modificam essa cópia, mantêm backups e compilam o Metagame. Os arquivos de configuração e dados gerados não fazem parte da base preservada.

A importação usa `git read-tree` sobre o commit fixado e confere a árvore `d079e39ae8f654623dd4fbc3320d04c6fd92a132`. Ela não copia a instalação de um jogador nem os dados locais usados nos testes. Os workflows existentes dentro de `upstream/.github` são arquivos da base; o GitHub só executa os workflows da raiz do nosso repositório.
