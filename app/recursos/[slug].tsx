import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { getGrowthFeature } from '@/constants/growthFeatures';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { currency, percentage, scoreboardTotal, walletBalance } from '@/lib/growth';
import { enablePushNotifications } from '@/lib/pushNotifications';
import { useAppStore } from '@/store/useAppStore';
import { useGrowthStore } from '@/store/useGrowthStore';
import type { MultiSportScoreboard } from '@/types/growth';

export default function GrowthFeatureScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const feature = getGrowthFeature(slug);
  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <View style={[styles.headerIcon, { backgroundColor: `${feature.color}22` }]}><Ionicons name={feature.icon} size={21} color={feature.color} /></View>
        <View style={{ flex: 1 }}><Text style={styles.title}>{feature.title}</Text><Text style={styles.subtitle}>{feature.description}</Text></View>
      </View>
      <FeatureBody slug={feature.id} />
    </Screen>
  );
}

function FeatureBody({ slug }: { slug: string }) {
  if (slug === 'placar') return <Scoreboards />;
  if (slug === 'conversas') return <Conversations />;
  if (slug === 'carteira') return <Wallet />;
  if (slug === 'fidelidade') return <Loyalty />;
  if (slug === 'equipe') return <Staff />;
  if (slug === 'marketplace') return <Marketplace />;
  if (slug === 'relatorios') return <Reports />;
  if (slug === 'documentos') return <Documents />;
  if (slug === 'retrospectiva') return <Highlights />;
  return <Storefront />;
}

function Scoreboards() {
  const boards = useGrowthStore((state) => state.scoreboards);
  const addScore = useGrowthStore((state) => state.addScore);
  const finishSegment = useGrowthStore((state) => state.finishSegment);
  const [notice, setNotice] = useState('');
  return <>
    <Info text="O placar se adapta ao esporte: futebol/handebol por gols, vôlei/futevôlei por sets e basquete por quartos." />
    {boards.map((board) => <Card key={board.id} style={styles.section}>
      <ScoreHeader board={board} />
      <View style={styles.scoreTeams}>
        <ScoreTeam name={board.homeName} value={scoreboardTotal(board).home} onAdd={() => addScore(board.id, 'home')} />
        <Text style={styles.scoreSeparator}>×</Text>
        <ScoreTeam name={board.awayName} value={scoreboardTotal(board).away} onAdd={() => addScore(board.id, 'away')} />
      </View>
      <View style={styles.segmentList}>{board.segments.map((segment) => <View key={segment.id} style={styles.segmentRow}><Text style={styles.rowLabel}>{segment.label}</Text><Text style={styles.rowValue}>{segment.home} – {segment.away}{segment.finished ? '  ✓' : ''}</Text></View>)}</View>
      <Button label={board.unit === 'sets' ? 'Encerrar set' : 'Encerrar período'} variant="outline" small onPress={() => setNotice(finishSegment(board.id) ? 'Período encerrado; próximo criado automaticamente.' : 'A pontuação ainda não permite encerrar este período.')} />
    </Card>)}
    {!!notice && <Text style={styles.notice}>{notice}</Text>}
  </>;
}

function ScoreHeader({ board }: { board: MultiSportScoreboard }) {
  const sport = getSport(board.sportId);
  return <View style={styles.row}><View style={[styles.roundIcon, { backgroundColor: `${sport.color}22` }]}><Text>{sport.icon}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{board.title}</Text><Text style={styles.caption}>{board.unit === 'sets' ? `Melhor de ${board.maxSegments ?? 3} sets` : `${board.maxSegments ?? 4} períodos acumulados`}</Text></View><Badge label={board.status === 'finished' ? 'ENCERRADO' : 'AO VIVO'} color={board.status === 'finished' ? colors.textMuted : colors.danger} /></View>;
}

