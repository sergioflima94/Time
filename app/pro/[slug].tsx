import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { getSport } from '@/constants/sports';
import { currency } from '@/lib/growth';
import { flushSyncMutations } from '@/lib/platformSync';
import { occupancyRate, orderedStandings, referralLink, reliabilityLabel, reliabilityScore } from '@/lib/pro';
import { isMockMode } from '@/lib/supabase';
import { usePlatformStore } from '@/store/usePlatformStore';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useOwnerBenefits } from '@/hooks/useOwnerBenefits';
import { useAppStore } from '@/store/useAppStore';
import { useProStore } from '@/store/useProStore';
import type { CommercialAudience, ModerationReason } from '@/types/pro';

const TITLES: Record<string, string> = { reputacao: 'Confiabilidade', temporadas: 'Temporadas e ranking', inteligencia: 'Inteligência do negócio', indicacoes: 'Indicações e crescimento', planos: 'Planos comerciais', seguranca: 'Segurança e auditoria', sincronizacao: 'Sincronização' };

export default function ProModuleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Screen contentStyle={styles.screen}><Button label="← Operação Pro" variant="ghost" onPress={() => router.back()} style={styles.back} /><View><Text style={styles.eyebrow}>OPERAÇÃO PRO</Text><Text style={styles.title}>{TITLES[slug] ?? 'Módulo'}</Text></View>{slug === 'reputacao' && <Reputation />}{slug === 'temporadas' && <Seasons />}{slug === 'inteligencia' && <Intelligence />}{slug === 'indicacoes' && <Referrals />}{slug === 'planos' && <Plans />}{slug === 'seguranca' && <Safety />}{slug === 'sincronizacao' && <Synchronization />}</Screen>;
}

function Reputation() {
  const players = useAppStore(useShallow((state) => state.players.filter((row) => !row.isGuest).slice(0, 8)));
  const attendances = useAppStore((state) => state.attendances);
  const events = useProStore((state) => state.reliabilityEvents);
  return <><Info icon="shield-checkmark" text="A nota começa em 80 e considera presença, QR, cancelamentos, faltas e fair play. Nunca altera a habilidade esportiva." />{players.map((player) => { const score = reliabilityScore(player.id, events, attendances); return <Card key={player.id} style={styles.person}><Avatar name={player.name} photoUrl={player.avatarUrl} size={42} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{player.name}</Text><Text style={styles.caption}>{reliabilityLabel(score)} · {attendances.filter((row) => row.playerId === player.id && row.checkedIn).length} check-ins</Text></View><View style={[styles.score, { borderColor: score >= 75 ? colors.primary : colors.warning }]}><Text style={[styles.scoreText, { color: score >= 75 ? colors.primary : colors.warning }]}>{score}</Text></View></Card>; })}</>;
}

function Seasons() {
  const currentPeladaId = useAppStore((state) => state.currentPeladaId);
  const pelada = useAppStore((state) => state.peladas.find((row) => row.id === currentPeladaId));
  const playerIds = useAppStore(useShallow((state) => state.memberships.filter((row) => row.peladaId === currentPeladaId && row.active).map((row) => row.playerId)));
  const players = useAppStore((state) => state.players);
  const seasons = useProStore(useShallow((state) => state.seasons.filter((row) => row.peladaId === currentPeladaId)));
  const standings = useProStore((state) => state.standings);
  const create = useProStore((state) => state.createSeason);
  const simulate = useProStore((state) => state.simulateSeasonRound);
  const [name, setName] = useState('Temporada 2026');
  const active = seasons.find((row) => row.status === 'active');
  const rows = orderedStandings(standings.filter((row) => row.seasonId === active?.id));
  return <><Card style={styles.form}><Text style={styles.cardTitle}>Criar temporada</Text><TextField label="Nome" value={name} onChangeText={setName} /><Button label="Criar e incluir o elenco" onPress={() => pelada && create(pelada.id, pelada.sportId, name, playerIds)} disabled={!pelada || !name.trim()} /></Card>{active && <><View style={styles.rowBetween}><View><Text style={styles.sectionTitle}>{active.name}</Text><Text style={styles.caption}>{getSport(active.sportId).label} · vitória {active.pointsWin} pts · participação {active.pointsParticipation} pt</Text></View><Badge label="ATIVA" color={colors.primary} /></View><Card style={styles.table}>{rows.map((row, index) => { const player = players.find((item) => item.id === row.playerId); return <View key={row.playerId} style={styles.tableRow}><Text style={styles.position}>{index + 1}</Text><Text style={styles.tableName}>{player?.nickname || player?.name || 'Jogador'}</Text><Text style={styles.tableStat}>{row.games}J</Text><Text style={styles.tableStat}>{row.wins}V</Text><Text style={styles.points}>{row.points} pts</Text></View>; })}</Card><Button label="Registrar rodada demonstrativa" variant="outline" onPress={() => simulate(active.id)} /></>}</>;
}

