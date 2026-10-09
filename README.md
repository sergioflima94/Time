# BoraJogo

App em Expo (React Native) para organizar a vida de times e espaços esportivos:
agenda, chamada, sorteio e rodízio, campeonatos, rede social, pagamentos, comandas,
vaquinhas, aulas e reservas para futebol, vôlei, basquete, handebol e futevôlei.

## Identidade visual — Clube Vivo

O BoraJogo usa uma linguagem jovem inspirada em clube, resenha e dia de jogo, sem
parecer um painel corporativo ou uma interface gerada por IA:

- **Uso diário claro e acolhedor**: fundo areia quente, cartões brancos, títulos
  fortes e formas arredondadas para Início, Amigos, Times, Perfil, Admin e operação.
- **Ação em verde-lima**: confirmações e chamadas principais usam uma cor viva,
  sempre com texto escuro para manter contraste.
- **Social em coral e informação em azul**: amizade, pedidos e atividade social não
  competem visualmente com desempenho, agenda e dados de organização.
- **Contexto por esporte**: ícone e cor do esporte continuam identificando times,
  jogos e campeonatos sem trocar a identidade inteira do aplicativo.
- **Modo jogo ao vivo**: cronômetro e placar de campeonato mudam para grafite escuro,
  com placar grande e alto contraste. O restante do app permanece claro.
- **Componentes compartilhados**: `Screen`, `Card`, `Button`, `TextField`, `Badge` e
  `SegmentedControl` aplicam a mesma linguagem às rotas atuais e às novas telas.

As cores e métricas ficam em `src/constants/theme.ts`; a troca entre o tom diário e
o tom ao vivo é feita por `src/components/ui/ThemeTone.tsx`.

## Rodando o projeto

```bash
npm install
npm run start   # abre o Metro/Expo Dev Tools (escaneie o QR code com o app Expo Go)
npm run web     # roda no navegador
npm run ios     # requer macOS + Xcode
npm run android # requer Android Studio / emulador
```

> **Rodando de um ambiente remoto/sandbox (ex.: Claude Code na nuvem)**: `npm run
> start`/`expo start --tunnel` precisa alcançar `ngrok.com` e os domínios da Expo
> (`api.expo.dev`, `cdp.expo.dev`) pra gerar o QR code que o Expo Go escaneia — se a
> rede desse ambiente bloquear esses domínios (política de egress da organização), o
> túnel não sobe e não tem como abrir no Expo Go a partir de lá. Nesse caso, rode os
> comandos acima na sua própria máquina (com internet normal) e escaneie o QR gerado
> localmente.

## Modo demonstração (sem backend)

Sem nenhuma configuração adicional, o app roda inteiro com **dados de exemplo**
(ver `src/lib/mockData.ts`) guardados no próprio aparelho via AsyncStorage
(`src/store/useAppStore.ts`, `src/store/useAuthStore.ts`). Isso permite testar todos
os fluxos — chamada, sorteio, cronômetro, avaliações, punições, admin — sem precisar
de internet ou conta em nenhum serviço.

Quando o Supabase é configurado, login/cadastro usam Auth real e **todos os domínios
do aplicativo** são carregados e gravados nas tabelas hospedadas. As stores Zustand
continuam existindo apenas como cache otimista/offline: a interface responde na hora,
uma fila durável reenvia falhas de rede e o Realtime atualiza outros aparelhos.

### Contas de demonstração

O modo mock **não tem login de verdade** — qualquer e-mail/senha na tela de login
entra sempre no mesmo perfil local, "Você" (`p1` em `src/lib/mockData.ts`), sem
precisar de conta ou senha real. Esse perfil já vem pré-configurado com os
principais papéis do app, pra testar tudo sem cadastrar nada na mão:

- **Dono de time (admin de pelada)**: "Você" é admin da "Pelada dos Amigos -
  Quintas" (`pel1`). Código de convite `AMIGOS-QUI`. Pra testar como jogador comum
  de uma segunda pelada (a "Vôlei da Empresa - Sábados", `pel2`), entre com o código
  `EMPRESA-SAB` em Agenda → trocar pelada → "Entrar em outra pelada".
- **Dono de campo/estabelecimento com vários esportes**: "Você" também é dono do
  **Complexo Esportivo Vila Nova** (Perfil → "🏟️ Sou dono de um campo"), com 4
  campos já cadastrados, um por esporte — ⚽ Society, 🏐 Vôlei, 🏀 Basquete e 🏖️
  Futevôlei. Código de acesso `VILA-NOVA` (pra um admin de pelada vincular um campo
  da pelada dele a esse estabelecimento). Também existe um segundo estabelecimento de
  exemplo, "Arena Society Central" (`est1`, dono `p2`), código `ARENA-CENTRAL`, com um
  campo já vinculado a uma pelada.

Pra virar admin de outra pelada ou dono de outro estabelecimento, basta usar essas
telas normalmente — é tudo local, não afeta ninguém além do seu próprio aparelho.

## Configurando o Supabase (dados reais, multiusuário)

O repositório está vinculado ao projeto hospedado e o schema é controlado por
`supabase/migrations`. Não rode mais `schema.sql` manualmente no SQL Editor: novas
alterações devem sempre virar migrações versionadas e ser aplicadas pelo CLI.

1. Faça login e vincule sua cópia local uma única vez:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU_PROJECT_REF
   ```
2. Em **Connect → Framework**, copie a **Project URL** e a **Publishable key**.
3. Crie `.env.local` na raiz (o arquivo é ignorado pelo Git):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave-publicavel
   ```
4. Reinicie o `npm run start`. Com essas variáveis definidas, `isMockMode` vira
   `false`, login/cadastro usam Supabase Auth e `useSupabaseSync()` ativa leitura,
   escrita, fila offline e Realtime para as três stores do aplicativo.
5. Em **Authentication**, habilite o provedor de e-mail/senha (ou o de sua
   preferência) para o cadastro de jogadores.
6. Para publicar mudanças de backend:
   ```bash
   npm run supabase:push
   npm run supabase:functions
   npm run supabase:types
   npm run supabase:audit-sync
   ```

As Edge Functions estão configuradas em `supabase/config.toml`. Webhooks e tarefas
agendadas validam seus próprios segredos; funções iniciadas pelo app exigem JWT.
Nunca coloque `service_role`, tokens de gateway, WhatsApp ou OpenAI em variáveis
`EXPO_PUBLIC_*`.

### Como a sincronização de dados funciona

- `src/lib/supabaseSyncMappings.ts` relaciona cada coleção de `useAppStore`,
  `useGrowthStore` e `useProStore` à sua tabela relacional.
- `src/lib/supabaseSync.ts` identifica o jogador da sessão, envia alterações que
  ficaram offline, hidrata todas as consultas permitidas por RLS e passa a observar
  mudanças locais e remotas.
- Estado composto também é normalizado: períodos do placar usam
  `scoreboard_segments`, participantes do chat usam `chat_participants`, aceites de
  termos usam `waiver_acceptances` e a ordem do rodízio usa `game_team_queue`.
- `player_preferences` guarda a pelada ativa e a última leitura das notificações sem
  misturar preferências privadas ao perfil público.
- Alterações locais são otimistas. Se uma query falhar por falta de conexão, ela vai
  para `pelada-supabase-mutation-queue-v1` no AsyncStorage e é reenviada antes da
  próxima hidratação. O status fica disponível em `useDataSyncStore`.
- Check-in não replica o token aberto: `issue_game_checkin_pass()` armazena somente o
  hash e `redeem_game_checkin()` valida e consome o ingresso atomicamente.
- `npm run supabase:audit-sync` falha quando uma nova coleção da store não possui
  mapeamento e também aponta campos obrigatórios que não seriam enviados ao banco.

