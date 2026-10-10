import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { isMockMode } from '@/lib/supabase';
import { usePlatformStore } from '@/store/usePlatformStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { getSport, useSportCatalog, type SportDefinition } from '@/constants/sports';
import { SportEditor } from '@/components/SportEditor';
import type { CommercialPlan } from '@/types/pro';
import { validatePlatformSettings, type PlatformAction, type PlatformSettings, type PlatformSnapshot } from '@/types/platform';

const TABS = ['Visão geral', 'Usuários', 'Times e campos', 'Esportes', 'Planos', 'Configurações', 'Denúncias', 'Equipe admin', 'Auditoria'] as const;
type PendingAction = { action: PlatformAction; id: string | null; payload: Record<string, unknown>; description: string };

export default function PlatformConsoleScreen() {
  const sports = useSportCatalog(s => s.catalog);
  const [editingSport, setEditingSport] = useState<SportDefinition | 'new' | null>(null);
  const role = usePlatformAdmin();
  const snapshot = usePlatformStore(s => s.snapshot);
  const loading = usePlatformStore(s => s.loading);
  const error = usePlatformStore(s => s.error);
  const load = usePlatformStore(s => s.load);
  const act = usePlatformStore(s => s.act);
  const [tab, setTab] = useState<typeof TABS[number]>('Visão geral');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!pending) return;
    setBusy(true); setNotice('');
    try { await act(pending.action, pending.id, pending.payload, reason); setPending(null); setEditingSport(null); setReason(''); setNotice('Alteração salva e registrada na auditoria.'); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Não foi possível salvar. Atualize e tente novamente.'); }
    finally { setBusy(false); }
  }

  return <Screen contentStyle={{ gap: spacing.md }}>
    <View style={styles.header}><Pressable onPress={() => router.back()} accessibilityLabel="Voltar" hitSlop={12}><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.title}>Admin da plataforma</Text><Text style={styles.caption}>BoraJogo · gestão global</Text></View>{role && <Badge label={role === 'owner' ? 'Proprietário' : role === 'admin' ? 'Administrador' : 'Suporte'} color={colors.special} />}</View>
    {loading && !role ? <Text style={styles.caption}>Verificando suas permissões...</Text> : !role || !snapshot ? <Card><Text style={styles.sectionTitle}>Acesso restrito</Text><Text style={styles.copy}>{error || 'Este painel não pertence à administração de um time. Sua conta precisa de autorização da plataforma.'}</Text><Button label="Verificar novamente" small onPress={() => void load()} loading={loading} /></Card> : <>
      {isMockMode && <Text style={styles.warning}>Demonstração: este administrador existe somente nos dados de exemplo. Nenhum usuário real recebe o papel automaticamente.</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{TABS.filter(t => t !== 'Equipe admin' || role === 'owner').map(t => <Pressable key={t} onPress={() => { setTab(t); setPending(null); }} style={[styles.tab, tab === t && styles.activeTab]}><Text style={[styles.tabText, tab === t && { color: colors.primaryDark }]}>{t}</Text></Pressable>)}</ScrollView>
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      {pending && <Card style={{ borderColor: colors.warning }}><Text style={styles.sectionTitle}>Confirmar alteração</Text><Text style={styles.copy}>{pending.description}</Text><TextField label="Motivo (mínimo 8 caracteres)" value={reason} onChangeText={setReason} multiline placeholder="Explique a decisão para a auditoria" /><View style={styles.row}><Button label="Cancelar" variant="ghost" small onPress={() => setPending(null)} disabled={busy} /><Button label="Confirmar e registrar" small onPress={() => void confirm()} loading={busy} disabled={reason.trim().length < 8} /></View></Card>}
      {tab === 'Visão geral' && <>
        <View style={styles.metrics}>{Object.entries({ Jogadores: snapshot.metrics.players, Times: snapshot.metrics.teams, Estabelecimentos: snapshot.metrics.establishments, 'Jogos futuros': snapshot.metrics.upcomingGames, 'Denúncias abertas': snapshot.metrics.openReports, 'Assinaturas ativas': snapshot.metrics.activeSubscriptions }).map(([label, value]) => <View style={styles.metric} key={label}><Text style={styles.value}>{value}</Text><Text style={styles.caption}>{label}</Text></View>)}</View>
        <Card><Text style={styles.sectionTitle}>Prioridades de atendimento</Text><Text style={styles.copy}>{snapshot.metrics.openReports ? `${snapshot.metrics.openReports} denúncias precisam de análise.` : 'Nenhuma denúncia aguardando análise.'}</Text><Text style={styles.copy}>Planos e regras comerciais ficam em configuração; recebimentos do estabelecimento não são receita do aplicativo. Assinaturas em teste não entram no total de assinantes ativos.</Text><Button small label="Atualizar indicadores" variant="outline" loading={loading} onPress={() => void load()} /></Card>
      </>}
      {(tab === 'Usuários' || tab === 'Times e campos' || tab === 'Equipe admin') && <><TextField label="Buscar nome" value={query} onChangeText={setQuery} placeholder="Jogador, time ou estabelecimento" /><Button label="Buscar na plataforma" small variant="outline" onPress={() => void load(query)} loading={loading} /><Text style={styles.caption}>Até 100 resultados por categoria. Refine o nome para localizar contas mais antigas.</Text></>}
      {tab === 'Usuários' && snapshot.players.map(p => <Card key={p.id}><View style={styles.row}><Text style={[styles.sectionTitle, { flex: 1 }]}>{p.nickname || p.name}</Text><Badge label={p.suspended ? 'Suspensa' : 'Ativa'} color={p.suspended ? colors.danger : colors.primary} /></View><Text selectable style={styles.caption}>ID: {p.id}</Text>{role !== 'support' && <Button small variant={p.suspended ? 'outline' : 'danger'} label={p.suspended ? 'Reativar conta' : 'Suspender acesso'} onPress={() => setPending({ action: 'account', id: p.id, payload: { suspended: !p.suspended }, description: `${p.suspended ? 'Reativar' : 'Suspender'} ${p.name}. O histórico não será excluído.` })} />}</Card>)}
      {tab === 'Times e campos' && <><Text style={styles.sectionTitle}>Times</Text>{snapshot.teams.map(t => <View key={t.id} style={styles.listRow}><Text style={styles.copy}>{getSport(t.sportId).icon} {t.name}</Text><Text style={styles.caption}>{getSport(t.sportId).label}</Text></View>)}<Text style={styles.sectionTitle}>Estabelecimentos</Text>{snapshot.establishments.map(e => <View key={e.id} style={styles.listRow}><Text style={styles.copy}>{e.name}</Text><Text style={styles.caption}>{e.fieldCount} campos · ID {e.id}</Text></View>)}<Text style={styles.caption}>Consulta global sem assumir a identidade do dono e sem alterar reservas ou saldos de clientes.</Text></>}
      {tab === 'Planos' && <><Text style={styles.copy}>Preços anunciados. Alterar o catálogo não muda contratos já pagos nem ativa uma assinatura. Cobrança real exige a integração comercial correspondente.</Text>{snapshot.plans.map(p => <PlanEditor key={`${p.id}-${p.name}-${p.monthlyPrice}-${p.active}`} plan={p} editable={role !== 'support'} onSave={payload => setPending({ action: 'plan', id: p.id, payload, description: `Atualizar a oferta ${p.name}. O novo valor vale para futuras ofertas, não para cobrança retroativa.` })} />)}</>}
      {tab === 'Configurações' && <ConfigurationEditor key={snapshot.configuration.revision} configuration={snapshot.configuration} editable={role !== 'support'} onSave={payload => setPending({ action: 'settings', id: null, payload, description: 'Atualizar as regras públicas da plataforma. Comissão e franquia são configurações comerciais, não cobranças ou limites automaticamente aplicados pelo provedor.' })} />}
      {tab === 'Denúncias' && <>{snapshot.reports.length === 0 && <Text style={styles.caption}>Nenhuma denúncia registrada.</Text>}{snapshot.reports.map(r => <Card key={r.id}><View style={styles.row}><Text style={[styles.sectionTitle, { flex: 1 }]}>{r.reason}</Text><Badge label={r.status} color={r.status === 'open' ? colors.warning : colors.secondary} /></View><Text selectable style={styles.caption}>{r.targetType} · {r.targetId}</Text><Text style={styles.copy}>{r.details || 'Sem descrição adicional.'}</Text><View style={[styles.row, { flexWrap: 'wrap' }]}>{(['reviewing','resolved','dismissed'] as const).filter(s => s !== r.status).map(status => <Button key={status} small variant="outline" label={{ reviewing: 'Analisar', resolved: 'Resolver', dismissed: 'Arquivar' }[status]} onPress={() => setPending({ action: 'report', id: r.id, payload: { status }, description: `Registrar ${status} na denúncia ${r.id}. Informe as medidas tomadas no motivo.` })} />)}</View></Card>)}</>}
      {tab === 'Equipe admin' && role === 'owner' && <><Text style={styles.copy}>Só o proprietário concede ou revoga papéis. Suporte trata denúncias; administrador trata configurações; proprietário também gerencia a equipe. O último proprietário não pode ser removido.</Text>{snapshot.admins.map(a => <View style={styles.listRow} key={a.authUserId}><Text style={styles.copy}>{a.name}</Text><Text style={styles.caption}>{a.role} · {a.active ? 'ativo' : 'revogado'}</Text>{!isMockMode && <Button small variant="outline" label={a.active ? 'Revogar acesso' : 'Restaurar acesso'} onPress={() => setPending({ action: 'admin', id: a.authUserId, payload: { role: a.role, active: !a.active }, description: `${a.active ? 'Revogar' : 'Restaurar'} o papel de ${a.name}.` })} />}</View>)}<Text style={styles.sectionTitle}>Conceder acesso a uma conta existente</Text>{snapshot.players.filter(p => p.authUserId && !p.suspended).map(p => <View key={p.id} style={styles.listRow}><Text style={styles.copy}>{p.name}</Text><View style={[styles.row, { flexWrap: 'wrap' }]}>{(['support','admin','owner'] as const).map(nextRole => <Button key={nextRole} small variant="outline" label={{ support: 'Suporte', admin: 'Admin', owner: 'Proprietário' }[nextRole]} onPress={() => setPending({ action: 'admin', id: p.authUserId, payload: { role: nextRole, active: true }, description: `Conceder ${nextRole} à conta ${p.name}. Este papel é global e diferente de administrar um time.` })} />)}</View></View>)}</>}
      {tab === 'Esportes' && <>
        <Text style={styles.copy}>Catálogo global: cadastro do jogador, times, campos, aulas, campeonatos e descoberta usam os mesmos esportes. Só administradores da plataforma alteram as regras.</Text>
        {role !== 'support' && <Button small label="Criar novo esporte" onPress={() => setEditingSport('new')} />}
        {editingSport && role !== 'support' && <SportEditor key={editingSport === 'new' ? 'new' : `${editingSport.id}-${editingSport.revision}`} sport={editingSport === 'new' ? undefined : editingSport} onCancel={() => setEditingSport(null)} onSave={(definition, revision) => setPending({ action: 'sport', id: definition.id, payload: { definition, revision }, description: `Salvar ${definition.label} e suas regras no catálogo global. Novos placares usarão essa configuração; histórico será preservado.` })} />}
        {sports.map(s => <View key={s.id} style={styles.listRow}><View style={styles.row}><Text style={[styles.sectionTitle, { flex: 1, color: s.color }]}>{s.icon} {s.label}</Text><Badge label={s.active ? 'Ativo' : 'Inativo'} color={s.active ? colors.primary : colors.textMuted} /></View><Text style={styles.caption}>{s.suggestedTeamSize} por time · {s.scorePlural} · {s.hasGoalkeeper ? 'com goleiro' : 'sem goleiro'} · {s.rules?.mode === 'sets' ? 'sets' : s.rules?.mode === 'periods' ? 'períodos' : 'placar total'}</Text>{role !== 'support' && <Button small variant="outline" label={`Editar ${s.label}`} onPress={() => setEditingSport(s)} />}</View>)}
      </>}
      {tab === 'Auditoria' && <><Text style={styles.copy}>Registros imutáveis de alterações administrativas. O backend registra autor, motivo, valores anteriores e novos.</Text>{snapshot.audit.length === 0 && <Text style={styles.caption}>Ainda não há alterações administrativas.</Text>}{snapshot.audit.map(a => <View style={styles.listRow} key={a.id}><Text style={styles.sectionTitle}>{a.action}</Text><Text style={styles.copy}>{a.reason}</Text><Text selectable style={styles.caption}>{new Date(a.createdAt).toLocaleString('pt-BR')} · {a.targetId || 'Configuração global'}</Text></View>)}</>}
    </>}
  </Screen>;
}

