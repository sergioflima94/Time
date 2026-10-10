import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMockMode, supabase } from '@/lib/supabase';
import { agreementPrice, canManageAgreement, canUseLicense, licenseIsActive } from '@/lib/commercial';
import type { AgreementInput, CommercialAccessSnapshot, CommercialAgreement } from '@/types/commercial';
import type { PlatformSnapshot } from '@/types/platform';
import type { Json } from '@/types/supabase.generated';
import { useAppStore } from './useAppStore';
import { useProStore } from './useProStore';
import { useAuthStore } from './useAuthStore';

const storageKey = 'borajogo-commercial-demo-v1';
let hydration: Promise<void> | null = null;
let adminRequest = 0;
interface CommercialState {
  agreements: CommercialAgreement[];
  demoAudit: PlatformSnapshot['audit'];
  demoRequests: Record<string,string>;
  hydrate: () => Promise<void>;
  loadAdmin: () => Promise<void>;
  save: (input: AgreementInput, reason: string) => Promise<void>;
  revoke: (id: string, revision: number, reason: string) => Promise<void>;
  respond: (id: string, revision: number, accept: boolean) => Promise<void>;
  demoAccess: () => CommercialAccessSnapshot;
  reset: () => void;
}
function requireDemoOwner(reason: string) {
  if (!useAuthStore.getState().isLoggedIn || useAppStore.getState().currentPlayerId!=='p1') throw new Error('Somente o proprietário concede condições comerciais.');
  if (reason.trim().length<8 || reason.trim().length>1000) throw new Error('Informe um motivo entre 8 e 1000 caracteres.');
}
async function persistDemo() {
  const { agreements, demoAudit, demoRequests } = useCommercialStore.getState();
  await AsyncStorage.setItem(storageKey,JSON.stringify({ agreements, demoAudit, demoRequests }));
}
function audit(action: string, id: string, reason: string) {
  useCommercialStore.setState(s=>({ demoAudit: [...s.demoAudit,{id:`commercial-${Date.now()}-${s.demoAudit.length}`,action,targetId:id,reason,createdAt:new Date().toISOString()}] }));
}
export const useCommercialStore = create<CommercialState>((set,get)=>({
  agreements: [], demoAudit: [], demoRequests: {},
  reset: () => { adminRequest++; if (!isMockMode) set({ agreements: [] }); },
  hydrate: async () => {
    if (!isMockMode) return;
    if (!hydration) hydration = (async()=> {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) { const saved = JSON.parse(raw); if (Array.isArray(saved.agreements) && Array.isArray(saved.demoAudit)) set({agreements:saved.agreements,demoAudit:saved.demoAudit,demoRequests:saved.demoRequests ?? {}}); }
      } catch { /* Demo local ausente/corrompida. */ }
    })();
    await hydration;
  },
  loadAdmin: async () => {
    if (isMockMode) { await get().hydrate(); return; }
    if (!supabase) throw new Error('Backend indisponível.');
    const request=++adminRequest; const authId=useAuthStore.getState().authUserId;
    const {data,error}=await supabase.rpc('commercial_admin_data');
    if(error) throw error;
    if(request===adminRequest && authId===useAuthStore.getState().authUserId && useAuthStore.getState().isLoggedIn) set({agreements:data as unknown as CommercialAgreement[]});
  },
  save: async (input,reason)=> {
    if(isMockMode) {
      requireDemoOwner(reason); await get().hydrate();
      const app=useAppStore.getState();
      const target=input.audience==='player' ? app.players.some(p=>p.id===input.targetId && !p.isGuest)
        : input.audience==='team' ? app.peladas.some(p=>p.id===input.targetId) : app.establishments.some(e=>e.id===input.targetId);
      const plan=useProStore.getState().plans.find(p=>p.id===input.planId);
      if(!target || !plan) throw new Error('Destinatário ou plano não encontrado.');
      const requestSignature=JSON.stringify([Object.keys(input).sort().map(k=>[k,input[k as keyof AgreementInput]]),reason.trim()]);
      if (get().agreements.some(a=>a.id===input.requestId)) {
        if (get().demoRequests[input.requestId]!==requestSignature) throw new Error('Confirmação já usada para outra condição.');
        return;
      }
      const price=agreementPrice(input,plan);
      const row: CommercialAgreement={...input,id:input.requestId,status:input.kind==='license'?'granted':'offered',
        listMonthlyPrice:plan.monthlyPrice,agreedMonthlyPrice:price,discountPercent:input.kind==='discount'?input.discountPercent:null,
        durationMonths:input.kind==='license'?null:input.durationMonths,revision:1,createdAt:new Date().toISOString(),respondedAt:null};
      set(s=>({agreements:[row,...s.agreements],demoRequests:{...s.demoRequests,[input.requestId]:requestSignature}})); audit('commercial.grant',row.id,reason.trim()); await persistDemo();
    } else {
      if(!supabase) throw new Error('Backend indisponível.');
      const {error}=await supabase.rpc('save_commercial_agreement',{p_payload:input as unknown as Json,p_reason:reason.trim()});
      if(error) throw error; await get().loadAdmin();
    }
  },
  revoke: async (id,revision,reason)=> {
    if(isMockMode) {
      requireDemoOwner(reason); await get().hydrate();
      const a=get().agreements.find(a=>a.id===id);
      if(!a || a.revision!==revision) throw new Error('Condição alterada. Atualize a página.');
      if(a.status==='revoked') return;
      set(s=>({agreements:s.agreements.map(a=>a.id===id?{...a,status:'revoked',revision:a.revision+1}:a)}));
      audit('commercial.revoke',id,reason.trim()); await persistDemo();
    } else {
      if(!supabase) throw new Error('Backend indisponível.');
      const {error}=await supabase.rpc('revoke_commercial_agreement',{p_id:id,p_revision:revision,p_reason:reason.trim()});
      if(error) throw error; await get().loadAdmin();
    }
  },
  respond: async (id,revision,accept)=> {
    if(isMockMode) {
      await get().hydrate(); const a=get().agreements.find(a=>a.id===id);
      if(!useAuthStore.getState().isLoggedIn || !a || !canManageAgreement(a,useAppStore.getState())) throw new Error('Você não representa este destinatário.');
      if(a.revision!==revision || a.status!=='offered' || !a.expiresAt || Date.parse(a.expiresAt)<=Date.now()) throw new Error('Oferta não está disponível. Atualize a página.');
      set(s=>({agreements:s.agreements.map(a=>a.id===id?{...a,status:accept?'accepted':'declined',revision:a.revision+1,respondedAt:new Date().toISOString()}:a)}));
      audit('commercial.response',id,accept?'Oferta aceita pelo destinatário; aguardando contratação e pagamento':'Oferta recusada pelo destinatário'); await persistDemo();
    } else {
      if(!supabase) throw new Error('Backend indisponível.');
      const {error}=await supabase.rpc('respond_commercial_agreement',{p_id:id,p_revision:revision,p_accept:accept});
      if(error) throw error;
    }
  },
  demoAccess: ()=> {
    const app=useAppStore.getState();
    return {role:app.currentPlayerId==='p1'?'owner':null,
      agreements:get().agreements.filter(a=>canManageAgreement(a,app)),
      licenses:get().agreements.filter(a=>a.kind==='license' && a.status==='granted' && licenseIsActive(a) && canUseLicense(a,app))};
  },
}));