O modo sem variáveis Supabase continua usando integralmente os dados de demonstração.
No modo conectado, o Supabase é a fonte oficial e o conteúdo local é apenas cache.

## Estrutura do projeto

```
app/                        rotas (Expo Router)
  (auth)/                    login, cadastro
  (tabs)/                    início, amigos, times, perfil, admin
  jogo/[id]/                 detalhe do jogo, sorteio, cronômetro, avaliar

src/
  types/                     modelo de dados (Player, Game, Attendance, Rating...)
  lib/
    teamDraft.ts              sorteio de times (chegada/aleatório/nota) + fila de rodízio
    punishment.ts             regras de punição por falta
    ratings.ts                cálculo da nota geral (carta estilo FIFA)
    schedule.ts                cálculo da próxima data de um jogo recorrente
    supabase.ts                cliente Supabase (ou null em modo mock)
    mockData.ts                dados de exemplo
  store/                      estado global (zustand + persistência local)
  components/                 componentes de UI reutilizáveis

supabase/schema.sql          schema completo + Row Level Security
```

## Como funcionam as regras principais

- **Sorteio de times** (`src/lib/teamDraft.ts`): recebe os confirmados e separa em
  times do tamanho configurado. Por nota, distribui em zig-zag (draft) para equilibrar
  a força dos times; por chegada, forma os times pela ordem de confirmação; aleatório
  embaralha. Goleiros são distribuídos um por time antes dos jogadores de linha.
- **Fila de rodízio**: os dois primeiros times da fila jogam; os demais ficam
  "de próximo". Quem vence fica esperando o próximo desafiante, quem perde vai para o
  fim da fila (empate: os dois saem e os dois próximos entram).
- **Rodízio individual** (opção no sorteio, `app/jogo/[id]/sorteio.tsx` →
  "Como formar os times"): em vez de montar todos os times fixos de uma vez, sorteia só
  o 1º confronto e joga o resto numa bolsa de jogadores avulsos (`WaitingPlayer` em
  `src/types/index.ts`) — sem time fixo pros próximos jogos. A cada rodada encerrada, o
  próximo desafiante é remontado do zero puxando da bolsa por prioridade: quem já ficou
  mais rodadas esperando entra primeiro; empate é resolvido pela ordem do método de
  sorteio escolhido na primeira vez (nota, chegada ou aleatório —
  `src/lib/teamDraft.ts#pickNextChallenger`). Jogador marcado cansado/encerrado (ver
  item acima) fica de fora do sorteio da bolsa mesmo esperando, até o admin liberar.
- **Troca de jogador em campo** (tela do cronômetro, `app/jogo/[id]/cronometro.tsx`):
  o admin toca em qualquer jogador dos dois times que estão jogando pra substituí-lo
  por alguém disponível — inclusive jogadores de times que estão "de próximo" na fila,
  já que eles não estão em campo no momento. Três motivos: **troca normal** (só troca,
  sem restrição), **🥵 cansado** (fica de fora automaticamente pelas próximas 2 rodadas
  — o contador desce toda vez que uma rodada termina, `useAppStore.endMatchTurn`, e ele
  volta a aparecer como opção de substituto sozinho) e **🏠 encerrou por hoje** (fora
  pelo resto do jogo, até o admin reverter em "Jogadores de fora" → "voltar a jogar").
  Esse status (`PlayerFatigue` em `src/types/index.ts`) é por jogo, não é punição nem
  falta — não afeta o histórico de faltas do jogador.
- **Aba Times** (`app/(tabs)/times.tsx`): lista **todos os times (peladas) que você
  participa**, separados em "você é dono" (admin) e "você participa" (membro comum) —
  é o hub multi-time do app, já que um jogador pode ser dono/membro de vários ao mesmo
  tempo (ver "Criar uma pelada nova" acima). Tocar num time abre os detalhes
  (`app/time/[id].tsx`): descrição, elenco (tocar num jogador abre o perfil dele,
  `app/jogador/[id].tsx`, com a carta dele girando — `RotatingCard`, feito com
  `react-native-reanimated`), e — se aquela pelada tem um jogo com times já sorteados —
  quem tá jogando agora, quem tá esperando (ou a fila individual), com as mesmas funções
  de admin de antes (renomear time, trocar cor, reordenar a fila). De lá também dá pra
  ir direto pra Agenda ou pro Admin daquela pelada específica (troca a pelada ativa e
  navega).
  > Elenco continua mostrando só a pelada **ativa no momento** (`currentPeladaId`),
  > trocada pelo seletor no topo da Agenda ou por aqui — ainda não é multi-time "de
  > verdade" como a aba Times. O Admin agora tem um seletor de pelada próprio (ver
  > abaixo) pra quem administra mais de um time.
- **Admin multi-time** (`app/(tabs)/admin.tsx`): quando o jogador é admin de mais de
  uma pelada, aparece o mesmo seletor de pelada do topo da Agenda (`PeladaSwitcher`)
  no alto da tela de Admin, pra trocar qual time está administrando sem precisar ir
  até a Agenda primeiro. Se a pelada selecionada não for uma em que ele é admin,
  mostra o aviso de acesso negado com a dica de trocar ali mesmo.
- **Aba Amigos** (`app/(tabs)/amigos.tsx`, antiga "Jogadores"): rede social do app.
  Busca qualquer jogador (não só da pelada atual) por nome/apelido pra enviar pedido
  de amizade (`Friendship` em `src/types/index.ts`, ações `sendFriendRequest` /
  `respondFriendRequest` / `removeFriendship` em `useAppStore`), lista solicitações
  recebidas com aceitar/recusar, um **feed de atividades** dos amigos (e de você
  mesmo) gerado a partir de dados que já existem — gols marcados e peladas que
  entrou (`src/lib/activity.ts`, `computeActivityFeed`) — e por fim o grid de cartas
  dos amigos (era o grid de "Jogadores da pelada" antes), cada uma levando pro
  perfil (`app/jogador/[id].tsx`). O botão de adicionar/aceitar amizade também
  aparece direto no perfil do jogador, não só na busca. Cada item do feed pode ser
  **curtido** (`ActivityLike`, ação `toggleActivityLike`), e a aba ganha uma bolinha
  vermelha no ícone (`src/components/AmigosTabIcon.tsx`) quando há notificação não
  lida. Cada item do feed também aceita **comentários** (`ActivityComment`, ação
  `addActivityComment`) — toca no ícone de balão pra abrir/fechar a lista e escrever.
- **Central de notificações** (`app/notificacoes.tsx`, acessível pelo sino no topo da
  aba Amigos): lista pedido de amizade recebido (com aceitar/recusar direto ali),
  pedido que você mandou foi aceito, curtida e comentário em algo seu no feed — tudo
  calculado a partir dos dados que já existem (`src/lib/notifications.ts`,
  `computeNotifications`), sem uma tabela de "notificações" separada. Abrir a tela
  marca tudo como lido (`notificationsSeenAt` em `useAppStore`), o que zera a bolinha
  vermelha da aba Amigos (`useUnreadNotificationsCount`).