function ScoreTeam({ name, value, onAdd }: { name: string; value: number; onAdd: () => void }) {
  return <View style={styles.scoreTeam}><Text style={styles.scoreValue}>{value}</Text><Text style={styles.scoreName} numberOfLines={1}>{name}</Text><Button label="+1" small onPress={onAdd} /></View>;
}

function Conversations() {
  const channels = useGrowthStore((state) => state.chatChannels);
  const messages = useGrowthStore((state) => state.chatMessages);
  const sendMessage = useGrowthStore((state) => state.sendMessage);
  const notificationOptIn = useGrowthStore((state) => state.notificationOptIn);
  const pushToken = useGrowthStore((state) => state.pushToken);
  const setPushRegistration = useGrowthStore((state) => state.setPushRegistration);
  const [selectedId, setSelectedId] = useState(channels[0]?.id ?? '');
  const [text, setText] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const selected = channels.find((channel) => channel.id === selectedId);
  const visibleMessages = messages.filter((message) => message.channelId === selectedId);

  async function togglePush(value: boolean) {
    if (!value) { setPushRegistration(false, null); setPushMessage('Notificações desativadas.'); return; }
    const result = await enablePushNotifications();
    setPushRegistration(result.enabled, result.token);
    setPushMessage(result.message);
  }

  return <>
    <Card style={styles.section}>
      <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Notificações do app</Text><Text style={styles.caption}>Push para mudanças urgentes; WhatsApp continua como fallback.</Text></View><Switch value={notificationOptIn} onValueChange={togglePush} /></View>
      {!!pushMessage && <Text style={styles.notice}>{pushMessage}</Text>}
      {!!pushToken && <Text style={styles.caption}>Token registrado: {pushToken.slice(0, 18)}…</Text>}
    </Card>
    <View style={styles.chipRow}>{channels.map((channel) => <Pressable key={channel.id} onPress={() => setSelectedId(channel.id)} style={[styles.chip, selectedId === channel.id && styles.chipActive]}><Text style={[styles.chipText, selectedId === channel.id && styles.chipTextActive]}>{channel.title}{channel.unreadCount ? ` · ${channel.unreadCount}` : ''}</Text></Pressable>)}</View>
    <Card style={styles.section}>
      <Text style={styles.cardTitle}>{selected?.title}</Text>
      {visibleMessages.length === 0 ? <Text style={styles.empty}>Nenhuma mensagem ainda.</Text> : visibleMessages.map((message) => <View key={message.id} style={styles.message}><Text style={styles.messageSender}>{message.senderPlayerId === 'p1' ? 'Você' : 'Participante'}</Text><Text style={styles.messageText}>{message.text}</Text></View>)}
      <TextField label="Nova mensagem" value={text} onChangeText={setText} placeholder="Escreva para este canal" />
      <Button label="Enviar mensagem" onPress={() => { sendMessage(selectedId, 'p1', text); setText(''); }} />
    </Card>
  </>;
}

function Wallet() {
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const entries = useGrowthStore((state) => state.walletEntries);
  const addCredit = useGrowthStore((state) => state.addWalletCredit);
  const balance = walletBalance(currentPlayerId, entries);
  const mine = entries.filter((entry) => entry.playerId === currentPlayerId).slice().reverse();
  return <>
    <Card style={[styles.section, styles.balanceCard]}><Text style={styles.balanceLabel}>Saldo disponível</Text><Text style={styles.balanceValue}>{currency(balance)}</Text><Text style={styles.caption}>Pode pagar quadra, aulas, loja, campeonato e comandas.</Text><Button label="Adicionar R$ 50 de demonstração" onPress={() => addCredit(currentPlayerId, 50, 'Recarga demonstrativa')} style={{ marginTop: spacing.md }} /></Card>
    <SectionTitle title="Extrato" />
    {mine.map((entry) => <Card key={entry.id} style={styles.compactCard}><View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.rowLabel}>{entry.description}</Text><Text style={styles.caption}>{new Date(entry.createdAt).toLocaleDateString('pt-BR')} · {entry.kind}</Text></View><Text style={[styles.money, { color: entry.kind === 'debit' ? colors.danger : colors.success }]}>{entry.kind === 'debit' ? '−' : '+'}{currency(entry.amount)}</Text></View></Card>)}
    <Info text="Em produção, créditos ficam em razão contábil imutável; estornos geram um novo lançamento em vez de apagar o anterior." />
  </>;
}

