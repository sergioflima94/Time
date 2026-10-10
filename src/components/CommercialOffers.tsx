import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { useCommercialAccess } from '@/hooks/useCommercialAccess';
import { agreementLabel } from '@/lib/commercial';
import { formatBRL } from '@/lib/payments';
import { useCommercialStore } from '@/store/useCommercialStore';
import { usePlatformAccessStore } from '@/store/usePlatformAccessStore';
import { useProStore } from '@/store/useProStore';
import type { CommercialAudience } from '@/types/pro';

export function CommercialOffers({ audience, targetId }: { audience: CommercialAudience; targetId?: string }) {
  const { agreements }=useCommercialAccess(audience,targetId);
  const plans=useProStore(s=>s.plans);
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  async function respond(id: string,revision: number,accept: boolean) {
    setBusy(id); setNotice('');
    try {
      await useCommercialStore.getState().respond(id,revision,accept);
      await usePlatformAccessStore.getState().refresh();
      setNotice(accept?'Oferta aceita. A contratação e o pagamento ainda precisam ser concluídos; nenhum valor foi cobrado.':'Oferta recusada.');
    } catch(e) {setNotice(e instanceof Error?e.message:'Não foi possível responder.');}
    finally {setBusy(null);}
  }
  return <>{!!notice && <Text accessibilityLiveRegion="polite" style={styles.copy}>{notice}</Text>}{agreements.map(a=><Card key={a.id} style={styles.card}>
    <Text style={styles.title}>{plans.find(p=>p.id===a.planId)?.name ?? 'Condição comercial'} · {agreementLabel(a)}</Text>
    <Text style={styles.copy}>{a.kind==='license'?'Benefícios gratuitos, sem assinatura paga.':`${formatBRL(a.agreedMonthlyPrice)}/mês por ${a.durationMonths} mensalidades · preço de referência ${formatBRL(a.listMonthlyPrice)}${a.discountPercent!==null?` · desconto ${a.discountPercent}%`:''}`}</Text>
    <Text style={styles.copy}>{a.expiresAt?`${a.kind==='license'?'Licença até':'Responder até'} ${new Date(a.expiresAt).toLocaleDateString('pt-BR')}`:'Licença sem prazo definido; pode ser revogada pelo proprietário.'}</Text>
    {!!a.note && <Text style={styles.copy}>{a.note}</Text>}
    {a.status==='accepted' && <Text style={styles.copy}>A condição foi aceita, mas não há assinatura ativa nem pagamento confirmado. A duração negociada começa no contrato pago, não no aceite.</Text>}
    {a.status==='offered' && a.expiresAt && Date.parse(a.expiresAt)>Date.now() && <View style={styles.row}>
      <Button small label="Aceitar oferta" disabled={!!busy} loading={busy===a.id} onPress={()=>void respond(a.id,a.revision,true)} />
      <Button small variant="outline" label="Recusar" disabled={!!busy} onPress={()=>void respond(a.id,a.revision,false)} />
    </View>}
  </Card>)}</>;
}
const styles=StyleSheet.create({card:{gap:spacing.xs,marginTop:spacing.sm},title:{fontSize:14,fontWeight:'800',color:colors.text},copy:{fontSize:12,lineHeight:18,color:colors.textMuted},row:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm}});