function Intelligence() {
  const currentPlayerId = useAppStore((state) => state.currentPlayerId);
  const establishment = useAppStore((state) => state.establishments.find((row) => row.ownerPlayerId === currentPlayerId));
  const fields = useAppStore(useShallow((state) => state.fields.filter((row) => row.establishmentId === establishment?.id)));
  const bookings = useAppStore(useShallow((state) => state.fieldBookings.filter((row) => row.establishmentId === establishment?.id)));
  const salePayments = useAppStore((state) => state.salePayments);
  const products = useAppStore(useShallow((state) => state.products.filter((row) => row.establishmentId === establishment?.id)));
  const settlements = useProStore(useShallow((state) => state.settlements.filter((row) => row.establishmentId === establishment?.id && row.status === 'settled')));
  const booked = bookings.reduce((sum, row) => sum + row.durationMinutes, 0);
  const capacity = Math.max(1, fields.length * 7 * 5 * 60);
  const occupancy = occupancyRate(booked, capacity);
  const revenue = salePayments.filter((row) => !row.reversedAt).reduce((sum, row) => sum + row.amount, 0);
  const net = settlements.reduce((sum, row) => sum + row.netCents, 0) / 100;
  const lowStock = products.filter((row) => row.stockQuantity !== null && row.stockQuantity <= 10);
  return <>{!establishment ? <Info icon="business" text="Cadastre um estabelecimento para visualizar os indicadores." /> : <><Card style={styles.kpis}><Kpi value={`${occupancy}%`} label="ocupação estimada" color={colors.primary} /><Kpi value={currency(net || revenue)} label="líquido conciliado" color={colors.gold} /><Kpi value={`${lowStock.length}`} label="itens em alerta" color={colors.danger} /></Card><Card style={styles.form}><Text style={styles.cardTitle}>Sugestões automáticas</Text><Suggestion icon="pricetag" title="Preencher horários ociosos" text={`Ocupação em ${occupancy}%. Publique desconto nos horários com menor procura.`} /><Suggestion icon="cart" title="Repor estoque" text={lowStock.length ? `${lowStock.map((row) => row.name).join(', ')} precisam de reposição.` : 'Estoque saudável no momento.'} /><Suggestion icon="people" title="Converter times recorrentes" text={`${bookings.filter((row) => row.recurrence === 'weekly').length} reservas semanais podem receber proposta de plano mensal.`} /></Card></>}</>;
}

function Referrals() {
  const playerId = useAppStore((state) => state.currentPlayerId);
  const campaign = useProStore((state) => state.referrals.find((row) => row.ownerPlayerId === playerId && row.active));
  const create = useProStore((state) => state.createReferral);
  const redemptions = useProStore(useShallow((state) => state.referralRedemptions.filter((row) => row.campaignId === campaign?.id)));
  return <><Card style={styles.referral}><View style={styles.referralIcon}><Ionicons name="gift" size={30} color={colors.onPrimary} /></View><Text style={styles.cardTitle}>Indique um time ou jogador</Text><Text style={styles.captionCenter}>Você e o convidado recebem créditos depois do primeiro jogo pago. O link abre diretamente no app.</Text>{campaign ? <><Text style={styles.referralCode}>{campaign.code}</Text><Text style={styles.caption}>{campaign.uses} usos · {redemptions.filter((row) => row.status === 'rewarded').length} recompensas liberadas</Text><Button label="Compartilhar convite" onPress={() => Share.share({ message: `Vem organizar o esporte comigo: ${referralLink(campaign.code)}` })} /></> : <Button label="Gerar meu link" onPress={() => create(playerId)} />}</Card><Info icon="link" text="A indicação fica pendente até uma conversão real. Isso evita fraude de múltiplas contas e custo sem receita." /></>;
}

