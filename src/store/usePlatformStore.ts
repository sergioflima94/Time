import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSportCatalog, useSportCatalog, validateSport, type SportDefinition } from '@/constants/sports';

import { isMockMode, supabase } from '@/lib/supabase';
import { DEFAULT_PLATFORM_SETTINGS, validatePlatformSettings, type PlatformAction, type PlatformSettings, type PlatformSnapshot } from '@/types/platform';
import { useAppStore } from './useAppStore';
import { useAuthStore } from './useAuthStore';
import { useProStore } from './useProStore';
import type { Json } from '@/types/supabase.generated';
import { useCommercialStore } from './useCommercialStore';
import type { AgreementInput } from '@/types/commercial';

interface PlatformState {
  snapshot: PlatformSnapshot | null;
  accessFor: string | null;
  settings: PlatformSettings;
  publicReady: boolean;
  loading: boolean;
  error: string | null;
  load: (query?: string) => Promise<void>;
  loadPublic: () => Promise<void>;
  reset: () => void;
  act: (action: PlatformAction, id: string | null, payload: Record<string, unknown>, reason: string) => Promise<void>;
}

let epoch = 0;
let demoRevision = 1;
let demoSettings = { ...DEFAULT_PLATFORM_SETTINGS };
const demoSuspended = new Set<string>();
const demoAudit: PlatformSnapshot['audit'] = [];
let demoHydration: Promise<void> | null = null;
async function hydrateDemo() {
  if (!demoHydration) demoHydration = (async () => {
    try {
      const raw = await AsyncStorage.getItem('borajogo-platform-demo-v1');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.settings && validatePlatformSettings(saved.settings)) demoSettings = saved.settings;
      if (Number.isInteger(saved.revision) && saved.revision > 0) demoRevision = saved.revision;
      if (Array.isArray(saved.sports) && saved.sports.length && saved.sports.every(validateSport)) setSportCatalog(saved.sports);
      if (Array.isArray(saved.audit)) demoAudit.push(...saved.audit.slice(-100));
    } catch { /* Cache de demonstração ausente/corrompido: usa os padrões. */ }
  })();
  await demoHydration;
}

function sessionKey(): string | null {
  const auth = useAuthStore.getState();
  if (!auth.isLoggedIn) return null;
  return isMockMode ? `demo:${useAppStore.getState().currentPlayerId}` : auth.authUserId;
}

export async function recordDemoPlatformAudit(action:string,id:string|null,reason:string){
  if(!isMockMode)return;
  await hydrateDemo();
  demoAudit.push({id:`${Date.now()}-${demoAudit.length}`,action,targetId:id,reason,createdAt:new Date().toISOString()});
  await AsyncStorage.setItem('borajogo-platform-demo-v1',JSON.stringify({settings:demoSettings,revision:demoRevision,sports:useSportCatalog.getState().catalog,audit:demoAudit.slice(-100)}));
}

