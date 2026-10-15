import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import { useOwnerBenefits } from '@/hooks/useOwnerBenefits';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

/** Being a platform admin never transfers ownership of a customer's venue. */
export function OwnerWorkspaceEntry() {
  const included = useOwnerBenefits();
  return <Card><Text style={{color:colors.text,fontSize:16,fontWeight:'700'}}>Gestão de campos e quadras</Text>
    <Text style={{color:colors.textMuted,fontSize:13,lineHeight:20}}>
      {included ? 'Seu acesso de proprietário da plataforma inclui os recursos do estabelecimento, sem mensalidade. ' : ''}
      Cadastre seus espaços e gerencie reservas, comandas, equipe e aulas. Os dados ficam separados dos times e dos clientes da plataforma.
    </Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
      <Button small label="Meus estabelecimentos" onPress={()=>router.push('/estabelecimento')} />
      <Button small variant="outline" label="Acessos da equipe" onPress={()=>router.push('/operacao')} />
    </View></Card>;
}