function Loyalty() {
  const playerId = useAppStore((state) => state.currentPlayerId);
  const plans = useGrowthStore((state) => state.loyaltyPlans);
  const subscriptions = useGrowthStore((state) => state.loyaltySubscriptions);
  const buy = useGrowthStore((state) => state.buyLoyaltyPlan);
  const [notice, setNotice] = useState('');
  return <>{plans.map((plan) => {
    const subscription = subscriptions.find((row) => row.planId === plan.id && row.playerId === playerId);
    return <Card key={plan.id} style={styles.section}><View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{plan.name}</Text><Text style={styles.price}>{currency(plan.price)}/mês</Text></View>{plan.bonusCredits > 0 && <Badge label={`+${plan.bonusCredits} bônus`} color={colors.warning} />}</View>{plan.benefits.map((benefit) => <Text key={benefit} style={styles.benefit}>✓ {benefit}</Text>)}{subscription ? <View style={styles.activePlan}><Text style={styles.activePlanText}>{subscription.remainingCredits} créditos disponíveis · válido até {new Date(subscription.validUntil).toLocaleDateString('pt-BR')}</Text></View> : <Button label="Assinar plano" onPress={() => setNotice(buy(plan.id, playerId) ? 'Plano ativado com sucesso.' : 'Saldo insuficiente. Recarregue a carteira para continuar.')} style={{ marginTop: spacing.md }} />}</Card>;
  })}{!!notice && <Text style={styles.notice}>{notice}</Text>}<Info text="Receita recorrente para o campo; o app pode cobrar mensalidade Pro ou comissão sobre cada assinatura." /></>;
}

function Staff() {
  const staff = useGrowthStore((state) => state.sportsStaff);
  const assignments = useGrowthStore((state) => state.staffAssignments);
  const assign = useGrowthStore((state) => state.assignStaff);
  return <>
    <Info text="Convide árbitros, mesários e professores. O aceite, o valor e o pagamento ficam ligados ao evento." />
    {staff.map((person) => {
      const assignment = assignments.find((row) => row.staffId === person.id);
      return <Card key={person.id} style={styles.compactCard}><View style={styles.row}><View style={styles.avatar}><Text style={styles.avatarText}>{person.name[0]}</Text></View><View style={{ flex: 1 }}><Text style={styles.rowLabel}>{person.name}</Text><Text style={styles.caption}>{person.role} · ⭐ {person.rating} · {person.sports.join(', ')}</Text><Text style={styles.money}>{currency(person.pricePerEvent)} por evento</Text></View>{assignment ? <Badge label={assignment.status === 'invited' ? 'Convidado' : assignment.status} color={colors.warning} /> : <Button label="Convidar" small disabled={!person.available} onPress={() => assign(person.id, 'Copa Arena · semifinal')} />}</View></Card>;
    })}
  </>;
}