- **Desafios — time x time e jogador x jogador** (`src/types/index.ts`,
  `useAppStore`): dois jeitos de disputar sem depender de campeonato/estabelecimento.
  Na tela do time (`app/time/[id].tsx`), um admin pode **desafiar outro time** do
  mesmo esporte propondo dia/horário (e opcionalmente um campo próprio e uma
  mensagem) — vira um `TeamChallenge` pendente, visível pros dois lados. Um admin do
  time desafiado aceita ou recusa (`respondTeamChallenge`); aceitando, vira uma
  `FriendlyMatch` de verdade — uma partida amistosa avulsa que reaproveita o elenco
  inteiro de cada pelada como "o time" (sem etapa de inscrição de time, diferente de
  campeonato), com cronômetro e placar ao vivo próprios em `app/desafio/[matchId].tsx`
  (`startFriendlyMatch`/`registerFriendlyGoal`/`undoLastFriendlyGoal`/`endFriendlyMatch`),
  aceitando empate como resultado válido. No perfil de outro jogador
  (`app/jogador/[id].tsx`), dá pra mandar um **confronto direto** (`PlayerDuel`,
  botão "⚔️ Desafiar") — o outro aceita/recusa e, uma vez aceito, qualquer um dos
  dois registra quem venceu (ou empate). O resultado fica gravado como retrospecto
  (placar de vitórias de cada um + empates) exibido ali mesmo no perfil, sem precisar
  de uma pelada em comum.
- **Home/Agenda** (`app/(tabs)/index.tsx`): além dos jogos, mostra um card de
  **"Seu desempenho"** — nota geral, jogos disputados, vitórias, gols/pontos, o
  retrospecto (V/E/D) e o saldo, mais uma seta de tendência (`src/lib/performance.ts`,
  `computeOverallTrend`) que compara a média das últimas 5 avaliações recebidas com as
  5 anteriores para indicar se o jogador está subindo, caindo ou estável — e um carrossel
  de **atalhos dos seus times** (todas as peladas que participa, com "+ Novo time"),
  cada um levando direto pra `app/time/[id].tsx`.
- **Punição** (`src/lib/punishment.ts`): confirmou presença e não foi = falta. A 1ª
  falta é só um aviso; a 2ª deixa o jogador de fora do próximo jogo; da 3ª em diante,
  fora dos 2 próximos jogos. O admin marca a falta na tela do jogo, depois de encerrado.
- **Nota geral / carta** (`src/lib/ratings.ts`): após cada jogo (ou ao entrar pela
  primeira vez), os jogadores avaliam quem jogou com eles (ataque, defesa,
  velocidade, de 1 a 5). A média vira a nota geral na escala 0-99, estilo carta de
  FIFA, com faixas de bronze/prata/ouro/especial.
- **Modo Resenha** (`src/lib/banter.ts`): o jogador precisa ativar voluntariamente no
  Perfil. Depois da partida, apenas quem confirmou e realmente participou pode marcar
  `😭 Rei do Drama`, `📢 VAR Humano` e `🔥 Sangue Quente`. Os votos são anônimos,
  expiram em 30 dias, aparecem no verso da carta somente para o próprio jogador e
  colegas que compartilham uma pelada ativa, e **não alteram a nota geral**. O banco
  guarda a autoria apenas para deduplicação/moderação; a função
  `player_banter_summary()` devolve somente contagens agregadas. Desligar o recurso
  remove os selos ativos. Na monetização, o Premium pode oferecer animações, molduras
  e coleções sazonais para o verso da carta, mas nunca cobrar para esconder voto,
  denunciar abuso ou controlar a privacidade.

## Operação Pro — jornada, confiança e monetização

A Home e a Central do esporte possuem um atalho para `app/operacao-pro.tsx`. Essa
área fecha os ciclos que faltavam entre marcar um jogo, operar o encontro, receber e
reter o usuário:

- **Central do dia do jogo** (`app/jogo/[id]/dia-do-jogo.tsx`): mostra campo,
  quórum, pagamentos, check-in, times e partida como uma linha do tempo. O jogador
  abre seu ingresso; o admin abre a portaria; ambos acessam a comanda sem procurar o
  recurso em vários menus.
- **Check-in por QR Code** (`app/checkin/[gameId].tsx` e
  `app/jogo/[id]/checkin.tsx`): ingresso individual de uso único, leitura por
  `expo-camera`, fallback manual e lista para o admin. No banco, a função
  `redeem_game_checkin()` compara apenas o hash do token, registra presença e cria o
  evento de confiabilidade de forma atômica.
- **Confiabilidade**: nota separada da habilidade esportiva, baseada em check-in,
  no-show, atraso, cancelamento tardio e fair play. Assim o app não pune o desempenho
  do jogador por uma questão operacional.
- **Temporadas e ranking**: cada time cria temporadas por esporte, configura pontos
  e acompanha jogos, vitórias, produção ofensiva e fair play.
- **Inteligência do estabelecimento**: ocupação estimada, líquido conciliado, estoque
  baixo e recomendações para horários ociosos e clientes recorrentes.
- **Indicações com deep link** (`pelada://convite/CÓDIGO`): campanha rastreável,
  limite de uso e recompensa somente depois da primeira conversão paga.
- **Planos comerciais**: ofertas distintas para Jogador Premium, Time Pro e
  Estabelecimento Pro. A tela demonstra a contratação, mas a produção só ativa o
  benefício depois do callback da loja ou webhook do provedor.
- **Segurança e auditoria**: denúncias, estado da análise e trilha imutável das ações
  administrativas. Dados sensíveis continuam protegidos por RLS.
- **Sincronização offline-first**: todos os módulos passam pela fila durável de
  `src/lib/supabaseSync.ts`; eventos de integração da Operação Pro continuam também
  registrados idempotentemente em `client_mutations`.

O cadastro passa a usar Supabase Auth quando `.env` está configurado. O trigger
`handle_new_auth_user()` cria o perfil mínimo mesmo quando a confirmação por e-mail
impede uma sessão imediata. Sem Supabase, login, QR, ranking, planos e sincronização
continuam demonstráveis localmente.

### Conciliação e receita da plataforma

`payment_gateway_connections.platform_fee_percent` define a comissão contratada com
o estabelecimento. Depois que o webhook confirma o pagamento, ele cria uma linha em
`payment_settlements` separando valor bruto, tarifa do provedor, comissão da
plataforma e líquido do estabelecimento. A interface usa o líquido conciliado nos
indicadores — nunca considera o clique do cliente como receita confirmada.

## Central do esporte — novos módulos

A Home agora possui um atalho para `app/central.tsx`. A central reúne dez módulos
funcionais em uma rota dinâmica (`app/recursos/[slug].tsx`), com cache offline em
`src/store/useGrowthStore.ts` e persistência relacional no Supabase. As regras e cálculos reutilizáveis ficam
em `src/lib/growth.ts`, e os contratos de domínio em `src/types/growth.ts`.

- **Placar multiesporte**: suporta gols/pontos, sets com pontuação-alvo e vantagem de
  dois pontos, além de períodos/quartos acumulados. Encerrar um segmento cria o
  próximo automaticamente.
- **Conversas contextuais**: canais de time, partida, campeonato/capitães e atendimento
  do estabelecimento. Possui mensagens persistidas, contador de não lidas e opt-in de
  notificações.
- **Carteira de créditos**: razão de créditos, débitos, cashback, bônus e estornos. O
  saldo pode ser usado em reservas, aulas, inscrições, comandas e loja.
- **Planos e fidelidade**: mensalidades, pacotes de créditos, bônus e vantagens da
  lanchonete/campo, com validade e saldo de usos.
- **Equipe operacional**: catálogo e escala de árbitros, mesários, professores e
  freelancers, incluindo convite, valor por evento e status de pagamento.
- **Marketplace de horários vagos**: ofertas de última hora, desconto calculado,
  reserva com créditos e destaque patrocinado explicitamente identificado.
- **Relatórios Pro**: movimentação financeira, conversão de ofertas, estoque, equipe
  escalada e receita potencial — base para períodos customizados e exportação contábil.
- **Documentos e segurança**: termos versionados, aceite individual, contato de
  emergência, responsável legal e indicação de dados médicos restritos.