function Plans() {
  const ownerBenefits = useOwnerBenefits();
  const playerId = useAppStore(s => s.currentPlayerId);
  const memberships = useAppStore(s => s.memberships);
  const teams = useAppStore(s => s.peladas);
  const establishments = useAppStore(s => s.establishments);
  const plans = useProStore(s => s.plans);
  const subscriptions = useProStore(s => s.subscriptions);
  const subscribe = useProStore(s => s.subscribe);
  const trialDays = usePlatformStore(s => s.settings.trialDays);
  const [audience, setAudience] = useState<CommercialAudience>('player');
  const [selected, setSelected] = useState('');
  const options = audience === 'team' ? teams.filter(t => memberships.some(m => m.peladaId === t.id && m.playerId === playerId && m.active && m.role === 'admin'))
    : audience === 'establishment' ? establishments.filter(e => e.ownerPlayerId === playerId) : [];
  const subscriberId = audience === 'player' ? playerId : options.some(o => o.id === selected) ? selected : options[0]?.id;
  return <>{ownerBenefits && <Info icon="shield-checkmark" text="Benefícios Jogador Premium, Time Pro e Estabelecimento Pro liberados para o proprietário, sem mensalidade. Para operar um time ou campo, use uma organização sua ou onde você tenha autorização. Consumo e serviços externos não são gratuitos." />}<SegmentedControl value={audience} onChange={setAudience} options={[{ value: 'player', label: 'Jogador' }, { value: 'team', label: 'Time' }, { value: 'establishment', label: 'Campo' }]} />
    {audience !== 'player' && <View style={[styles.rowBetween, { flexWrap: 'wrap', gap: spacing.xs }]}>{options.map(o => <Button small key={o.id} label={o.name} variant={subscriberId === o.id ? 'primary' : 'outline'} onPress={() => setSelected(o.id)} />)}</View>}
    {!subscriberId && <Text style={styles.caption}>Você precisa administrar um time ou ser dono de um estabelecimento para escolher esta oferta.</Text>}
    {plans.filter(p => p.audience === audience && p.active).map(plan => {
      const exempt = ownerBenefits && !!subscriberId;
      const active = exempt || subscriptions.some(s => s.planId === plan.id && s.subscriberId === subscriberId && ['trial','active'].includes(s.status) && Date.parse(s.currentPeriodEnd) > Date.now());
      return <Card key={plan.id} style={styles.plan}><Text style={styles.planName}>{plan.name}</Text><Text style={styles.planPrice}>{exempt ? 'Sem mensalidade' : currency(plan.monthlyPrice)}{!exempt && <Text style={styles.caption}> / mês</Text>}</Text>{plan.benefits.map(benefit => <View key={benefit} style={styles.benefit}><Ionicons name="checkmark-circle" size={17} color={colors.primary} /><Text style={styles.benefitText}>{benefit}</Text></View>)}<Button label={exempt ? 'Liberado para o proprietário' : active ? 'Plano válido para este perfil' : isMockMode ? `Simular teste de ${trialDays} dias` : 'Assinatura em preparação'} disabled={active || !subscriberId || !isMockMode} onPress={() => subscriberId && !exempt && subscribe(plan.id,subscriberId,trialDays)} /></Card>;
    })}<Info icon="card" text="Em demonstração não há cobrança. A ativação real exige callback da loja ou webhook validado, e ficará disponível após homologação comercial." /></>;
}

function Safety() {
  const platformRole = usePlatformAdmin();
  const playerId = useAppStore((state) => state.currentPlayerId);
  const reports = useProStore((state) => state.moderationReports);
  const audits = useProStore(useShallow((state) => state.auditEvents.slice(-8).reverse()));
  const create = useProStore((state) => state.createModerationReport);
  const [target, setTarget] = useState('p2'); const [details, setDetails] = useState(''); const [reason, setReason] = useState<ModerationReason>('harassment');
  return <><Card style={styles.form}><Text style={styles.cardTitle}>Nova denúncia</Text><TextField label="ID do jogador/time/campo" value={target} onChangeText={setTarget} /><SegmentedControl value={reason} onChange={setReason} options={[{ value: 'harassment', label: 'Assédio' }, { value: 'fraud', label: 'Fraude' }, { value: 'spam', label: 'Spam' }]} /><TextField label="Detalhes" value={details} onChangeText={setDetails} multiline /><Button label="Enviar para análise" onPress={() => { create(playerId, 'player', target, reason, details); setDetails(''); }} disabled={!target.trim()} /></Card>{reports.map((report) => <Card key={report.id} style={styles.report}><View style={styles.rowBetween}><Text style={styles.cardTitle}>{report.reason}</Text><Badge label={report.status.toUpperCase()} color={report.status === 'resolved' ? colors.success : colors.warning} /></View><Text style={styles.caption}>{report.details || 'Sem detalhes adicionais'} · {new Date(report.createdAt).toLocaleString('pt-BR')}</Text>{platformRole && <Button small label="Tratar no painel da plataforma" variant="outline" onPress={() => router.push("/plataforma")} />}</Card>)}<Text style={styles.sectionTitle}>Trilha de auditoria</Text>{audits.map((event) => <View key={event.id} style={styles.audit}><Ionicons name="document-text" size={16} color={colors.textMuted} /><View style={{ flex: 1 }}><Text style={styles.auditText}>{event.summary}</Text><Text style={styles.caption}>{new Date(event.createdAt).toLocaleString('pt-BR')}</Text></View></View>)}</>;
}

