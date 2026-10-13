# Dauntless Launcher Ultimate

Projeto comunitário para jogar **Dauntless 1.4.4** em servidores compatíveis com Dauntless Revived. Este repositório reúne nosso launcher, **uma cópia completa e fixada da base do servidor**, nossas integrações e o backend de personagens na nuvem.

**Comece pelo [tutorial de instalação](docs/INSTALACAO.md).** Para entender as peças antes de instalar, leia a [arquitetura e os fluxos](docs/ARQUITETURA.md).

## Onde está cada coisa

| Local | Conteúdo |
|---|---|
| [`src/`](src/) | Nosso launcher Electron e os módulos de integração aplicados ao servidor |
| [`server/upstream/`](server/upstream/) | Base Dauntless Revived completa, preservada na revisão usada pelo projeto |
| [`server/upstream.lock.json`](server/upstream.lock.json) | Repositório de origem, commit, árvore Git e licença da base |
| [`supabase/`](supabase/) | SQL, API de personagens e API de backups |
| [`scripts/`](scripts/) | Preparação do servidor, testes integrados e autorização inicial da nuvem |
| [`test/`](test/) | Testes unitários, contratos e testes com Metagame real |
| [`docs/`](docs/README.md) | Instalação, funcionamento, nuvem, desenvolvimento e diagnóstico |
| [`.github/workflows/`](.github/workflows/) | Validação, instaladores, importação da base e releases |
| `runtime/` | Pasta local gerada; configurações e dados privados, fora do Git |

O código fonte do Metagame está em [`server/upstream/UndauntedMetagame`](server/upstream/UndauntedMetagame/); o gerenciador de processos em [`UndauntedDeployServer`](server/upstream/UndauntedDeployServer/); a DLL em [`UndauntedInternalServer`](server/upstream/UndauntedInternalServer/). O launcher em `server/upstream/UndauntedLauncher` é o **launcher da base**, não o nosso produto.

## Início para desenvolvimento

Instale Git e Node.js 24 com npm. Em uma máquina com acesso ao repositório:

```bash
git clone https://github.com/Fenysx/Dauntless-Fenys.git
cd Dauntless-Fenys
npm ci
npm test
npm start
```

Preparar uma instalação separada do servidor:

```bash
npm run server:prepare
```

Isso copia a base para `runtime/server`, instala as dependências travadas e compila Metagame e DeployServer. **Ainda é necessário configurar o servidor e fornecer o cliente 1.4.4**, conforme o tutorial. O comando recusa um destino existente para preservar configurações e saves.

## O que é replicável

O código do launcher, serviços, integração e banco está versionado. Os arquivos `package-lock.json` e a revisão da base fixam as dependências do projeto. A base fica dentro deste repositório: não exige submódulo nem buscar a versão mais recente de outro projeto para começar.

O cliente proprietário original, mapas e arquivos `.pak` **não são distribuídos**. É necessário possuir uma instalação compatível. A base contém binários de integração de terceiros; o código fonte do proxy `dxgi.dll` não é fornecido pelo upstream. Portanto, não prometemos reconstrução de todos os binários exclusivamente a partir do código deste repositório.

## Redes sem Tailscale obrigatório (1.7.0-beta.1)

O painel **Servidor com personagens Google** permite escolher **Tailscale**, **LAN** ou **Público HTTPS**. No modo público, o launcher fornece uma ponte HTTP local para o cliente 1.4.4, com transporte HTTPS e chat WSS até o host. [Configuração e limites de cada modo](docs/REDES.md).

## Situação atual

- Launcher para Windows; pacotes Linux com execução experimental do cliente via Wine.
- Metagame e DeployServer compiláveis; partidas nativas dependem do cliente Windows 1.4.4.
- Convites Google por Tailscale, LAN e HTTPS público implementados; progresso continua no Supabase.
- Google OAuth real depende da configuração do provedor; a última verificação em 12/10/2026 encontrou o provedor desativado.
- Testes automatizados de API e progresso entre dois Metagames disponíveis. Login Google real, partida em dois PCs e partida via Wine ainda precisam de validação prática.
- O instalador do launcher não embute toda a base nem instala automaticamente o jogo.

[Releases](https://github.com/Fenysx/Dauntless-Fenys/releases) · [Guia do launcher](docs/GUIA-LAUNCHER.md) · [Limitações e testes](docs/DESENVOLVIMENTO.md)

## Créditos e licença

Projeto independente, sem vínculo com Phoenix Labs ou Epic Games. Base: [Dauntless Revived](https://github.com/mixutin/dauntless-revived), derivada de Undaunted. Código sob **AGPL-3.0-only**, com licenças específicas dos componentes de terceiros. Preserve [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) e os avisos da base ao redistribuir.
