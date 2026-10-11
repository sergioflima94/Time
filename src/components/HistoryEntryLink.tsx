import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import type { HistoryKind } from '@/lib/historyRules';

export function HistoryEntryLink({kind,contextId,label='Ver linha do tempo'}:{kind:HistoryKind;contextId:string;label?:string}) {
  return <Button small variant="outline" label={label} onPress={()=>router.push({pathname:'/historico',params:{scope:'context',kind,contextId}})} />;
}
