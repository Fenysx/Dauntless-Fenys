# Preset do personagem Fenysx — administração local, sem perda de personagem

## O que está preparado

Ferramenta offline: `scripts/fenysx-character-preset.cjs`. Trabalha **apenas no personagem existente identificado por UID e Character ID**, não cria uma conta Google artificial nem substitui outro usuário. Utiliza o Metagame original 1.4.4 como fonte dos identificadores da loja e das trilhas de progressão.

- Nome **Fenysx**;
- Rams `1.000.000.000.000` em `CURRENCY_NOTES`;
- Platina `10.000.000.000.000` em `CURRENCY_PLATINUM` e `CURRENCY_PLATINUM_UNIV` (a última usada nas compras do Metagame);
- Todos os cosméticos e permissões de ofertas não repetíveis existentes no **catálogo local 1.4.4** (não garante conteúdos ausentes do cliente);
- Todas as trilhas de maestria e Hunt Pass levadas até o nível configurado pelo cliente, sem reduzir progresso existente;
- Progressão real: usar a configuração do Metagame **`PROGRESSION_MODE=real`** (já é o padrão), não o stub.

### Limites reais, não esconder do usuário

**Nível Slayer 100 não é suportado pelo catálogo original:** `MasteryTrack_PlayerLevel` vai até 50. O preset utiliza o **máximo compatível, 50**, e não escreve um 100 fictício no banco. Corações de reforja não existem no cliente 1.4.4 (o sistema Reforged veio com 1.5.0). Para suportá-los seria necessário portar mecânicas/clientes, em projeto separado.

Os valores de moeda solicitados **excedem int32 (2.147.483.647)**. SQLite e JavaScript conseguem armazenar esses números, mas a visualização/consumo no cliente não está validada e pode causar erros. O comando de aplicação exige uma aceitação explícita desse risco. Verifique o resultado no jogo depois e restaure o backup se houver incompatibilidade.

**O preset NÃO faz login no Google e NÃO sobe dados diretamente ao Supabase.** Após editar o banco offline, o host local deve ser iniciado com rotas Google ativadas. O proprietário deve vincular o **personagem já existente** à **sua própria sessão Google** pelo launcher e confirmar a revisão da nuvem. Não selecione «Criar primeiro personagem» se já houver um personagem local.

Se o personagem já estiver vinculado ao Google, a ferramenta **recusa a edição offline**; a nuvem já é autoritativa. Utilize apenas o fluxo autenticado de save/sync do Metagame.

## Aplicação — somente na máquina onde está o banco real

1. Pare o jogo, as caçadas, o Metagame e o DeployServer. Faça backup independente do servidor; não apague ou renomeie nenhum arquivo original.
2. Atualize a pasta do projeto com o código mais recente da `main`. Tenha Node.js 24 e dependências do Metagame já instaladas.
3. No `.env` do Metagame, localize **somente a linha `DB_FILENAME=`**, sem divulgar outras variáveis (elas podem conter segredos).
4. **Na instalação local informada anteriormente**, os caminhos eram:
   - Metagame: `C:\Users\Vinicius Alquimim\dauntless-revived\UndauntedMetagame`
   - Banco de personagens: `C:\dr\data\undaunted.db`
   Se `DB_FILENAME` não mudou, comece pela consulta **somente leitura** abaixo, na pasta do código atualizado:

```powershell
node scripts/fenysx-character-preset.cjs --metagame "C:\Users\Vinicius Alquimim\dauntless-revived\UndauntedMetagame" --db "C:\dr\data\undaunted.db" --list
```

   As pastas do launcher e do servidor são separadas. Não tente editar arquivos no diretório do instalador do launcher.

5. Use PowerShell, na raiz do projeto, substituindo os caminhos de exemplo se a instalação tiver mudado:

```powershell
node scripts/fenysx-character-preset.cjs --metagame "C:\Dauntless-Fenys\runtime\server\UndauntedMetagame" --db "C:\Dauntless-Fenys\runtime\data\undaunted.db" --list
```

6. Copie **somente** o `userId` e o `characterId` que correspondem à sua conta/ao personagem atual. Primeiro faça pré-visualização (o padrão é não alterar):

```powershell
node scripts/fenysx-character-preset.cjs --metagame "C:\Dauntless-Fenys\runtime\server\UndauntedMetagame" --db "C:\Dauntless-Fenys\runtime\data\undaunted.db" --user-id "UID-COLE-SEU-UUID-REAL" --character-id "COLE-O-CHARACTER-UUID-REAL"
```

7. **Somente depois de conferir as identidades, ter os serviços desligados e aceitar o risco dos valores acima de int32**, aplique:

```powershell
node scripts/fenysx-character-preset.cjs --metagame "C:\Dauntless-Fenys\runtime\server\UndauntedMetagame" --db "C:\Dauntless-Fenys\runtime\data\undaunted.db" --user-id "UID-COLE-SEU-UUID-REAL" --character-id "COLE-O-CHARACTER-UUID-REAL" --apply --server-stopped --confirm Fenysx --accept-client-overflow-risk
```

Uma cópia SQLite consistente `*.fenysx-before-<data>.sqlite` é produzida **antes** de qualquer edição; todas as alterações no banco são executadas em uma transação. Se o processo informar erro, não prossiga no launcher até examinar a saída.

8. Confira no `.env` do Metagame a linha `PROGRESSION_MODE=real`. Se estiver `stub`, atualize **somente essa chave**, com os serviços desligados, guardando cópia do `.env`. Sem a chave, a versão atual utiliza progressão real por padrão.
9. Inicie o Metagame; **confirme o teste local** no jogo antes de habilitar o Google. Com os serviços integrados, no Launcher vá em **Conta Google e convites → Continuar com Google → Vincular meu personagem atual ao Google → Conferir personagem na nuvem**. A checagem deverá exibir Fenysx e revisão maior que zero. Teste save de caçada e retorno após reinício; somente então teste outro servidor.

## O que a ferramenta se recusa a fazer

- Adivinhar a conta ou personagem pelo nome;
- Editar diretamente uma conta Google sem prova de sessão autenticada;
- Sobrescrever uma sessão ou transferência Google existente;
- Criar uma conta nova para «simular» o antigo personagem;
- Rodar `--apply` sem comprovação manual de servidor desligado, nome confirmado e aceite de risco;
- Grant de conteúdo inexistente no cliente ou criar dados de Reforged no cliente 1.4.4;
- Remover itens antigos ou reduzir quantidades de itens da loja.

## Recuperação

Se o cliente não aceitar os valores, **pare todos os serviços** e restaure o arquivo SQLite do backup local criado pelo comando. Não restaure silenciosamente se já houve saves novos na nuvem: primeiro compare as revisões para não substituir dados mais recentes.

Os valores acima valem para o servidor comunitário do usuário, não para conta oficial Epic/Phoenix Labs. A permissão de criador/administrador é preservada, sem elevar direitos de outras contas.