function PlanEditor({ plan, editable, onSave }: { plan: CommercialPlan; editable: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  const [name, setName] = useState(plan.name); const [price, setPrice] = useState(String(plan.monthlyPrice)); const [active, setActive] = useState(plan.active);
  const amount = Number(price.replace(',', '.'));
  return <Card><Text style={styles.sectionTitle}>{plan.audience === 'player' ? 'Jogador' : plan.audience === 'team' ? 'Time' : 'Estabelecimento'}</Text><TextField label="Nome" value={name} onChangeText={setName} editable={editable} /><TextField label="Preço mensal (R$)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" editable={editable} /><View style={styles.row}><Text style={[styles.copy, { flex: 1 }]}>Oferta disponível</Text><Switch value={active} onValueChange={setActive} disabled={!editable} /></View>{editable && <Button small label="Revisar alteração" disabled={!price.trim() || !Number.isFinite(amount) || amount < 0 || amount > 10000 || name.trim().length < 3} onPress={() => onSave({ name, monthlyPrice: amount, active })} />}</Card>;
}

function ConfigurationEditor({ configuration, editable, onSave }: { configuration: PlatformSnapshot['configuration']; editable: boolean; onSave: (payload: Record<string, unknown>) => void }) {
  const [settings, setSettings] = useState(configuration.settings);
  const [commission, setCommission] = useState(String(settings.bookingCommissionPercent));
  const [allowance, setAllowance] = useState(String(settings.whatsappMonthlyAllowance));
  const [trial, setTrial] = useState(String(settings.trialDays));
  const updated: PlatformSettings = { ...settings, bookingCommissionPercent: Number(commission.replace(',', '.')), whatsappMonthlyAllowance: Number(allowance), trialDays: Number(trial) };
  return <Card><Text style={styles.sectionTitle}>Produto e regras comerciais</Text>{([{ key: 'discoveryEnabled', label: 'Descoberta de jogos abertos' }, { key: 'referralsEnabled', label: 'Programa de indicação' }, { key: 'sponsoredEnabled', label: 'Sugestões patrocinadas' }] as const).map(item => <View key={item.key} style={styles.row}><Text style={[styles.copy, { flex: 1 }]}>{item.label}</Text><Switch value={settings[item.key]} disabled={!editable} onValueChange={value => setSettings(s => ({ ...s, [item.key]: value }))} /></View>)}<TextField label="Comissão proposta sobre novas reservas (%)" value={commission} onChangeText={setCommission} keyboardType="decimal-pad" editable={editable} /><TextField label="Franquia mensal proposta de WhatsApp" value={allowance} onChangeText={setAllowance} keyboardType="number-pad" editable={editable} /><TextField label="Dias de teste (1 a 30)" value={trial} onChangeText={setTrial} keyboardType="number-pad" editable={editable} /><Text style={styles.caption}>Sem comissão automática nesta versão. Franquia não substitui medição e cobrança do provedor. Não informe tokens ou dados bancários aqui.</Text>{editable && <Button label="Revisar configurações" small disabled={!validatePlatformSettings(updated) || !commission.trim() || !allowance.trim() || !trial.trim()} onPress={() => onSave({ revision: configuration.revision, settings: updated })} />}</Card>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, title: { fontSize: 21, fontWeight: '900', color: colors.text },
  caption: { fontSize: 12, lineHeight: 18, color: colors.textMuted }, copy: { fontSize: 13, lineHeight: 19, color: colors.text, marginBottom: spacing.sm },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: spacing.sm }, row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  tabs: { gap: spacing.sm }, tab: { borderWidth: 1, borderColor: colors.cardBorder, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 }, activeTab: { backgroundColor: colors.bgElevated, borderColor: colors.primary }, tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, metric: { width: '47%', padding: spacing.md, backgroundColor: colors.card, borderRadius: 14 }, value: { color: colors.text, fontSize: 24, fontWeight: '900' },
  warning: { color: colors.warning, fontSize: 12, lineHeight: 18 }, notice: { color: colors.secondary, fontSize: 13, lineHeight: 19 }, listRow: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
});
