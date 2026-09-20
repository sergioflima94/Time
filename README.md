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

## Modo demonstração (sem backend)

Sem nenhuma configuração adicional, o app roda inteiro com **dados de exemplo**
(ver `src/lib/mockData.ts`) guardados no próprio aparelho via AsyncStorage
(`src/store/useAppStore.ts`, `src/store/useAuthStore.ts`). Isso permite testar todos
os fluxos — chamada, sorteio, cronômetro, avaliações, punições, admin — sem precisar
de internet ou conta em nenhum serviço.

Assim que o Supabase for configurado (próxima seção), a ideia é trocar as chamadas
das stores por queries reais ao Supabase (o cliente já está pronto em
`src/lib/supabase.ts`, exportando `isMockMode` para você saber qual modo está ativo).

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
  (tabs)/                    agenda, jogadores, perfil, admin
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
(2) agendamento multi-campo, (3) e-commerce (loja única do app pra começar).

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
- **Estabelecimento com múltiplos campos/esportes + agendamento** (próxima fase): hoje
  `Establishment` ainda não tem uma lista de campos próprios nem agenda de
  horários — o vínculo é 1 campo de pelada → 1 estabelecimento, sem marketplace de
  reserva entre peladas ainda. `Field.sport` também não existe (fica implícito no
  `Pelada.sport`).
- **Aluguel de bola, coletes etc.**: item avulso associado a uma reserva — depende do
  agendamento acima existir primeiro.
- **E-commerce**: venda (não aluguel) de coletes, uniforme, bolas, chuteiras — catálogo,
  carrinho, checkout, pedidos. Loja única do app pra começar (não multi-vendedor).
