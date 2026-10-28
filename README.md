# Segura e Balança

PWA de gincana de campus para o trabalho prático de Sistemas Distribuídos. O jogador procura um ponto escondido
guiado por um radar quente/frio e, dentro da área, segura o botão e balança o celular. Quem balança primeiro leva
mais pontos, inclusive quando estava sem internet.

O design completo (requisitos RF/RNF, telas, algoritmos e decisões) está no canvas do projeto; este README resume o
que é pedido na entrega e aponta para o código.

## 1. Como rodar

Pré-requisitos: Node 22+, Java 17+ (21 recomendado) para o Emulator Suite.

```bash
npm install
npm run emuladores          # Firestore (8085) + Auth (9099) + UI (4000), projeto demo-seb
npm run dev                 # outro terminal: app em http://localhost:5173 apontando para o emulador
```

- Jogador: `http://localhost:5173/` (no emulador, o login Google abre a tela de contas falsas do Auth Emulator).
- Admin: `http://localhost:5173/admin`. Para virar admin, crie o documento `admins/{seu-uid}` na UI do emulador
  (http://localhost:4000/firestore). Em produção, faça o mesmo no console do Firebase.
- Celular na mesma rede: `npm run dev -- --host` e abra pelo IP; GPS e sensores exigem HTTPS fora de `localhost`,
  então para testar sensores de verdade use o deploy de preview.
- Debug: com o emulador (ou `?debug=1`) aparece o botão **Debug** com "Simular balanço" e "Reenviar última balançada".

| Script | O que faz |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint (com jsx-a11y e a fronteira de `src/dominio/`) e `tsc` |
| `npm run test:unit` | Vitest: domínio (ranking, conflito, radar, gesto, âncora) e sync (fila de saída, backoff, monitor) |
| `npx firebase emulators:exec --only firestore --project demo-seb "npm run test:rules"` | Regras do Firestore |
| `npm run build -- --mode emulador && npx firebase emulators:exec --only firestore,auth --project demo-seb "npm run test:e2e"` | Playwright: os cenários do enunciado |

## 2. Arquitetura

Três componentes:

- **Cliente (PWA)** — `src/jogador/` (telas) e `src/dominio/` (regras puras, sem React nem Firebase). Service
  worker com o app shell (`vite-plugin-pwa`), store local em IndexedDB (Dexie, `src/sync/db.ts`).
- **Módulo de sincronização** — `src/sync/`: monitor de conexão + heartbeat (`conexao.ts`), fila de saída com
  idempotência e backoff (`saida.ts`), âncora de tempo (`relogio.ts`), pull dos listeners para o store (`pull.ts`).
  Fala com o servidor só pela interface `Remoto` (`remoto.ts`); a implementação Firebase fica em `src/firebase/`.
- **Servidor (Firebase Spark)** — Auth Google, Firestore + `firestore.rules`, Hosting. Sem Cloud Functions: o
  ranking é calculado no cliente por `calcularRanking()` (`src/dominio/ranking.ts`).

A UI nunca fala com o Firestore direto: lê e escreve no IndexedDB e reage a ele (`useLiveQuery`). O painel do admin
(`/admin`, carregado com `lazy()`) é um cliente online com mais permissão.

Modelo no servidor: `config/jogo`, `pontos/{id}`, `partidas/{id}`, `partidas/{id}/filas/{pontoId}` (um documento por
fila com um mapa `entradas`, chave = `uid_dispositivoId_v`), `jogadores/{uid}`, `apelidos/{normalizado}`,
`relogio/{uid}`, `admins/{uid}`.

## 3. Armazenamento local

IndexedDB `segura-e-balanca` com os stores `sessao` (jogador, aparelho, snapshot da partida, último pull),
`pontos`, `filas`, `saida` (fila de saída), `relogio` (desvio do relógio), `historico` e `apelidos`. O Firestore roda
com `memoryLocalCache`: a persistência e o sync são nossos, inspecionáveis no DevTools.

Ranking e "suas balançadas" = `calcularRanking(filas confirmadas + itens da saída)`, então o que foi feito offline
aparece na hora, marcado como pendente. Fechar e reabrir offline restaura tudo.

## 4. Sincronização

- **Estado de conexão**: `navigator.onLine` diz se há rede (*Sem rede*); o heartbeat (`getDocFromServer(config/jogo)`,
  timeout 5 s, a cada 60 s com o app visível e logo após `online`) diz se o servidor responde (*Servidor
  indisponível*). Um envio que falha também marca *Servidor indisponível* na hora.
- **Envio**: a balançada é gravada na fila de saída **antes** do feedback de sucesso. Cada item é uma escrita
  atômica (`updateDoc` de um campo do mapa) e só sai da fila depois da confirmação. Falha de rede ou timeout (8 s) →
  volta a pendente com backoff 2 s → 60 s com jitter. Itens em `enviando` quando o app fechou voltam a `pendente`.
- **Gatilhos**: evento `online`, volta ao primeiro plano, heartbeat bem-sucedido, timer do backoff, nova balançada.
- **Recebimento**: listeners em `config/jogo`, `pontos`, `partidas/{atual}`, suas filas e `jogadores` gravam no store.
  Em outro aparelho, a entrada na partida baixa as filas e recupera o progresso.
- **Relógio**: na entrada e a cada reconexão, `serverTimestamp` + `performance.now()` formam a âncora; sem âncora
  (app reaberto offline, aparelho dormiu), usa o relógio corrigido pelo último desvio medido. A fonte vai em cada
  balançada (`monotonica` / `relogio-corrigido`) para auditoria.

## 5. Conflitos

| Situação | Política |
| --- | --- |
| Mesmo jogador, mesmo ponto, dois aparelhos offline | Menor horário vence; a outra fica como "descartada por conflito". As duas entradas ficam no servidor (chaves diferentes). Determinístico: todos os aparelhos chegam ao mesmo resultado sem coordenação. |
| Jogadores diferentes, um offline | Não é conflito: a fila é ordenada pelo horário ancorado e a pontuação é recalculada (quem sincroniza depois pode empurrar os outros). |
| Reenvio do que já chegou | Mesma chave. A regra recusa alterar uma entrada existente; o cliente confere que ela está lá e a tira da fila. Ranking inalterado. |
| Balançada × partida finalizada | O servidor vence: `permission-denied`, item "não contabilizada", sem novas tentativas. |
| Balançada × pausa ou desativação | Decide o horário da balançada, não o do sync. |
| Edição de ponto × cache local | O servidor vence no próximo pull. |

Empate exato de horário: chegada no servidor, depois a chave. Empate no total: mesma posição.

## 6. Falhas tratadas

| Falha | Comportamento |
| --- | --- |
| Perda de conexão | "Sem rede"; radar, balançada e ranking seguem do store local. |
| Servidor indisponível | "Servidor indisponível"; itens pendentes com backoff; o jogo segue como offline. |
| Falha no meio do sync | Itens independentes e atômicos; timeout volta a pendente; app fechado no meio → pendente ao abrir. |
| Reenvio | Idempotente pela chave. |
| Recusa definitiva | Item rejeitado, sem retentativa. |

Riscos aceitos (seção 9.2 do design): coordenadas legíveis no DevTools, horário/GPS forjáveis (admin anula), cota de
leitura do Spark, vibração no iOS.

## Decisões tomadas na implementação

- **"Segura" no nome**: o gesto exige **segurar o botão enquanto balança** (questão em aberto da seção 12). Soltar dá
  0,8 s de folga. Para trocar, veja `BotaoBalancar` em `src/jogador/telas/Radar.tsx`.
- **Empate no ranking total**: mesma posição (1, 2, 2, 4).
- **GPS impreciso** (RF-21): `accuracy` acima de 35 m não libera a balançada, mesmo que `distância − accuracy ≤ raio`.
- **Partida em rascunho**: estado extra antes de "ativa" (tela 13 do design); o admin abre a partida depois de
  criar os pontos.
- **Sync com servidor indisponível**: os itens continuam sendo tentados no ritmo do backoff (não só depois do
  heartbeat); o primeiro envio bem-sucedido volta o indicador para Online.
- **Regra de "uma entrada nova"**: o esboço da seção 5.3 usava `addedKeys().toList()[0]`, que não existe nas regras
  (Set não tem `toList`). A regra final pega a chave nova com `keys().removeAll(...)`.
- **Heartbeat de recuperação**: com *Servidor indisponível*, o heartbeat roda a cada 10 s (em vez de 60 s) para
  perceber a volta; ao voltar, a fila de saída é enviada na hora, sem esperar o backoff.
- **Confirmação local**: quando o servidor confirma um envio, a entrada sai da fila de saída e entra na fila
  confirmada local na mesma transação — a balançada não some da tela esperando o listener.
- **Cache do SDK**: snapshots vazios vindos só do cache em memória (app aberto offline) são ignorados; nunca apagam
  o store local.
- **`jogadores/{uid}.apelidoNormalizado`**: campo extra para a regra conferir, na mesma transação, a reserva em
  `apelidos/`.

## Estado dos testes

Unitários (40), regras (17) e E2E no perfil Pixel 7 (7 cenários: online, offline + reabrir + voltar, outro aparelho,
servidor fora, reenvio + conflito, fora do raio, acessibilidade com axe) passam localmente. O perfil iPhone 14 (WebKit)
roda no CI; localmente exige `sudo npx playwright install-deps webkit`. Sensores reais (bússola, acelerômetro,
vibração) só se validam no aparelho.

## Deploy

Projetos (Spark, Firestore em `southamerica-east1`): `segura-e-balanca-dev` (o `seb-dev` do design já existia
em outra conta) e `segura-e-balanca-prod`, aliases `dev` e `prod` no `.firebaserc`. A config web já está em
`.env.dev`/`.env.prod`. Falta: rodar `firebase init hosting:github` em cada projeto, renomear os secrets para
`FIREBASE_SA_DEV`/`FIREBASE_SA_PROD` e criar os environments `preview` e `producao`. O workflow
`.github/workflows/ci.yml` faz o resto.