function Marketplace() {
  const playerId = useAppStore((state) => state.currentPlayerId);
  const offers = useGrowthStore((state) => state.openSlotOffers);
  const reserve = useGrowthStore((state) => state.reserveOffer);
  const [notice, setNotice] = useState('');
  return <>{offers.map((offer) => {
    const sport = getSport(offer.sportId);
    const discount = percentage(offer.originalPrice - offer.offerPrice, offer.originalPrice);
    return <Card key={offer.id} style={[styles.section, offer.sponsored && { borderColor: colors.warning }]}>{offer.sponsored && <Badge label="PATROCINADO" color={colors.warning} />}<View style={styles.row}><View style={[styles.roundIcon, { backgroundColor: `${sport.color}22` }]}><Text>{sport.icon}</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{offer.fieldName}</Text><Text style={styles.caption}>{new Date(offer.startsAt).toLocaleString('pt-BR')} · {offer.durationMinutes} min</Text></View></View><View style={styles.priceRow}><Text style={styles.oldPrice}>{currency(offer.originalPrice)}</Text><Text style={styles.offerPrice}>{currency(offer.offerPrice)}</Text><Badge label={`-${discount}%`} color={colors.success} /></View><Button label={offer.status === 'reserved' ? 'Horário reservado' : 'Reservar horário'} disabled={offer.status === 'reserved'} onPress={() => setNotice(reserve(offer.id, playerId) ? 'Horário reservado e debitado da carteira.' : 'Saldo insuficiente ou horário indisponível.')} /></Card>;
  })}{!!notice && <Text style={styles.notice}>{notice}</Text>}<Info text="Campos parceiros podem pagar por destaque. A posição patrocinada sempre aparece identificada e não substitui os filtros de distância, preço e esporte." /></>;
}

function Reports() {
  const entries = useGrowthStore((state) => state.walletEntries);
  const offers = useGrowthStore((state) => state.openSlotOffers);
  const listings = useGrowthStore((state) => state.commerceListings);
  const assignments = useGrowthStore((state) => state.staffAssignments);
  const credits = entries.filter((entry) => entry.kind !== 'debit').reduce((sum, entry) => sum + entry.amount, 0);
  const debits = entries.filter((entry) => entry.kind === 'debit').reduce((sum, entry) => sum + entry.amount, 0);
  const reserved = offers.filter((offer) => offer.status === 'reserved').length;
  return <>
    <View style={styles.metricGrid}><Metric label="Entradas" value={currency(credits)} color={colors.success} /><Metric label="Consumo" value={currency(debits)} color={colors.secondary} /><Metric label="Ofertas reservadas" value={`${reserved}/${offers.length}`} color={colors.warning} /><Metric label="Itens em estoque" value={String(listings.reduce((sum, row) => sum + row.stock, 0))} color={colors.primary} /></View>
    <Card style={styles.section}><Text style={styles.cardTitle}>Resultado operacional</Text><ReportRow label="Receita movimentada" value={currency(credits + debits)} /><ReportRow label="Equipe escalada" value={`${assignments.length} profissional(is)`} /><ReportRow label="Conversão de ofertas" value={`${percentage(reserved, offers.length)}%`} /><ReportRow label="Receita potencial em estoque" value={currency(listings.reduce((sum, item) => sum + item.price * item.stock, 0))} /></Card>
    <Info text="O Plano Pro pode liberar períodos personalizados, conciliação, exportação contábil e comparativos por campo, esporte e horário." />
  </>;
}

function Documents() {
  const playerId = useAppStore((state) => state.currentPlayerId);
  const waivers = useGrowthStore((state) => state.waivers);
  const accept = useGrowthStore((state) => state.acceptWaiver);
  return <>
    <Card style={styles.section}><Text style={styles.cardTitle}>Dados de segurança</Text><ReportRow label="Contato de emergência" value="Maria · (11) 98888-0000" /><ReportRow label="Responsável legal" value="Não necessário" /><ReportRow label="Restrição médica" value="Visível apenas a autorizados" /></Card>
    <SectionTitle title="Termos pendentes" />
    {waivers.map((waiver) => { const accepted = waiver.acceptedPlayerIds.includes(playerId); return <Card key={waiver.id} style={styles.compactCard}><View style={styles.row}><Ionicons name={accepted ? 'checkmark-circle' : 'document-text-outline'} size={24} color={accepted ? colors.success : colors.warning} /><View style={{ flex: 1 }}><Text style={styles.rowLabel}>{waiver.title}</Text><Text style={styles.caption}>{waiver.scope} · atualizado em {new Date(waiver.updatedAt).toLocaleDateString('pt-BR')}</Text></View></View>{!accepted && <Button label="Ler e aceitar" small onPress={() => accept(waiver.id, playerId)} style={{ marginTop: spacing.sm }} />}</Card>; })}
    <Info text="O aceite registra versão, usuário, data e dispositivo. Dados médicos devem ter acesso restrito e trilha de auditoria." />
  </>;
}