function Synchronization() {
  const queue = useProStore((state) => state.syncQueue);
  const update = useProStore((state) => state.updateSyncMutation);
  const [running, setRunning] = useState(false);
  async function sync() { setRunning(true); const pending = queue.filter((row) => row.status === 'pending' || row.status === 'failed'); pending.forEach((row) => update(row.id, { status: 'syncing', attempts: row.attempts + 1 })); const results = await flushSyncMutations(pending); results.forEach((result) => update(result.id, { status: result.ok ? 'synced' : 'failed', lastError: result.error, syncedAt: result.ok ? new Date().toISOString() : null })); setRunning(false); Alert.alert('Sincronização', results.length ? `${results.filter((row) => row.ok).length}/${results.length} eventos enviados.` : 'Nada pendente.'); }
  const pending = queue.filter((row) => row.status !== 'synced').length;
  return <><Card style={styles.syncHero}><View style={[styles.syncIcon, { backgroundColor: isMockMode ? `${colors.warning}22` : `${colors.primary}22` }]}><Ionicons name={isMockMode ? 'phone-portrait' : 'cloud-done'} size={28} color={isMockMode ? colors.warning : colors.primary} /></View><Text style={styles.cardTitle}>{isMockMode ? 'Demonstração offline' : 'Supabase conectado'}</Text><Text style={styles.captionCenter}>{isMockMode ? 'A confirmação local simula o envio sem expor credenciais.' : 'Mutações são entregues com idempotência e podem ser reprocessadas.'}</Text><Text style={styles.pending}>{pending} pendentes</Text><Button label="Sincronizar agora" loading={running} onPress={sync} /></Card>{queue.slice().reverse().map((mutation) => <View key={mutation.id} style={styles.audit}><Ionicons name={mutation.status === 'synced' ? 'checkmark-circle' : mutation.status === 'failed' ? 'alert-circle' : 'time'} size={18} color={mutation.status === 'synced' ? colors.success : mutation.status === 'failed' ? colors.danger : colors.warning} /><View style={{ flex: 1 }}><Text style={styles.auditText}>{mutation.operation} · {mutation.aggregate}</Text><Text style={styles.caption}>{mutation.status} · tentativa {mutation.attempts}</Text></View></View>)}</>;
}

function Info({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }) { return <View style={styles.info}><Ionicons name={icon} size={20} color={colors.secondary} /><Text style={styles.infoText}>{text}</Text></View>; }
function Kpi({ value, label, color }: { value: string; label: string; color: string }) { return <View style={styles.kpi}><Text style={[styles.kpiValue, { color }]}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }
function Suggestion({ icon, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string }) { return <View style={styles.suggestion}><View style={styles.suggestionIcon}><Ionicons name={icon} size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={styles.suggestionTitle}>{title}</Text><Text style={styles.caption}>{text}</Text></View></View>; }

const styles = StyleSheet.create({
  screen: { gap: spacing.lg }, back: { alignSelf: 'flex-start', paddingHorizontal: 0 }, eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, title: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 3 }, info: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: radius.md, padding: spacing.md }, infoText: { color: colors.textMuted, flex: 1, fontSize: 12, lineHeight: 17 }, person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15 }, caption: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }, captionCenter: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, score: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, scoreText: { fontWeight: '900', fontSize: 17 }, form: { gap: spacing.md }, rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 16 }, table: { paddingVertical: spacing.sm }, tableRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, position: { color: colors.textMuted, width: 25, fontWeight: '800' }, tableName: { color: colors.text, flex: 1, fontWeight: '700' }, tableStat: { color: colors.textMuted, width: 32, fontSize: 11 }, points: { color: colors.primary, width: 52, textAlign: 'right', fontWeight: '900' }, kpis: { flexDirection: 'row', gap: spacing.sm }, kpi: { flex: 1, alignItems: 'center' }, kpiValue: { fontSize: 20, fontWeight: '900', textAlign: 'center' }, kpiLabel: { color: colors.textMuted, fontSize: 9, textAlign: 'center' }, suggestion: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' }, suggestionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(157,235,34,0.12)', alignItems: 'center', justifyContent: 'center' }, suggestionTitle: { color: colors.text, fontWeight: '800', fontSize: 13 }, referral: { alignItems: 'center', gap: spacing.md }, referralIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }, referralCode: { color: colors.gold, fontSize: 24, fontWeight: '900', letterSpacing: 2, padding: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: radius.md }, plan: { gap: spacing.md }, planName: { color: colors.text, fontSize: 21, fontWeight: '900' }, planPrice: { color: colors.primary, fontSize: 24, fontWeight: '900' }, benefit: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }, benefitText: { color: colors.text, flex: 1, fontSize: 12 }, report: { gap: spacing.sm }, audit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, auditText: { color: colors.text, fontWeight: '700', fontSize: 12 }, syncHero: { alignItems: 'center', gap: spacing.md }, syncIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' }, pending: { color: colors.warning, fontSize: 22, fontWeight: '900' },
});