- **Retrospectivas**: cards de craque, recordes, sequências e momentos compartilháveis;
  temas animados e exportação sem marca d'água são possibilidades Premium.
- **Loja e aluguel**: venda/aluguel, estoque, retirada associada à reserva e lançamento
  automático na carteira.

O `supabase/schema.sql` contém as tabelas e políticas RLS correspondentes:
`multi_sport_scoreboards`, `scoreboard_segments`, `chat_channels`, `chat_participants`,
`chat_messages`, `wallet_ledger`, `loyalty_plans`, `loyalty_subscriptions`,
`sports_staff`, `staff_assignments`, `open_slot_offers`, `digital_waivers`,
`waiver_acceptances`, `sport_highlights`, `commerce_listings`, `rental_orders` e
`device_push_tokens`.

### Notificações push

`expo-notifications` foi configurado no `app.config.js`. A central permite solicitar
permissão e dispara uma confirmação local. Para push remoto, salve o Expo Push Token em
`device_push_tokens` e envie pelo backend/Edge Function. Desde o SDK 53, push remoto do
`expo-notifications` não funciona no Expo Go do Android; para testar de verdade é
necessário um **development build**. Referência SDK 57:
https://docs.expo.dev/versions/v57.0.0/sdk/notifications/

## Monetização e pagamentos

Assinatura e rateio da quadra ainda usam o fluxo demonstrativo. A operação de consumo
do estabelecimento já possui o contrato completo de gateway, Edge Functions e webhook;
sem credenciais configuradas, continua em modo demonstração para não movimentar dinheiro.

- **Assinatura Premium individual** (`src/components/PremiumSection.tsx`, tela
  Perfil): é mensal de verdade — `player.premiumUntil` guarda até quando o período
  pago vale (`src/lib/premium.ts`); sem renovar, `isPremiumActive()` passa a retornar
  `false` e o jogador perde os benefícios (sem anúncios, fundo de foto exclusivo na
  carta). O checkout é simulado, mas a intenção
  é que a assinatura seja **gerenciada pela App Store / Google Play** (cobrança,
  renovação e cancelamento ficam por conta delas, não do nosso app) — por isso o botão
  "Gerenciar assinatura" já abre a tela nativa de assinaturas de cada loja.
- **Anúncios** (`src/components/AdBanner.tsx`): banner do **AdMob real**
  (`react-native-google-mobile-ads`, via `src/lib/ads.ts`) para quem não é Premium
  nem já pagou o rateio de algum jogo (`src/hooks/useIsAdFree.ts`), em Agenda e
  Elenco. Sem `.env` preenchido, usa os IDs de **teste** do Google (anúncios de
  teste, sem receita real) — veja "Configurar o AdMob" abaixo. No **web** o SDK não
  tem suporte (é nativo), então cai automaticamente num "house ad" local
  (`src/lib/ads.web.ts`).
- **Rateio do jogo / "vaquinha"** (`src/components/PaymentSplitSection.tsx`): o admin
  define o custo da quadra (na agenda ou direto no jogo), o app calcula o valor por
  pessoa e cada jogador confirmado pode "marcar como pago". O admin também marca
  manualmente (ex.: quem pagou em dinheiro). Nenhum Pix/cartão é processado de fato.

### Como conectar pagamento e anúncios de verdade