function Highlights() {
  const playerId = useAppStore((state) => state.currentPlayerId);
  const highlights = useGrowthStore((state) => state.highlights);
  const addHighlight = useGrowthStore((state) => state.addHighlight);
  const mine = highlights.filter((row) => row.playerId === playerId);
  return <>
    <Card style={styles.shareCard}><Text style={styles.shareBrand}>MINHA TEMPORADA</Text><Text style={styles.shareEmoji}>🏆</Text><Text style={styles.shareTitle}>{mine[0]?.title ?? 'Primeiro destaque'}</Text><Text style={styles.shareText}>{mine[0]?.description ?? 'Continue jogando para construir sua retrospectiva.'}</Text><View style={styles.shareFooter}><Text style={styles.shareFooterText}>PELADA · 2026</Text></View></Card>
    <Button label="Gerar novo momento" onPress={() => addHighlight(playerId, 'Presença de ferro', 'Participou de 5 atividades consecutivas do time.')} />
    <SectionTitle title="Linha do tempo" />
    {mine.slice().reverse().map((highlight) => <Card key={highlight.id} style={styles.compactCard}><Text style={styles.rowLabel}>✨ {highlight.title}</Text><Text style={styles.caption}>{highlight.description}</Text></Card>)}
    <Info text="Premium pode liberar temas animados, retrospectiva em vídeo e exportação sem marca d’água — sem bloquear estatísticas básicas." />
  </>;
}

function Storefront() {
  const playerId = useAppStore((state) => state.currentPlayerId);
  const listings = useGrowthStore((state) => state.commerceListings);
  const orders = useGrowthStore((state) => state.rentalOrders);
  const reserve = useGrowthStore((state) => state.reserveListing);
  const [notice, setNotice] = useState('');
  return <>
    {orders.length > 0 && <Card style={[styles.section, { borderColor: colors.success }]}><Text style={styles.cardTitle}>Retiradas agendadas</Text>{orders.map((order) => { const item = listings.find((row) => row.id === order.listingId); return <ReportRow key={order.id} label={item?.name ?? 'Equipamento'} value={`${new Date(order.pickupAt).toLocaleDateString('pt-BR')} · ${order.status}`} />; })}</Card>}
    <View style={styles.storeGrid}>{listings.map((item) => <Card key={item.id} style={styles.storeItem}><View style={[styles.productIcon, { backgroundColor: item.kind === 'rental' ? '#3B82F622' : '#F9731622' }]}><Ionicons name={item.category === 'ball' ? 'football-outline' : item.category === 'boots' ? 'walk-outline' : 'shirt-outline'} size={28} color={item.kind === 'rental' ? colors.secondary : '#F97316'} /></View><Badge label={item.kind === 'rental' ? 'ALUGUEL' : 'VENDA'} color={item.kind === 'rental' ? colors.secondary : '#F97316'} /><Text style={styles.storeName}>{item.name}</Text><Text style={styles.offerPrice}>{currency(item.price)}</Text><Text style={styles.caption}>{item.stock} em estoque</Text><Button label={item.kind === 'rental' ? 'Reservar' : 'Comprar'} small disabled={item.stock === 0} onPress={() => setNotice(reserve(item.id, playerId) ? `${item.name} confirmado e debitado da carteira.` : 'Saldo insuficiente ou item sem estoque.')} style={{ marginTop: spacing.sm }} /></Card>)}</View>
    {!!notice && <Text style={styles.notice}>{notice}</Text>}
    <Info text="A retirada pode ser associada à reserva da quadra. O app monetiza por comissão, destaque do produto ou mensalidade da loja." />
  </>;
}

