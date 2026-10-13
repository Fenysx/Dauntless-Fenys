# Desenvolvimento e verificação

## Onde alterar

| Mudança | Arquivos principais |
|---|---|
| Tela e comportamento dos botões | `src/index.html`, `src/style.css`, `src/renderer.js` |
| IPC e integração com o sistema | `src/preload.js`, `src/main.js` |
| Execução Windows/Wine | `src/fenys-game-runtime.js` |
| Endereços, gateway e ponte pública | `src/fenys-network.js`, `src/fenys-public-gateway.js`, `src/fenys-public-relay.js` |
| Tailscale | `src/fenys-tailscale.js` |
| Login e sessão Google | `src/fenys-google-auth.js`, `src/fenys-google-player.js` |
| Protocolo e persistência pessoal | `src/fenys-google-cloud.js`, `src/fenys-google-host.js` |
| Instalação dos ajustes no Metagame | `src/fenys-server-setup.js`, `src/fenys-host-setup.js`, `src/fenys-google-setup.js` |
| Banco/API da nuvem | `supabase/google-players.sql`, `supabase/functions/fenys-global/players.ts` |
| Rede global anterior | `src/fenys-cloud-*`, `src/fenys-supabase.js` |
| Regras nativas do backend | Base em `server/upstream/UndauntedMetagame/src`; desenvolva numa cópia e registre o patch |

Os nomes internos `fenys-*` são identificadores históricos do código, não nomes de conta dos jogadores. O produto exibido é Dauntless Launcher Ultimate.

## Preservar a base e os dados

Mantenha `server/upstream` como referência íntegra. Configure e execute em `runtime/server`. As rotinas `*-setup.js` aplicam ajustes a arquivos conhecidos, fazem backup e recompilam. Se o formato da base não for reconhecido, investigue a incompatibilidade em vez de remover a validação.

Não versione `.env`, bancos SQLite, chaves, snapshots, autorizações ou arquivos de jogo. `runtime/` é ignorado por inteiro. Um diretório externo escolhido por você precisa da mesma proteção. Antes de enviar alterações, revise `git diff --cached` e `git status`.

## Testes

Na raiz:

```bash
npm test
```

A versão 1.7.0-beta.1 possui 78 testes unitários, incluindo transporte HTTPS/WSS, política de rotas públicas e restauração após falha na troca de rede. O workflow principal os executa em Windows e Ubuntu. Eles cobrem protocolos, convites, cancelamento/login, sessões, snapshots, proteção de arquivos, configuração e runtime do jogo.

Para testar a integração em um **checkout limpo**:

```bash
npm run test:integration
```

O comando copia a base incluída para `test-upstream`, instala as dependências do Metagame e DeployServer, compila o DeployServer e roda:

| Script | O que verifica |
|---|---|
| `integration-connection.cjs` | Conta e convite no Metagame real |
| `integration-host.cjs` | Instalação do overlay e API do host real |
| `integration-cloud.cjs` | Rede global antiga com dois hosts |
| `integration-google.cjs` | Dois Metagames, identidade/broker isolados, UID e progresso entre hosts |

`test-upstream` é descartável, mas o comando recusa uma pasta já existente para não confundi-la com uma instalação. Use outra cópia do repositório para repetir toda a preparação; ou, conhecendo os dados existentes, rode os scripts individuais sobre um fixture descartável. Os testes podem aplicar overlays ao fixture. Nunca aponte `METAGAME_TEST_DIR` para produção.

O runner também repete a integração Google nos modos LAN e público, neste último com HTTPS real e certificados de teste explicitamente confiados. Os endereços anunciados são resolvidos localmente apenas nos testes; isso não valida roteadores ou uma conexão entre duas máquinas.

Esses testes não executam uma caçada, uma GPU, o OAuth Google real nem uma conexão real entre dois PCs. Faça também a validação prática descrita no tutorial antes de declarar a implantação pronta para jogadores.

## Compilar os instaladores

Depois de `npm ci`, no sistema correspondente:

```bash
npm run build:win
npm run build:linux
```

Os arquivos saem em `release/`. O empacotamento inclui `src`, metadados e licenças do launcher; **não inclui** o cliente proprietário, as credenciais ou toda a árvore do servidor. O workflow de instaladores usa Windows e Linux. Publicar release é uma etapa separada com conferência dos testes e do commit de origem.

## Código nativo da DLL

A solução está em `server/upstream/UndauntedInternalServer/UndauntedInternalServer.sln`. Ela usa o toolset Visual C++ `v143` e Windows SDK; abra-a no ambiente C++ correspondente e examine a configuração x64. SDK gerado e MinHook estão preservados na base, com seus avisos.

Uma DLL recompilada não terá necessariamente o hash do binário distribuído. O launcher rejeita hashes diferentes: uma atualização precisa de revisão do binário, teste real, atualização deliberada do pin em `src/main.js` e publicação coordenada. Não desative a verificação apenas para fazer um arquivo desconhecido funcionar.

O proxy `dxgi.dll` é um binário da base cujo fonte não está incluído pelo upstream. A reprodução dos serviços Node e do launcher não depende de recompilá-lo; a reconstrução integral de todos os binários continua limitada por isso e pelo cliente proprietário externo.

## Atualizar a base

A cópia inicial é registrada por `server/upstream.lock.json`. O workflow `import-server.yml` só importa quando a pasta ainda não existe e confere commit e árvore antes de testar e publicar. Ele **não sobrescreve** uma base já importada.

Para atualizar: crie uma branch de revisão, compare a nova revisão com a atual, preserve licenças, registre a substituição da árvore e atualize o lock. Reveja os pontos de patch, fixtures, hashes e contratos. Execute os testes e ensaie a atualização/restauração de um banco de teste antes de migrar um host real. Não atualize automaticamente para a ponta de uma branch externa.

## SQL e bundle da nuvem

Os SQLs existentes são instalação inicial, não um histórico completo de migrations. Para alterar produção, crie uma migração específica e teste sua aplicação e rollback lógico. Ao editar os fontes da Edge Function, mantenha `supabase/dashboard-api.ts` equivalente: ele é a alternativa de implantação pelo painel e não pode ficar com uma versão anterior à API modular.
