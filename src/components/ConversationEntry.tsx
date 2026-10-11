import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { colors } from '@/constants/theme';
import { validateWhatsAppGroup } from '@/lib/conversationRules';
import type { BookingChatKind, ConversationKind } from '@/types/conversations';

export function ConversationEntry({kind,contextId,bookingKind,label='Conversar'}:{kind:ConversationKind;contextId:string;bookingKind?:BookingChatKind;label?:string}) {
  return <Button small variant="outline" label={label} onPress={() => router.push({pathname:'/conversas',params:{kind,contextId,...(bookingKind?{bookingKind}:{})}})} />;
}
export function WhatsAppGroupButton({url}:{url:string}) {
  const [error,setError] = useState('');
  async function open() {
    setError('');
    try {const safe=validateWhatsAppGroup(url); if(safe) await Linking.openURL(safe);} catch {setError('Não foi possível abrir o grupo. Confira o WhatsApp ou peça um novo convite ao administrador.');}
  }
  return <View><Button small variant="outline" label="Abrir grupo no WhatsApp" onPress={() => void open()} />{!!error&&<Text accessibilityLiveRegion="polite" style={{color:colors.danger,fontSize:12,marginTop:6}}>{error}</Text>}</View>;
}