| Recurso | O que trocar | Sugestão de provedor |
|---|---|---|
| Assinatura Premium | `PremiumSection.handleConfirm` → chamar a compra nativa real (IAP) e só marcar `premiumUntil` a partir do webhook/callback do provedor confirmando a assinatura (não do clique no botão) | [RevenueCat](https://www.revenuecat.com/) por cima de IAP da App Store/Google Play — é quem sincroniza `premiumUntil`/auto-renovação de verdade |
| Rateio da quadra (Pix/cartão) | `PaymentSplitSection` → em vez de `setPaymentStatus` direto, abrir um checkout (Pix Copia-e-Cola, link de pagamento) e só marcar `paid` via webhook confirmando o pagamento | [Mercado Pago](https://www.mercadopago.com.br/developers) ou [Stripe](https://stripe.com/br) (ambos têm Pix) |
| Anúncios | Já integrado — só falta configurar sua conta AdMob (veja abaixo) | [react-native-google-mobile-ads](https://docs.page/invertase/react-native-google-mobile-ads) (AdMob) — requer EAS Build/dev client, não funciona no Expo Go |

Qualquer integração de pagamento real roda no backend (Supabase Edge Functions), valida
o pagamento no provedor e usa uma função SQL transacional antes de dar baixa. O clique do
cliente nunca marca uma cobrança real como paga.

### Configurar o AdMob

1. Crie um app no [console do AdMob](https://apps.admob.com/) (um para Android, um
   para iOS) e uma unidade de anúncio do tipo **Banner** em cada um.
2. Copie `.env.example` para `.env` e preencha:
   ```
   EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   EXPO_PUBLIC_ADMOB_IOS_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY
   EXPO_PUBLIC_ADMOB_BANNER_ID_ANDROID=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   EXPO_PUBLIC_ADMOB_BANNER_ID_IOS=ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ
   ```
   Deixando em branco, o app usa os IDs de teste do Google (`TestIds.BANNER`) e
   os App IDs de teste já configurados em `app.config.js`.
3. Como o App ID é lido em tempo de build nativo (não só no bundle JS), depois de
   mudar o `.env` é preciso gerar um novo build (`eas build`) ou rodar
   `npx expo prebuild --clean` antes de testar localmente — **não funciona no Expo
   Go**, só em dev client / build gerado pelo EAS.
4. Se for buildar pela EAS Build (nuvem), configure essas mesmas variáveis também
   em *Project settings → Environment variables* no [expo.dev](https://expo.dev),
   já que o `.env` local não é enviado para o servidor de build.

## Grupos, convidados e convites

- Um jogador pode fazer parte de **mais de uma pelada** (`useAppStore.currentPeladaId`
  + `src/hooks/useCurrentPelada.ts`); a Agenda mostra um seletor de pelada quando o
  jogador está em mais de uma. Gols na carta mostram o total geral, e o Perfil lista o
  detalhe por grupo (`computePlayerGoalStatsByGroup`, em `src/lib/goals.ts`).
- **Criar uma pelada nova** (`app/criar-pelada.tsx`, `useAppStore.createPelada`):
  qualquer jogador pode fundar uma pelada — vira admin dela na hora, com um
  `inviteCode` gerado automaticamente. Não tem limite: o mesmo jogador pode ser
  dono/admin de quantas peladas quiser, além de continuar membro comum de outras.
  Acessível pelo seletor de pelada (Agenda → trocar pelada → "Criar uma pelada nova").
- **Convite**: cada pelada tem um `inviteCode` único. No Admin, "Convidar jogadores"
  mostra o código e compartilha (via `Share.share`, que inclui WhatsApp entre as
  opções) uma mensagem pronta. Quem recebe usa a tela `/entrar-pelada` pra virar
  membro (`useAppStore.joinPeladaByCode`).
- **Convidados avulsos**: o admin pode adicionar alguém que não tem o app direto na
  chamada de um jogo específico ("+ Adicionar convidado", em `useAppStore.addGuest`).
  Entra confirmado (ou na espera, se lotado), participa do sorteio normalmente, e
  aparece com uma badge "Convidado" — mas não vira membro da pelada nem aparece no
  Elenco.
- **Bolsa de jogadores livres** (`src/lib/geo.ts`, `FreeAgentSection`,
  `NearbyFreeAgentsSection`, `FreeAgentInvitesSection`): jogador ativa opt-in no
  Perfil (localização via `expo-location`, raio em km, disponibilidade por
  dia/horário). Admin de um jogo busca quem está livre perto (distância + horário
  batendo) e manda convite pra esse jogo específico, mesmo sem a pessoa ser membro da
  pelada. Quem recebe aceita/recusa no Perfil ("Convites pra jogar"); aceitar confirma
  presença normalmente.
- **Permissões dos membros** (`Pelada.memberInvitePermissions`, Admin → "Permissões dos
  membros"): por padrão só admin convida gente — só admin busca/convida jogador livre
  pra um jogo, e só admin vê o código de convite da pelada. O admin liga cada
  permissão separadamente: "convidar jogador livre pro próximo jogo" libera a busca de
  jogador livre (`NearbyFreeAgentsSection`) pra qualquer membro dentro da tela do jogo;
  "convidar gente pra entrar na pelada" faz o código de convite (`InvitePeladaSection`)
  aparecer também na aba Jogadores pra qualquer membro, não só no Admin.

## Checklist para implantação real

- ✅ Schema, RLS, gatilhos, migrações, Auth, tipos gerados e Edge Functions publicados
  no projeto Supabase vinculado em 8 de outubro de 2026.
- Migrar, por agregado, chamada, cronômetro, agenda e comandas das stores persistidas
  para queries e Realtime. Até essa migração, esses módulos continuam com cache local.
- Configurar Vault, credenciais e webhooks dos gateways; validar estorno, duplicidade,
  chargeback e conciliação antes de movimentar dinheiro real.
- Gerar development builds para câmera, push, AdMob e SDKs SoftPOS; esses recursos não
  devem ser homologados somente pelo Expo Go.
- Cadastrar políticas de privacidade, termos, retenção de dados, canal de moderação e
  responsáveis operacionais antes de abrir cadastro público.
- Instrumentar falhas, funil de reserva, pagamento, retenção e cancelamento em uma
  ferramenta de observabilidade sem enviar dados médicos ou segredos.

## Redesign — decisões tomadas

Acompanhando também em https://www.figma.com/design/gSP52KL2snZVqMqchrKHwF (telas
prontas lá: Login, Cadastro, Agenda + componentes base — pausado por limite de cota do
plano Figma; o que já foi decidido abaixo já está implementado direto no código).

- ✅ **Paleta menos monocromática em verde** — fundo/cards em grafite neutro
  (`src/constants/theme.ts`), cor de destaque variando por aba (Agenda=verde,
  Jogadores=azul, Perfil=dourado, Admin=roxo).
- ✅ **Carta do jogador estilo "abertura de pacote" do FIFA** — mostra Ataque, Defesa e
  Velocidade, gradiente de 3 tons por faixa e brilho diagonal
  (`src/components/PlayerCard.tsx`).
- ✅ **Cor da carta só pela nota geral, sem escolha manual** — o jogador **não** escolhe
  mais uma cor pra carta; a única personalização é a **foto de fundo** (Premium), e a
  cor da faixa (bronze/prata/ouro/especial, de `overallTier()` em `src/lib/ratings.ts`)
  sempre aparece por cima como uma camada semi-transparente, tanto com foto quanto sem.
  O antigo seletor de cores (`src/constants/cardStyles.ts`) foi removido.
- **Customização extra de carta no plano Premium** — além da foto de fundo, detalhes
  adicionais ainda a definir pelo dono do produto.
- **Rateio da quadra**: confirmado que o comportamento atual (recalcula o valor por
  pessoa ao vivo conforme gente confirma/desiste, em vez de travar um valor fixo) é
  o desejado — nenhuma mudança necessária em `PaymentSplitSection`/`getSplitAmount`.

## Dono de campo/quadra + e-commerce (escopo grande, em fases)

Pedido do dono do produto — priorizado assim: (1) dono do campo + conta pra receber ✅,
(2) agendamento multi-campo ✅, (3) e-commerce (loja única do app pra começar).

- ✅ **Estabelecimento e conta pra receber** (`Establishment` em `src/types/index.ts`,
  ações em `useAppStore.ts` — acessível em Perfil → "🏟️ Sou dono de um campo"): qualquer
  jogador pode cadastrar um estabelecimento independente de pelada, escolhendo receber
  via **Pix** (chave cadastrada) ou **combinar na hora**. Gera um `accessCode` único pra
  compartilhar.
- ✅ **Um dono pode ter vários estabelecimentos, cada um com suas próprias telas**
  (`app/estabelecimento/`): `/estabelecimento` lista todos os estabelecimentos do dono
  e cadastra um novo; cada um abre em `/estabelecimento/[id]` — um painel próprio (modo
  "dono de campo", cor de destaque roxa pra se diferenciar do modo jogador) com
  `EstablishmentSwitcher` pra trocar rápido entre eles, estatísticas rápidas e links pra
  páginas dedicadas: **Campos** (`[id]/campos.tsx`), **Agendamento**
  (`[id]/agendamento.tsx`), **Campeonatos** (`[id]/campeonatos.tsx`) e **Financeiro**
  (`[id]/financeiro.tsx`) — antes tudo isso vivia empilhado numa página só.
- ✅ **Campo vinculado ao estabelecimento**: em Admin → Campos, o admin da pelada cola o
  código do estabelecimento (`useAppStore.linkFieldToEstablishment`) pra vincular aquele
  campo ao dono real — sem isso, o campo funciona exatamente como antes (rateio
  combinado por fora). `Field.establishmentId` é opcional/retrocompatível.
- ✅ **Pagar por mim e por outro jogador**: na tela do jogo, `PaymentSplitSection` mostra
  um banner "Recebe [estabelecimento] via Pix/na hora" quando o campo tem dono
  cadastrado, e quem ainda não pagou pode expandir "+ Pagar também por outra pessoa"
  pra cobrir a própria parte + de outros confirmados numa única ação
  (`useAppStore.payForPlayers`) — o destino do dinheiro continua sendo só o
  estabelecimento, o que muda é quem fisicamente paga. A lista "Quem já pagou" mostra
  "pago por [nome]" quando alguém cobriu a parte de outro.
- ✅ **Campeonatos** (`src/lib/championship.ts`, telas em `app/campeonato/**`): o dono do
  estabelecimento cria um campeonato (pontos corridos ou mata-mata), gera um código de
  inscrição. Times entram vindos de uma pelada (reaproveita elenco) ou avulsos
  (jogadores digitados na hora, sem precisar de conta). O dono gera a tabela de jogos —
  pontos corridos monta todos os confrontos (método do círculo); mata-mata monta o
  chaveamento com byes e avança o vencedor de fase em fase automaticamente. Cada
  confronto tem cronômetro/placar próprios, com pênaltis pra desempate no mata-mata.
  Classificação e artilharia são calculadas ao vivo. **Não depende de dono de campo**: um
  admin de pelada também pode criar um campeonato direto (`app/time/[id].tsx`, seção
  "Campeonatos" — `Championship.organizerPeladaId`), sem estabelecimento por trás — mesmo
  motor (tabela, cronômetro, classificação), só sem taxa de inscrição (não tem pix
  cadastrado pra receber) e sem entrar no relatório financeiro do estabelecimento.
- ✅ **Precificação da inscrição** (`app/campeonato/[id]/orcamento.tsx` e
  `calculateChampionshipPricing`): o organizador informa custos por partida (quadra,
  árbitro, auxiliar e mesário/apoio), gastos fixos (premiação, troféus, atendimento
  médico, segurança, divulgação, material, limpeza, água/alimentação, licenças e outros),
  taxa do gateway, reserva para imprevistos e lucro desejado. O app calcula quantas
  partidas o formato exige, ponto de equilíbrio, inscrição recomendada por time,
  receita, taxas e lucro/margem finais. O orçamento fica privado em
  `championship_budgets` e a recomendação pode atualizar a taxa pública do campeonato.
- ✅ **Emblema do time** (`src/lib/teamLogo.ts`, na inscrição do time): escolhe uma foto da
  galeria ou gera por IA a partir de uma descrição (ex.: "leão dourado com bola de
  futebol"). Ver "Configurar geração de emblema por IA" abaixo.
- ✅ **Campos próprios do estabelecimento, um por esporte** (`[id]/campos.tsx`): além de
  vincular campos que já pertencem a uma pelada (fluxo antigo, também listados aqui como
  "Campos vinculados de peladas"), o dono cadastra campos direto no próprio
  estabelecimento — sem depender de nenhuma pelada (`Field.peladaId` é opcional) —
  escolhendo o esporte de cada um (`Field.sportId`). Assim um único estabelecimento cobre
  vários esportes (ex.: quadra de society, quadra de vôlei, quadra de basquete, arena de
  areia pro futevôlei). Na hora de criar um campeonato, o campo é escolhido
  automaticamente pelo esporte do campeonato.
- ✅ **Agendamento de campo** (`FieldBooking` em `src/types/index.ts`,
  `src/lib/fieldBooking.ts`, `[id]/agendamento.tsx`): o dono reserva um campo pra um time
  cadastrado (uma pelada existente) ou avulso (só o nome), de uma vez só ("Só uma vez" +
  data) ou **fixo** ("Fixo (toda semana)" + dia da semana — ex.: toda quinta 20h aquele
  time já está lá). Bloqueia conflito: não dá pra reservar o mesmo campo com horário
  sobreposto a uma reserva existente, single ou fixa (`findBookingConflicts`, considera
  fixo x fixo, fixo x avulsa no mesmo dia da semana, e avulsa x avulsa só na mesma data).
- ✅ **Agendamento automático por mínimo de jogadores + Evolution Go**
  (`BookingAutomationCard`, `app/time/[id]/agendamento-automatico.tsx` e
  `supabase/functions/{request-field-booking,evolution-go-webhook}`): cada agenda define
  se a automação está ativa, o mínimo de confirmados e o prazo de resposta. O admin
  ordena campos preferidos; ao atingir o mínimo, o backend solicita o primeiro horário
  realmente disponível por WhatsApp. O dono responde `SIM BJ-XXXX` ou `NÃO BJ-XXXX`.
  O aceite passa por `respond_game_booking_request`, que bloqueia a solicitação, confere
  conflito novamente, cria a reserva e muda o campo do jogo numa única transação; depois
  todos os membros com telefone recebem a confirmação. A recusa oferece próximo campo ou
  enquete. A tela do jogo contém botões de resposta somente como **modo apresentação**;
  em produção a autoridade é o webhook.
- ✅ **Enquete de novos horários**: quando o campo recusa, o admin gera opções a partir
  das janelas publicadas em `field_availabilities`, já removendo reservas conflitantes.
  Cada membro vota uma vez e pode trocar seu voto. O admin escolhe a opção vencedora,
  atualiza o horário do jogo e abre uma nova solicitação ao campo. O dono publica dias,
  faixa de horário, tamanho do bloco e preço em **Estabelecimento → Agendamento**.
- ✅ **Quórum e lembretes da enquete**: cada agenda define o percentual mínimo de
  membros que precisa votar e depois de quantos minutos lembrar quem ainda não respondeu.
  Sem quórum o botão de escolha fica bloqueado. No backend,
  `send-poll-reminders` pode rodar no Cron e envia somente para opt-ins ainda sem voto.
- ✅ **Sinal, cancelamento e reembolso da reserva**: o estabelecimento configura o
  percentual do sinal, a antecedência e o percentual reembolsável. Depois do `SIM` do
  campo, o admin gera a cobrança pelo gateway conectado; cancelar antes do limite marca
  reembolso, e fora da política marca o sinal como retido. Em produção, a confirmação e
  o estorno são feitos pelo PSP/webhook, nunca pelo botão do cliente.
- ✅ **Campos patrocinados sem esconder publicidade**: `field_promotions` fornece as
  sugestões monetizadas do BoraJogo. Elas aparecem com selo **Patrocinado**, depois da
  lista definida pelo time, e só entram na lista principal quando o admin adiciona. O
  modelo recomendado é taxa fixa por reserva confirmada, complementado por assinatura
  do estabelecimento para agenda, automação e relatórios.
- ✅ **Painel comercial e recomendações** (`[id]/promocoes.tsx` e
  `recommendFields`): o dono publica campanhas com orçamento e preço por reserva
  confirmada e acompanha tentativas, conversão e receita estimada. Para o time, campos
  compatíveis são pontuados por distância aproximada, menor preço, avaliação e taxa de
  cancelamento; publicidade continua separada e identificada.
- ✅ **Página pública do estabelecimento** (`app/estabelecimento/publico/[id].tsx`): link
  compartilhável — gerenciado numa página própria do dono, `[id]/publico.tsx` (acessível
  pelo card "Página pública" do grid de navegação em `[id]/index.tsx`, junto com
  Campos/Agendamento/Campeonatos/Financeiro), que também lista as reservas que já vieram
  por ali — que qualquer pessoa abre sem estar logada nem fazer parte de nenhuma pelada —
  vê os campos e marca um jogo avulso (reaproveita `addFieldBooking`/`findBookingConflicts`,
  mesmo bloqueio de conflito de horário do fluxo interno). Se quem está marcando ainda não
  tem conta no device, o próprio formulário pede nome + telefone e já cria o perfil de
  jogador e loga (`updateCurrentPlayerProfile` + `useAuthStore.login`) antes de confirmar a
  reserva — não precisa passar pela tela de cadastro separada. RLS:
  `field_bookings_insert_self` deixa qualquer jogador autenticado criar uma reserva avulsa
  em nome próprio; editar/cancelar continua exclusivo do dono do estabelecimento.
- ✅ **Compartilhar a tabela do campeonato como imagem** (`src/lib/shareImage.ts`, botão de
  compartilhar no card "Classificação" em `app/campeonato/[id]/index.tsx`): gera um PNG só
  com o nome do campeonato + a tabela de classificação (sem o resto da tela) e abre a folha
  de compartilhamento nativa do aparelho (`react-native-view-shot` + `expo-sharing`); na
  web, como não dá pra compartilhar arquivo local direto, baixa a imagem pro dispositivo em
  vez disso (`dom-to-image`, ver `Platform.OS === 'web'` em `shareViewAsImage`).
- ✅ **Relatório financeiro** (`src/lib/establishmentFinance.ts`, `[id]/financeiro.tsx`):
  soma o que já é rastreado no app — rateio de jogo pago (`payments` com status "paid",
  valor = custo da quadra ÷ confirmados no momento) e taxas de inscrição de campeonato
  (times confirmados × `entryFee`) — sem inventar nenhuma fonte de receita nova. Mostra
  total recebido (filtro "todo o período" ou "este mês"), quebra por campo e lista de
  transações recentes.
- ✅ **Lanchonete, comandas e pedidos** (`app/operacao/**`): catálogo por categoria,
  preço, estação de preparo e estoque simples; comanda por cliente/mesa/quadra, vários
  participantes e vários pedidos. Cozinha e bar operam cada item em recebido → preparo →
  pronto → entregue. Cancelamento exige motivo e preserva o histórico. A comanda aceita
  pagamentos parciais/divididos em Pix, cartão ou dinheiro e só fecha com saldo zero.
  Cada item também pode ser **rachado entre consumidores**: `OrderItemShare` guarda as
  partes em centavos (incluindo ajuste determinístico do resto), e
  `SalePaymentAllocation` registra exatamente quais partes cada pagamento quitou. Assim
  uma Coca-Cola de R$ 12 pode virar quatro partes de R$ 3, e uma pessoa pode pagar a
  própria parte mais a de outra em um único Pix de R$ 6. Isso é separado da cota da quadra.
- ✅ **Gateway escolhido pelo dono** (`app/estabelecimento/[id]/pagamentos.tsx`): cada
  estabelecimento escolhe Sicoob, Inter, Mercado Pago, PicPay ou Pix manual. Mercado Pago
  e PicPay aceitam Pix e cartão; as opções bancárias são focadas em Pix. A configuração
  pública fica em `PaymentGatewayConnection`, mas token/certificado fica somente no
  Supabase Vault. No modo mock, a conexão e o webhook são simulados para testar todo o
  fluxo sem cobrança real.
- ✅ **Pagamento por aproximação (SoftPOS)**: no fechamento da comanda o caixa pode
  selecionar **Aprox.**, escolher as partes que uma pessoa vai quitar e ativar o leitor.
  O cliente aproxima cartão, relógio ou outro celular com Apple Pay/Google Pay. Mercado
  Pago usa Point Tap/Tap to Pay; PicPay fica disponível quando a conta possui Tap on
  Phone homologado. A intenção mantém o mesmo vínculo com `OrderItemShare`, portanto um
  único pagamento pode quitar a parte do pagador e de outras pessoas. A resposta local
  do NFC nunca dá baixa sozinha: o webhook validado continua sendo a autoridade.
- ✅ **Backend de cobrança de consumo** (`supabase/functions/create-sale-payment` e
  `supabase/functions/payment-webhook`): Mercado Pago usa Orders API para Pix e checkout
  hospedado para cartão; PicPay usa Payment Link para Pix/cartão. O webhook revalida o
  pagamento e chama `settle_sale_payment_intent`, que cria pagamento, aloca as partes e
  atualiza a comanda numa transação. Sicoob/Inter exigem certificado mTLS e homologação
  por conta, então o contrato está preparado, mas o adaptador bancário depende das
  credenciais/certificados de cada estabelecimento.
- ✅ **Vaquinhas do time** (`app/time/[id]/vaquinhas.tsx` e `app/vaquinha/[id].tsx`):
  campanhas separadas da cota da quadra para bola, churrasco, uniforme, viagem,
  premiação ou objetivo livre. O admin informa meta, sugestão e prazo; um membro pode
  contribuir por si ou creditar outra pessoa, via Pix/cartão/dinheiro, com opção de nome
  anônimo. A tela mostra progresso, saldo, despesas e comprovantes. O recebedor é definido
  na campanha e o dinheiro liquida direto em sua conta conectada; o BoraJogo não mantém
  carteira nem custódia. `create-community-payment` reaproveita Mercado Pago/PicPay e o
  `payment-webhook` confirma tanto contribuições quanto sinais de reserva.
- ✅ **Caixa e conciliação** (`app/operacao/caixa.tsx`): abertura com fundo inicial,
  fechamento com valor contado e diferença, e visão consolidada de quadras, alimentação
  e aulas. As origens continuam separadas: `Payment` é rateio, `SalePayment` é consumo e
  `ClassEnrollment` registra a cobrança da aula.
- ✅ **Aulas em turma e particulares** (`app/operacao/aulas.tsx`,
  `app/operacao/aula/[id].tsx` e `app/aulas.tsx`): programas por esporte, professor,
  campo, nível, capacidade, duração e cobrança avulsa/pacote/mensal. A store e um trigger
  transacional no Supabase bloqueiam conflito com aula, jogo ou campeonato. Há aula
  experimental, pagamento, chamada, falta justificada com crédito de reposição, lista de
  espera com promoção automática e cancelamento/reembolso preservando o histórico.
- ✅ **Papéis operacionais e RLS**: `EstablishmentStaff` separa gerente, caixa, cozinha e
  professor. Cardápio e oferta de aulas são públicos; comanda, caixa, matrícula e chamada
  ficam restritos ao cliente envolvido ou à equipe do estabelecimento.
- **Aluguel de bola, coletes etc.**: item avulso associado a uma reserva — depende do
  agendamento acima existir primeiro.
- **E-commerce**: venda (não aluguel) de coletes, uniforme, bolas, chuteiras — catálogo,
  carrinho, checkout, pedidos. Loja única do app pra começar (não multi-vendedor).

### Configurar geração de emblema por IA

O emblema do time pode ser gerado por IA a partir de uma descrição, usando a API de
imagens da OpenAI (`gpt-image-1`). **A chave da OpenAI nunca fica no app** — ela mora
só numa Supabase Edge Function (`supabase/functions/generate-team-logo`), que o
cliente chama por `supabase.functions.invoke(...)`.

1. Configure o Supabase de verdade (ver "Configurando o Supabase" acima).
2. Faça o deploy da função: `supabase functions deploy generate-team-logo`.
3. Configure a chave só no servidor: `supabase secrets set OPENAI_API_KEY=sk-...`
   (nunca em `.env`/`EXPO_PUBLIC_*` — isso vai pro bundle do app e fica público).
4. Sem Supabase configurado (modo mock) ou se a função falhar, o app cai automaticamente
   num gerador de emblema de exemplo (`api.dicebear.com`, grátis, sem chave) — assim dá
   pra testar o fluxo inteiro sem precisar de conta na OpenAI.

### Configurar Evolution Go e WhatsApp

1. Suba uma instância da [Evolution Go](https://github.com/evolution-foundation/evolution-go),
   conclua a ativação/licenciamento e conecte o número pelo QR Code.
2. Aplique `supabase/schema.sql` e publique:
   `supabase functions deploy trigger-auto-booking --no-verify-jwt`,
   `supabase functions deploy request-field-booking` e
   `supabase functions deploy evolution-go-webhook --no-verify-jwt`,
   `supabase functions deploy meta-whatsapp-webhook --no-verify-jwt`,
   `supabase functions deploy expire-booking-requests --no-verify-jwt` e
   `supabase functions deploy send-poll-reminders --no-verify-jwt`.
3. Grave os segredos somente no backend:
   `supabase secrets set EVOLUTION_GO_URL=https://... EVOLUTION_GO_API_KEY=... EVOLUTION_GO_WEBHOOK_SECRET=... BOOKING_AUTOMATION_WEBHOOK_SECRET=... BOOKING_AUTOMATION_CRON_SECRET=...`.
4. Configure o webhook da instância para a categoria `MESSAGE` apontando para
   `https://PROJECT.supabase.co/functions/v1/evolution-go-webhook?secret=SEGREDO`.
5. Em **Database → Webhooks**, crie um webhook para INSERT/UPDATE de `attendances`, URL
   `https://PROJECT.supabase.co/functions/v1/trigger-auto-booking`, com o header
   `x-automation-secret` igual ao segredo do passo 3.
6. No painel do estabelecimento, cadastre o WhatsApp comercial e ative o consentimento.
   O número é normalizado para DDI + DDD + número. Nunca coloque a chave da Evolution em
   `EXPO_PUBLIC_*`, AsyncStorage ou no bundle do aplicativo.
7. A Evolution Go usa uma sessão baseada no WhatsApp Web. Para operação comercial em
   escala, mantenha a integração atrás de um provedor e considere a API oficial WhatsApp
   Cloud como alternativa para reduzir risco de desconexão/bloqueio. A licença da
   Evolution Go também exige uma notificação visível aos administradores informando seu uso.

Para contingência oficial, configure também
`META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_ACCESS_TOKEN`,
`META_WHATSAPP_VERIFY_TOKEN` e, opcionalmente, `META_GRAPH_VERSION`. Cadastre
`meta-whatsapp-webhook` no painel da Meta. Com provedor **Automático**, o backend tenta
Evolution Go e cai para a Cloud API se houver falha; o log guarda provedor e fallback.

Agende `expire-booking-requests` no Supabase Cron a cada cinco minutos, enviando o header
`x-cron-secret`. Solicitações vencidas deixam de bloquear novas tentativas e o admin recebe
um aviso para tentar o próximo campo ou abrir a enquete.
Agende `send-poll-reminders` a cada 15 minutos com o mesmo header; cada enquete é lembrada
uma única vez, no prazo configurado pela agenda.

Mensagens interativas não são necessárias: os comandos são texto simples com código de
correlação. O webhook aceita apenas o telefone cadastrado do estabelecimento, ignora
mensagens enviadas pela própria instância e usa o ID da mensagem como idempotência.

#### Roteiro de apresentação (modo demonstração)

1. Abra **Agenda → jogo de quinta**: a chamada já tem 15/15 e mostra a solicitação
   `BJ-7F2K` enviada à Arena Society Central.
2. Toque em **NÃO BJ-7F2K** para representar a resposta do dono do campo.
3. Escolha **Perguntar outros horários ao time**, vote numa opção e mostre a contagem.
4. Como admin, toque em **Escolher**: o jogo muda de horário e envia uma nova solicitação.
5. Em uma sessão limpa, toque em **SIM BJ-7F2K**: a reserva é confirmada e o time é avisado.
6. Em **Admin → Agendamento automático**, mostre mínimo, prazo, ordem dos campos e a
   sugestão patrocinada. Em **Dono do campo → Agendamento**, mostre as janelas publicadas.

Os botões SIM/NÃO só existem no modo mock para a demonstração não depender de internet.
Com Supabase configurado, a mesma mudança de estado vem exclusivamente do webhook.

### Configurar gateways de consumo

1. Aplique `supabase/schema.sql` e publique:
   `supabase functions deploy create-sale-payment` e
   `supabase functions deploy create-community-payment` e
   `supabase functions deploy payment-webhook`.
2. Configure `PAYMENT_WEBHOOK_URL` com a URL pública de `payment-webhook` e crie um
   `PAYMENT_WEBHOOK_TOKEN` longo/aleatório para a URL cadastrada no PicPay.
3. Para cada estabelecimento, crie no Supabase Vault um segredo JSON e coloque o UUID
   em `payment_gateway_connections.credential_secret_id`:
   - Mercado Pago: `{"accessToken":"APP_USR-...","payerEmail":"..."}`. Para várias
     contas, obtenha o token de cada vendedor por OAuth Authorization Code/PKCE.
   - PicPay: `{"accessToken":"...","redirectUrl":"https://..."}`.
4. Cadastre no provedor a URL de webhook com `provider` e `connection`, por exemplo:
   `.../payment-webhook?provider=mercado_pago&connection=UUID_DA_CONEXAO`.
   No PicPay inclua também `hook_token` com o segredo configurado no passo 2.
5. Nunca use token em variável `EXPO_PUBLIC_*`, AsyncStorage ou tabela legível pelo
   aplicativo. O cliente vê somente o nome da conta e o status da conexão.

#### Ativar pagamento por aproximação

O fluxo visual e o contrato de dados já estão implementados em
`src/lib/contactlessPayments.ts`. Em modo mock ele é totalmente simulável. Em produção,
SoftPOS não é uma leitura NFC comum e **não funciona no Expo Go nem na web**: é necessário
um development/production build com o SDK certificado do provedor.

1. O estabelecimento conecta Mercado Pago ou PicPay e solicita ao provedor a habilitação
   de Point Tap/Tap to Pay ou Tap on Phone para a conta.
2. O build nativo fornece o módulo `PeladaContactless`, com o método
   `startPayment({ intentId, amountCents, provider })`. O módulo deve usar exclusivamente
   o SDK homologado entregue pelo PSP; não use bibliotecas NFC genéricas para ler cartões.
3. No iPhone, solicite à Apple o entitlement de Tap to Pay e use um PSP participante. No
   Android, o aparelho precisa de NFC e atender aos requisitos de integridade do SoftPOS.
4. Marque `payment_gateway_connections.contactless_enabled = true` somente depois da
   homologação daquele estabelecimento/build.
5. Configure o webhook do PSP. Mesmo se o SDK retornar “aprovado”, somente
   `payment-webhook` chama `settle_sale_payment_intent` e quita a comanda.

Enquanto o SDK comercial não estiver presente, o app mostra a causa da indisponibilidade
em vez de fingir uma cobrança. O Pix continua disponível como opção de menor custo.

Referências oficiais usadas na integração: [Pix/Orders do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/pix),
[OAuth do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation),
[Pix do PicPay](https://developers-business.picpay.com/pix/docs/api/charge-pix) e
[Payment Link do PicPay](https://developers-business.picpay.com/payment-link/docs/api/create-charge).
Para aproximação, consulte também [Tap to Pay no iPhone — provedores no Brasil](https://developer.apple.com/tap-to-pay/regions/)
e [Point Tap do Mercado Pago](https://www.mercadopago.com.br/developers/pt/support/23846).

## Multi-esporte

O app não é só de futebol — cada pelada, campeonato e jogador tem um esporte associado,
e a terminologia, cor de destaque e o sorteio de times se adaptam de acordo
(`src/constants/sports.ts` é a fonte única de verdade: `SPORTS` lista os 5 esportes
suportados — Futebol, Vôlei, Basquete, Handebol e Futevôlei — cada um com ícone, cor,
`hasGoalkeeper` e o rótulo de pontuação singular/plural).

- **Jogador**: no cadastro (`app/(auth)/cadastro.tsx`), escolhe um ou mais
  **esportes favoritos** (`Player.favoriteSports: string[]`) — é multi-esporte, não
  trava em um só. Usado como sugestão de terminologia na própria carta e pra filtrar
  o pool de "jogadores livres" (só aparece pra convite em jogos do esporte que ele
  marcou como favorito).
- **Pelada**: tem um `sportId` fixo (em Admin → "Sobre a pelada"), decidido na criação
  do grupo. Quando é `'futebol'`, ainda guarda a variante (`footballVariant`:
  society/futsal/campo) só pra contexto, sem afetar terminologia/goleiro. A cor de
  destaque do esporte aparece no nome da pelada (`PeladaSwitcher`) e como faixa lateral
  nos cards de jogo (`GameCard`).
- **Campeonato**: o dono do estabelecimento escolhe o esporte ao criar
  (`app/estabelecimento/[id]/campeonatos.tsx`), independente do esporte das peladas donas
  dos times inscritos — um campeonato de vôlei pode aceitar um time avulso mesmo que a pelada de
  origem de algum jogador seja de futebol.
- **Terminologia gol/ponto**: `scoreLabel(sportId, count)` decide "gol/gols" (futebol,
  handebol) vs. "ponto/pontos" (vôlei, basquete, futevôlei) — usado no placar ao vivo
  (`app/jogo/[id]/cronometro.tsx`, `app/campeonato/[id]/partida/[matchId].tsx`), na
  carta do jogador e na artilharia/classificação do campeonato.
- **Sorteio sem goleiro**: `src/lib/teamDraft.ts` já era agnóstico a isso — a
  distribuição de goleiros só roda se a lista de goleiros não estiver vazia. A tela de
  sorteio (`app/jogo/[id]/sorteio.tsx`) agora só marca um jogador como goleiro
  (`isGoalkeeper`) quando o esporte da pelada tem goleiro (`hasGoalkeeper`); pra vôlei,
  basquete e futevôlei, todo mundo entra como "linha" e o distintivo 🧤 nem aparece.