function demoSnapshot(query: string): PlatformSnapshot {
  const app = useAppStore.getState(); const pro = useProStore.getState();
  const matches = (name: string) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  return {
    role: 'owner', configuration: { revision: demoRevision, settings: { ...demoSettings } },
    metrics: { players: app.players.filter(p => !p.isGuest).length, teams: app.peladas.length, establishments: app.establishments.length,
      upcomingGames: app.games.filter(g => Date.parse(g.scheduledAt) >= Date.now() && !['finished','cancelled'].includes(g.status)).length,
      openReports: pro.moderationReports.filter(r => ['open','reviewing'].includes(r.status)).length,
      activeSubscriptions: pro.subscriptions.filter(s => s.status === 'active' && Date.parse(s.currentPeriodEnd) > Date.now()).length },
    players: app.players.filter(p => !p.isGuest && matches(p.name)).map(p => ({ ...p, suspended: demoSuspended.has(p.id) })),
    teams: app.peladas.filter(p => matches(p.name)),
    establishments: app.establishments.filter(e => matches(e.name)).map(e => ({ ...e, fieldCount: app.fields.filter(f => f.establishmentId === e.id).length })),
    plans: pro.plans, reports: pro.moderationReports,
    admins: [{ authUserId: 'demo-owner', name: 'Administrador de demonstração', role: 'owner', active: true }],
    audit: [...demoAudit,...useCommercialStore.getState().demoAudit].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100),
  };
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  snapshot: null, accessFor: null, settings: { ...DEFAULT_PLATFORM_SETTINGS }, publicReady: isMockMode, loading: false, error: null,
  reset: () => { epoch++; useCommercialStore.getState().reset(); set({ snapshot: null, accessFor: null, loading: false, error: null }); },
  loadPublic: async () => {
    if (isMockMode || !supabase) { await hydrateDemo(); set({ settings: { ...demoSettings }, publicReady: true }); return; }
    const [configuration, sports] = await Promise.all([
      supabase.from('platform_configuration').select('settings').single(),
      supabase.from('sport_catalog').select('definition,revision').order('id'),
    ]);
    if (!sports.error && sports.data?.length) {
      const catalog = (sports.data as unknown as Array<{ definition: SportDefinition; revision: number }>).map(s => ({ ...s.definition, revision: s.revision }));
      if (catalog.every(validateSport)) setSportCatalog(catalog);
    }
    const { data, error } = configuration;
    if (!error && data && validatePlatformSettings((data as unknown as { settings: PlatformSettings }).settings)) set({ settings: (data as unknown as { settings: PlatformSettings }).settings, publicReady: true });
    else set({ publicReady: false });
  },
  load: async (query = '') => {
    const key = sessionKey(); const requestEpoch = ++epoch;
    if (!key) { set({ snapshot: null, accessFor: null, loading: false }); return; }
    set({ loading: true, error: null, snapshot: get().accessFor === key ? get().snapshot : null });
    try {
      let snapshot: PlatformSnapshot;
      if (isMockMode) {
        await hydrateDemo();
        await useCommercialStore.getState().hydrate();
        if (useAppStore.getState().currentPlayerId !== 'p1') throw new Error('Este perfil não é administrador da plataforma.');
        snapshot = demoSnapshot(query);
      } else {
        if (!supabase) throw new Error('Backend indisponível.');
        const { data, error } = await supabase.rpc('platform_console_snapshot', { p_query: query });
        if (error) throw error;
        snapshot = data as unknown as PlatformSnapshot;
      }
      if (requestEpoch !== epoch || key !== sessionKey()) return;
      if (snapshot.role === 'owner') await useCommercialStore.getState().loadAdmin();
      if (requestEpoch !== epoch || key !== sessionKey()) return;
      set({ snapshot, accessFor: key, settings: snapshot.configuration.settings, publicReady: true, loading: false });
    } catch (error) {
      if (requestEpoch === epoch) set({ snapshot: null, accessFor: key, loading: false, error: error instanceof Error ? error.message : 'Sem permissão ou console ainda não instalado no backend.' });
    }
  },
  act: async (action, id, payload, reason) => {
    const snapshot = get().snapshot;
    if (!snapshot || get().accessFor !== sessionKey()) throw new Error('Sessão administrativa inválida.');
    if (reason.trim().length < 8) throw new Error('Explique o motivo com pelo menos 8 caracteres.');
    if (snapshot.role === 'support' && action !== 'report') throw new Error('Suporte só pode tratar denúncias.');
    if (action === 'commercial' || action === 'commercial_revoke') {
      if (snapshot.role !== 'owner') throw new Error('Somente o proprietário concede condições comerciais.');
      if (action === 'commercial') await useCommercialStore.getState().save(payload as unknown as AgreementInput,reason);
      else await useCommercialStore.getState().revoke(id!,Number(payload.revision),reason);
      await get().load(); return;
    }
    if (isMockMode) {
      if (useAppStore.getState().currentPlayerId !== 'p1') throw new Error('Acesso negado.');
      if (action === 'sport') {
        const sport = payload.definition as SportDefinition;
        const catalog = useSportCatalog.getState().catalog;
        const existing = catalog.find(s => s.id === sport.id);
        if (!validateSport(sport) || payload.revision !== (existing?.revision ?? 0)) throw new Error('Esporte inválido ou alterado. Atualize o catálogo.');
        if (!sport.active && !catalog.some(s => s.id !== sport.id && s.active)) throw new Error('Mantenha pelo menos um esporte ativo.');
        setSportCatalog([...catalog.filter(s => s.id !== sport.id), { ...sport, revision: (existing?.revision ?? 0) + 1 }]);
      } else if (action === 'settings') {
        const settings = payload.settings as PlatformSettings;
        if (payload.revision !== demoRevision || !validatePlatformSettings(settings)) throw new Error('Configuração inválida ou alterada. Atualize a página.');
        demoSettings = { ...settings }; demoRevision++;
      } else if (action === 'plan') {
        if (!Number.isFinite(payload.monthlyPrice) || Number(payload.monthlyPrice) < 0 || Number(payload.monthlyPrice) > 10000 || String(payload.name).trim().length < 3) throw new Error('Plano inválido.');
        useProStore.setState(state => ({ plans: state.plans.map(p => p.id === id ? { ...p, name: String(payload.name).trim(), monthlyPrice: Number(payload.monthlyPrice), active: Boolean(payload.active) } : p) }));
      } else if (action === 'account') {
        if (id === 'p1') throw new Error('Não é permitido suspender o proprietário ativo.');
        if (payload.suspended) demoSuspended.add(id!); else demoSuspended.delete(id!);
      } else if (action === 'report') {
        if (!['reviewing','resolved','dismissed'].includes(String(payload.status))) throw new Error('Estado inválido.');
        useProStore.setState(state => ({ moderationReports: state.moderationReports.map(r => r.id === id ? { ...r, status: payload.status as 'reviewing' | 'resolved' | 'dismissed', resolvedAt: payload.status === 'reviewing' ? null : new Date().toISOString() } : r) }));
      } else throw new Error('Gestão de administradores exige contas reais no Supabase.');
      demoAudit.push({ id: `${Date.now()}-${demoAudit.length}`, action, targetId: id, reason: reason.trim(), createdAt: new Date().toISOString() });
      await AsyncStorage.setItem('borajogo-platform-demo-v1',JSON.stringify({ settings: demoSettings, revision: demoRevision, sports: useSportCatalog.getState().catalog, audit: demoAudit.slice(-100) }));
    } else {
      if (!supabase) throw new Error('Backend indisponível.');
      const { revision: _revision, ...definition } = (payload.definition ?? {}) as SportDefinition;
      const { error } = action === 'sport'
        ? await supabase.rpc('save_platform_sport', { p_definition: definition as unknown as Json, p_revision: Number(payload.revision), p_reason: reason.trim() })
        : await supabase.rpc('platform_console_action', { p_action: action, p_id: id!, p_payload: payload as Json, p_reason: reason.trim() });
      if (error) throw error;
      if (action === 'sport') await get().loadPublic();
    }
    await get().load();
  },
}));
