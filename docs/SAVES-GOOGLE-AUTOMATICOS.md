# Salvamento automático Google — beta.10

## Fluxo de salvamento

O progresso é gravado primeiro no SQLite do Metagame. Triggers SQLite persistentes marcam cada sessão Google afetada como pendente no mesmo commit, mesmo quando uma gravação não passa pelas rotas HTTP.

- Ao encerrar uma requisição de jogo, um envio é agendado após aproximadamente 750 ms.
- Um worker verifica alterações pendentes a cada 2 segundos, inclusive mudanças feitas por outras conexões ao SQLite.
- As reservas exclusivas de personagem na nuvem continuam sendo renovadas a cada ~20 segundos.
- O upload envia snapshots assinados pelo host (Ed25519) com revisão esperada e identificador idempotente (commitId). O Supabase rejeita saves desatualizados.
- Quando a rede cai, os dados locais e o snapshot pendente permanecem no SQLite; o worker tenta o envio novamente. A última reserva não é descartada prematuramente.
- Alterações realizadas enquanto outra revisão é enviada permanecem marcadas como pendentes para novo envio.
- Ao sair/trocar de servidor o host ainda exige uma confirmação síncrona antes da liberação da sessão.

## Estado na conta Google

O usuário vê em Conta Google e convites:
- Progresso confirmado no Supabase e revisão: nenhum save pendente no instante da consulta.
- Enviando atualizações à nuvem: alterações locais ainda estão na fila.
- Save local preservado; nuvem pendente: houve erro de envio e o servidor vai tentar novamente.
- Sem confirmação ao vivo: cliente não conseguiu confirmar o estado; não substitua o save nem troque de PC antes de verificar.

A rota POST /launcher/google/progress-status retorna apenas o estado do usuário autenticado pelo JWT Google. Não disponibiliza snapshots nem chaves privadas. A rota administrativa existente sync-status continua protegida.

## Limites

Quase em tempo real, não zero latência: tamanho do snapshot, conexão e Supabase determinam a confirmação. Sem host Google ativo a gravação continua local, não automaticamente no Supabase. Se a rede ficar indisponível por mais tempo que a reserva, as operações podem ser bloqueadas até a reconexão, evitando conflitos de progresso.

O progresso fica no Supabase associado à identidade Google, não no Google Drive.

Os módulos novos precisam ser instalados no Metagame. Atualizar só o instalador Electron não substitui os módulos do host já ativo. Faça backup de undaunted.db e reative a integração Google com todos os jogadores desconectados antes de testar. Não apague a conta nem inicie outro personagem.

Testes adicionados: fenys-google-autosave.test.js (tabelas, inventário, rollback), fenys-google-autosave-runtime.test.js (falha de rede e retry) e integração com dois Metagames para confirmação assíncrona. A execução real em Windows e a restauração completa em outro PC ainda precisam de validação.
