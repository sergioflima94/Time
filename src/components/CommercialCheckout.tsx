import { useEffect, useState } from 'react';
import { Linking, Platform, Switch, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { hubStyles as st } from '@/components/PlayHubPanels';
import { supabase, isMockMode } from '@/lib/supabase';
import { usePlatformAccessStore } from '@/store/usePlatformAccessStore';
import { useAppStore } from '@/store/useAppStore';
interface Order {id:string;cycle:number;amount:number;status:string;periodEnd:string|null;expiresAt:string}
export function CommercialCheckout({agreementId}:{agreementId:string}){
  const me=useAppStore(s=>s.currentPlayerId);const [terms,setTerms]=useState(false);const [orders,setOrders]=useState<Order[]>([]);const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{let live=true;setOrders([]);setTerms(false);if(!isMockMode&&supabase)void supabase.rpc('commercial_checkout_state',{p_agreement:agreementId}).then(({data,error})=>{if(live){if(error)setNotice(error.message);else setOrders(data as unknown as Order[]);}});return()=>{live=false;};},[agreementId,me]);
  async function refresh(){if(supabase&&!isMockMode){const {data,error}=await supabase.rpc('commercial_checkout_state',{p_agreement:agreementId});if(error)throw new Error(error.message);setOrders(data as unknown as Order[]);}await usePlatformAccessStore.getState().refresh();}
  async function checkout(){setBusy(true);setNotice('');try{
    if(isMockMode)throw new Error('Demonstração: nenhuma cobrança nem período pago é criado. O checkout real precisa das credenciais da plataforma e homologação.');
    if(!supabase)throw new Error('Backend indisponível.');
    const {data,error}=await supabase.functions.invoke('create-commercial-checkout',{body:{agreementId,termsVersion:'monthly-manual-v1'}});
    if(error){let message='Checkout indisponível. Nenhuma assinatura foi ativada.';try{const body=await error.context?.json();message=body?.error??message;}catch{/* No secret/raw body */}throw new Error(message);}
    if(typeof data?.url!=='string'||!/^https:\/\/(www\.)?mercadopago\.com\.br\//.test(data.url))throw new Error('URL de pagamento inválida.');
    await Linking.openURL(data.url);setNotice('Checkout aberto. Voltar ao app não comprova pagamento; atualize após concluir.');await refresh();
  }catch(e){setNotice(e instanceof Error?e.message:'Não foi possível abrir o checkout.');}finally{setBusy(false);}}
  const active=orders.some(o=>o.status==='paid'&&!!o.periodEnd&&Date.parse(o.periodEnd)>Date.now());
  return <View style={{gap:8}}>{orders.map(o=><Text key={o.id} style={st.copy}>Mensalidade {o.cycle}: {o.status==='paid'?`paga · período até ${o.periodEnd?new Date(o.periodEnd).toLocaleDateString('pt-BR'):''}`:o.status==='pending'?'aguardando pagamento':o.status==='refunded'?'estornada · revisão necessária':'contestada · revisão necessária'}</Text>)}
    {Platform.OS==='web'?<><View style={st.row}><Switch accessibilityLabel="Aceito pagamento mensal sem renovação automática" value={terms} onValueChange={setTerms} disabled={busy} /><Text style={st.copy}>Aceito pagar uma mensalidade pelo valor negociado, sem renovação automática. Cada pagamento aprovado libera um mês; a oferta limita a quantidade de mensalidades.</Text></View><Button small label={active?'Período pago ativo':'Pagar mensalidade negociada'} disabled={busy||!terms||active} loading={busy} onPress={()=>void checkout()} /></>:<Text style={st.copy}>Checkout comercial externo disponível somente na versão web homologada. Compras digitais no aplicativo nativo continuam sujeitas à integração e às regras das lojas.</Text>}
    <Button small variant="outline" label="Consultar confirmação de pagamento" disabled={busy} onPress={()=>void refresh().catch(e=>setNotice(e.message))} />{!!notice&&<Text accessibilityLiveRegion="polite" style={st.copy}>{notice}</Text>}
  </View>;
}
