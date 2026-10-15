# Proteção de credenciais — repositório público

O projeto **Dauntless Launcher Ultimate** pode manter o código-fonte público. As credenciais de Google, Supabase, servidores e contas do jogo devem ficar **somente no PC ou em um gerenciador de segredos apropriado**, nunca em commits, issues, screenshots, logs, anexos de Releases ou artefatos compartilhados.

## O que não subir

- Qualquer conteúdo de `senha/` (em qualquer subpasta).
- `*.key`, `*.pem`, `*.p8`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`.
- `client_secret*.json`, `credentials.json`, `authorization.json`, `supabase-authorization.json`, `google-host.json`, arquivos service-account.
- `.env`, `.env.local` e outros `.env.*` reais (somente `.env.example` com valores fictícios é permitida).
- Bancos e backups do jogo: `undaunted.db`, `*.db`, `*.sqlite*`, `fenys-backups/`, `runtime/`.

O `.gitignore` inclui regras explícitas; `test/secret-file-guard.test.js` verifica que caminhos com nomes de segredos não foram incluídos no índice do Git. Essa proteção **não lê nem publica** o conteúdo das credenciais. O teste não detecta todos os formatos possíveis de segredo embutido em arquivos de código/documentação; revise as alterações antes de cada commit.

## Onde guardar no Windows

Guarde os arquivos privados fora da cópia Git do projeto, em uma pasta pessoal com acesso restrito, por exemplo:

`%LOCALAPPDATA%\DauntlessLauncherUltimate\private\`

Ao configurar o launcher, selecione o arquivo privado por seu caminho local, se a tela permitir; não copie para o repositório nem envie chaves ao amigo. Os arquivos `UndauntedMetagame/.env`, `UndauntedDeployServer/.env` e as chaves das contas podem continuar na instalação **local** necessária para executar o servidor, mas jamais devem ser adicionados ao Git ou enviados como anexos.

O arquivo `C:\dr\data\undaunted.db` guarda progresso e deve ser preservado em backups privados. Nunca o adicione ao GitHub para "sincronizar" personagens; use a integração cloud com autenticação e verificação apropriadas.

## Se um segredo já foi publicado

1. **Revogue/rotacione imediatamente o segredo** no serviço que o emitiu (Google Cloud OAuth, Supabase, serviço remoto ou conta relevante). Um segredo exposto não volta a ser secreto ao colocá-lo em um repositório privado.
2. Remova o arquivo do índice Git (sem apagar o arquivo local) com `git rm --cached -- <arquivo>`, depois faça commit e push da remoção. **Não execute git rm comum** num banco ou chave que você precisa manter.
3. Investigue branches, tags, PRs, Releases, logs e histórico do Git. Remover um arquivo do HEAD **não remove versões antigas**. Para excluir blobs antigos, é necessário reescrever o histórico cuidadosamente (por exemplo, com `git filter-repo`) e coordenar a limpeza de clones/forks e caches do GitHub. Faça backup e planeje esse procedimento antes; não use `git push --force` sem avaliação.
4. No GitHub, configure as opções disponíveis em **Settings → Security → Code security and analysis**, especialmente verificações de segredos e proteção contra pushes com segredos. A disponibilidade varia por repositório e plano.
5. Verifique artefatos publicados, ZIPs, anexos e logs de Actions, que não são removidos por `git rm --cached`.

## Auditoria realizada em 15/10/2026

Foi feita uma **verificação de nomes de arquivos** no snapshot da branch `main`, nas branches encontradas e nas tags do repositório público `Fenysx/Dauntless-Fenys`. Nenhum caminho com os nomes de credenciais citados acima foi encontrado nessas referências. Consultas limitadas por caminhos comuns não encontraram histórico desses nomes.

**Limites:** isso não constitui auditoria exaustiva de cada arquivo em cada commit, de todas as credenciais dentro de arquivos com nomes inofensivos, nem de cópias em forks, caches, logs ou artefatos. Se houver qualquer suspeita de exposição, faça rotação mesmo assim.