function Info({ text }: { text: string }) { return <View style={styles.info}><Ionicons name="information-circle-outline" size={18} color={colors.secondary} /><Text style={styles.infoText}>{text}</Text></View>; }
function SectionTitle({ title }: { title: string }) { return <Text style={styles.sectionTitle}>{title}</Text>; }
function ReportRow({ label, value }: { label: string; value: string }) { return <View style={styles.reportRow}><Text style={styles.reportLabel}>{label}</Text><Text style={styles.reportValue}>{value}</Text></View>; }
function Metric({ label, value, color }: { label: string; value: string; color: string }) { return <Card style={styles.metric}><Text style={[styles.metricValue, { color }]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></Card>; }

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  section: { marginBottom: spacing.md, gap: spacing.sm },
  compactCard: { marginBottom: spacing.sm, padding: spacing.md },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  caption: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  notice: { color: colors.warning, fontSize: 12, marginVertical: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 13, paddingVertical: spacing.lg, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roundIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  scoreTeams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.md },
  scoreTeam: { width: 110, alignItems: 'center', gap: 5 },
  scoreValue: { color: colors.text, fontSize: 36, fontWeight: '900' },
  scoreName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  scoreSeparator: { color: colors.textFaint, fontSize: 18 },
  segmentList: { gap: 5, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  segmentRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { color: colors.text, fontSize: 13, fontWeight: '700' },
  rowValue: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  chip: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 7 },
  chipActive: { borderColor: colors.secondary, backgroundColor: '#3B82F622' },
  chipText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  chipTextActive: { color: colors.secondary },
  message: { alignSelf: 'flex-start', maxWidth: '88%', borderRadius: radius.md, backgroundColor: colors.bgElevated, padding: spacing.sm },
  messageSender: { color: colors.secondary, fontSize: 9, fontWeight: '800', marginBottom: 2 },
  messageText: { color: colors.text, fontSize: 13 },
  balanceCard: { backgroundColor: '#251A3B', borderColor: '#7C3AED' },
  balanceLabel: { color: '#C4B5FD', fontSize: 12, fontWeight: '700' },
  balanceValue: { color: colors.text, fontSize: 34, fontWeight: '900' },
  money: { color: colors.text, fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginTop: spacing.lg, marginBottom: spacing.sm },
  price: { color: colors.warning, fontSize: 18, fontWeight: '900', marginTop: 3 },
  benefit: { color: colors.textMuted, fontSize: 12 },
  activePlan: { backgroundColor: '#22C55E18', borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  activePlanText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.secondaryDark, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 17, fontWeight: '900' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  oldPrice: { color: colors.textFaint, textDecorationLine: 'line-through', fontSize: 12 },
  offerPrice: { color: colors.text, fontSize: 18, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  metric: { width: '48.5%', minHeight: 100, justifyContent: 'center' },
  metricValue: { fontSize: 20, fontWeight: '900' },
  metricLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.cardBorder, gap: spacing.sm },
  reportLabel: { color: colors.textMuted, fontSize: 12, flex: 1 },
  reportValue: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  info: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#3B82F614', marginTop: spacing.sm, marginBottom: spacing.md },
  infoText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, flex: 1 },
  shareCard: { alignItems: 'center', minHeight: 340, justifyContent: 'center', marginBottom: spacing.md, borderColor: '#EC4899', backgroundColor: '#291225' },
  shareBrand: { color: '#F9A8D4', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  shareEmoji: { fontSize: 64, marginVertical: spacing.lg },
  shareTitle: { color: colors.white, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  shareText: { color: '#FBCFE8', fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: spacing.sm },
  shareFooter: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: '#EC489955', width: '100%', paddingTop: spacing.sm },
  shareFooterText: { color: '#F9A8D4', fontSize: 10, fontWeight: '800', textAlign: 'center' },
  storeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  storeItem: { width: '48.5%', padding: spacing.md, gap: 5 },
  productIcon: { width: '100%', height: 74, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  storeName: { color: colors.text, fontSize: 13, fontWeight: '800', minHeight: 34 },
});
