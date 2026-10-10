import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { agreementLabel, agreementPrice } from '@/lib/commercial';
import { formatBRL } from '@/lib/payments';
import { isMockMode } from '@/lib/supabase';
import { createUuid } from '@/lib/uuid';
import { useCommercialStore } from '@/store/useCommercialStore';
import type { AgreementInput, AgreementKind, CommercialAgreement } from '@/types/commercial';
import type { CommercialAudience } from '@/types/pro';
import type { PlatformSnapshot } from '@/types/platform';

export function CommercialLicensePanel({ snapshot, onReview, onRevoke }: {
  snapshot: PlatformSnapshot;
  onReview: (input: AgreementInput, description: string)=>void;
  onRevoke: (a: CommercialAgreement)=>void;
}) {
  const rows=useCommercialStore(s=>s.agreements);
  const [audience,setAudience]=useState<CommercialAudience>('player');
  const [target,setTarget]=useState(''); const [planId,setPlanId]=useState('');
  const [kind,setKind]=useState<AgreementKind>('license'); const [search,setSearch]=useState('');
  const [days,setDays]=useState('30'); const [unlimited,setUnlimited]=useState(false);
  const [value,setValue]=useState('20'); const [months,setMonths]=useState('3'); const [note,setNote]=useState('');
  const targets=audience==='player'?snapshot.players.filter(p=>!p.suspended && (isMockMode || p.authUserId)) : audience==='team'?snapshot.teams:snapshot.establishments;
  const plans=snapshot.plans.filter(p=>p.active && p.audience===audience);
  const plan=plans.find(p=>p.id===planId) ?? plans[0];
  const chosen=targets.find(t=>t.id===target);
  const daysNumber=Number(days); const expiry=kind==='license' && unlimited?null:
    Number.isInteger(daysNumber) && daysNumber>=1 && daysNumber<=3650?new Date(Date.now()+daysNumber*86400000).toISOString():'';
  const input: AgreementInput={requestId:'preview',expectedMonthlyPrice:plan?.monthlyPrice ?? 0,audience,targetId:target,planId:plan?.id ?? '',kind,expiresAt:expiry,
    agreedMonthlyPrice:kind==='price'?Number(value.replace(',','.')):null,discountPercent:kind==='discount'?Number(value.replace(',','.')):null,
    durationMonths:kind==='license'?null:Number(months),note:note.trim()};
  let error=''; let price=0;
  try { if(!plan || !chosen || expiry==='') throw new Error('Escolha destinatário, plano e prazo válido.'); price=agreementPrice(input,plan); }
  catch(e){error=e instanceof Error?e.message:'Condição inválida.';}
  const names=(a:CommercialAgreement)=> (a.audience==='player'?snapshot.players:a.audience==='team'?snapshot.teams:snapshot.establishments).find(t=>t.id===a.targetId)?.name ?? a.targetId;
  return <>
    <Text style={styles.copy}>Condições individuais concedidas pelo proprietário. Licença libera benefícios, não papel administrativo. Ofertas pagas precisam de aceite e contratação; nunca substituem confirmação do provedor.</Text>
    <Card style={styles.form}>
      <Text style={styles.title}>Conceder licença ou negociar mensalidade</Text>
      <SegmentedControl value={audience} onChange={v=>{setAudience(v);setTarget('');setPlanId('');}} options={[{value:'player',label:'Jogador'},{value:'team',label:'Time'},{value:'establishment',label:'Campo'}]} />
      <TextField label="Filtrar destinatários" value={search} onChangeText={setSearch} placeholder="Nome do jogador, time ou campo" />
      <Text style={styles.copy}>Use a busca global do console para localizar cadastros fora da lista atual.</Text>
      <View style={styles.row}>{targets.filter(t=>t.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).slice(0,12).map(t=><Button key={t.id} small variant={target===t.id?'primary':'outline'} label={t.name} onPress={()=>setTarget(t.id)} />)}</View>
      {chosen && <Text style={styles.copy}>Destinatário: {chosen.name}</Text>}
      <View style={styles.row}>{plans.map(p=><Button key={p.id} small label={p.name} variant={plan?.id===p.id?'primary':'outline'} onPress={()=>setPlanId(p.id)} />)}</View>
      <SegmentedControl value={kind} onChange={setKind} options={[{value:'license',label:'Gratuita'},{value:'discount',label:'Desconto %'},{value:'price',label:'Valor mensal'}]} />
      {kind==='license' && <View style={styles.row}><Text style={[styles.copy,{flex:1}]}>Licença sem prazo definido</Text><Switch value={unlimited} onValueChange={setUnlimited} /></View>}
      {!(kind==='license' && unlimited) && <TextField label={kind==='license'?'Validade da licença (dias)':'Prazo para aceitar (dias)'} value={days} onChangeText={setDays} keyboardType="number-pad" />}
      {kind!=='license' && <><TextField label={kind==='discount'?'Desconto (%)':'Mensalidade negociada (R$)'} value={value} onChangeText={setValue} keyboardType="decimal-pad" /><TextField label="Duração da condição (mensalidades)" value={months} onChangeText={setMonths} keyboardType="number-pad" /></>}
      <TextField label="Mensagem para o destinatário (opcional)" value={note} onChangeText={setNote} multiline maxLength={500} />
      <Text style={styles.copy}>{error || `${plan?.name} · ${formatBRL(price)}/mês${kind==='license'?' · licença gratuita':` · referência ${formatBRL(plan!.monthlyPrice)}/mês`}`}</Text>
      <Button label="Revisar condição comercial" disabled={!!error} onPress={()=>onReview({...input,requestId:createUuid()},`${kind==='license'?'Conceder licença gratuita':'Oferecer '+formatBRL(price)+'/mês'} de ${plan!.name} para ${chosen!.name}. ${expiry?'Prazo: '+new Date(expiry).toLocaleDateString('pt-BR'):'Sem prazo definido'}. Não concede papel administrativo nem registra pagamento.`)} />
    </Card>
    <Text style={styles.title}>Licenças e negociações recentes</Text>
    {rows.length===0 && <Text style={styles.copy}>Nenhuma condição concedida ainda.</Text>}
    {rows.map(a=><Card key={a.id} style={styles.form}>
      <Text style={styles.title}>{names(a)}</Text><Text style={styles.copy}>{snapshot.plans.find(p=>p.id===a.planId)?.name ?? a.planId} · {agreementLabel(a)}</Text>
      <Text style={styles.copy}>{formatBRL(a.agreedMonthlyPrice)}/mês{a.durationMonths?` por ${a.durationMonths} mensalidades`:''} · referência {formatBRL(a.listMonthlyPrice)}</Text>
      <Text style={styles.copy}>{a.expiresAt?`${a.kind==='license'?'Válida até':'Prazo para aceite'} ${new Date(a.expiresAt).toLocaleDateString('pt-BR')}`:'Sem prazo definido'}{a.discountPercent!==null?` · ${a.discountPercent}% de desconto`:''}</Text>
      {!!a.note && <Text style={styles.copy}>{a.note}</Text>}
      {a.status!=='revoked' && <Button small variant="danger" label="Revogar condição" onPress={()=>onRevoke(a)} />}
    </Card>)}
  </>;
}
const styles=StyleSheet.create({form:{gap:spacing.sm},title:{color:colors.text,fontSize:15,fontWeight:'800'},copy:{fontSize:12,lineHeight:18,color:colors.textMuted},row:{flexDirection:'row',flexWrap:'wrap',gap:spacing.xs,alignItems:'center'}});
