# Pelada

App em Expo (React Native) para organizar futebol amador: agenda de jogos, chamada
com limite de vagas, sorteio de times (ordem de chegada, aleatório ou por nota),
cronômetro com fila de rodízio, avaliações estilo carta de FIFA e punição para quem
falta depois de confirmar presença.

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

Assim que o Supabase for configurado (próxima seção), a ideia é trocar as chamadas
das stores por queries reais ao Supabase (o cliente já está pronto em
`src/lib/supabase.ts`, exportando `isMockMode` para você saber qual modo está ativo).

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

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e um novo projeto.
2. No **SQL Editor** do projeto, rode o conteúdo de `supabase/schema.sql` — ele cria
   todas as tabelas (jogadores, peladas, campos, agenda, jogos, chamada, times,
   avaliações, punições) já com Row Level Security configurada (cada pelada só é
   visível para quem faz parte dela; só admins editam configurações).
3. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.
4. Crie um arquivo `.env` na raiz do projeto (veja `.env.example`):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
   ```
5. Reinicie o `npm run start`. Com essas variáveis definidas, `isMockMode` vira
   `false` e o cliente Supabase (`src/lib/supabase.ts`) fica pronto para uso.
6. Em **Authentication**, habilite o provedor de e-mail/senha (ou o de sua
   preferência) para o cadastro de jogadores.

> Nesta primeira entrega, as telas continuam usando as stores mockadas mesmo com o
> Supabase configurado — o próximo passo é migrar cada ação das stores
> (`src/store/useAppStore.ts`) para chamadas reais via `supabase.from(...)`, e trocar
> o cronômetro/fila de rodízio para usar **Supabase Realtime** para sincronizar entre
> os aparelhos de todos os jogadores em tempo real.

## Estrutura do projeto

```
app/                        rotas (Expo Router)
  (auth)/                    login, cadastro
  (tabs)/                    agenda, jogadores, times, perfil, admin
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

## Monetização (⚠️ simulada — não há dinheiro real envolvido)

O app tem três mecanismos de monetização implementados na camada de produto, mas
**nenhum deles está conectado a um provedor de pagamento ou anúncio real** — são
fluxos de demonstração para validar a experiência antes de integrar algo de verdade.

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

Qualquer integração de pagamento real deve rodar no backend (Supabase Edge Functions,
por exemplo) para validar webhooks e nunca confiar apenas no que o app cliente diz —
hoje, como tudo é local/mock, isso ainda não existe.

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

## Próximos passos sugeridos

- Migrar as ações da store para Supabase (auth real, dados compartilhados entre
  jogadores) e ligar o Realtime no cronômetro/fila de rodízio.
- Notificações push (Expo Notifications) para lembrar da chamada e do resultado do
  sorteio.
- Deep link real pro convite (ex.: `pelada://entrar/CODIGO`) abrir `/entrar-pelada`
  com o código já preenchido, além do fluxo manual atual.
- MVP da partida (votação pós-jogo), histórico/evolução de nota por jogador, ranking
  da pelada (artilheiro, mais assíduo), fila de espera com notificação automática de
  vaga, Pix real com QR Code no rateio, aviso de previsão do tempo, modo temporada.

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
  ações em `useAppStore.ts`, tela `app/estabelecimento.tsx` — acessível em Perfil →
  "🏟️ Sou dono de um campo"): qualquer jogador pode cadastrar um estabelecimento
  independente de pelada, escolhendo receber via **Pix** (chave cadastrada) ou
  **combinar na hora**. Gera um `accessCode` único pra compartilhar.
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
  Classificação e artilharia são calculadas ao vivo.
- ✅ **Emblema do time** (`src/lib/teamLogo.ts`, na inscrição do time): escolhe uma foto da
  galeria ou gera por IA a partir de uma descrição (ex.: "leão dourado com bola de
  futebol"). Ver "Configurar geração de emblema por IA" abaixo.
- ✅ **Campos próprios do estabelecimento, um por esporte** (`app/estabelecimento.tsx` →
  "Meus campos"): além de vincular campos que já pertencem a uma pelada (fluxo antigo),
  o dono agora cadastra campos direto no próprio estabelecimento — sem depender de
  nenhuma pelada (`Field.peladaId` agora é opcional) — escolhendo o esporte de cada um
  (`Field.sportId`). Assim um único estabelecimento cobre vários esportes (ex.: quadra de
  society, quadra de vôlei, quadra de basquete, arena de areia pro futevôlei). Na hora de
  criar um campeonato, o campo é escolhido automaticamente pelo esporte do campeonato.
- ✅ **Agendamento de campo** (`FieldBooking` em `src/types/index.ts`,
  `src/lib/fieldBooking.ts`, `app/estabelecimento.tsx` → "Agendamento"): o dono reserva
  um campo pra um time cadastrado (uma pelada existente) ou avulso (só o nome), de uma
  vez só ("Só uma vez" + data) ou **fixo** ("Fixo (toda semana)" + dia da semana — ex.:
  toda quinta 20h aquele time já está lá). Bloqueia conflito: não dá pra reservar o
  mesmo campo com horário sobreposto a uma reserva existente, single ou fixa
  (`findBookingConflicts`, considera fixo x fixo, fixo x avulsa no mesmo dia da semana,
  e avulsa x avulsa só na mesma data). Ainda não é um marketplace — só o dono cadastra,
  peladas não reservam sozinhas.
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
  (`app/estabelecimento.tsx`), independente do esporte das peladas donas dos times
  inscritos — um campeonato de vôlei pode aceitar um time avulso mesmo que a pelada de
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
