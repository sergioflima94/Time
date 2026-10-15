import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WorkspaceEmpty, WorkspaceGrid, WorkspaceHeader } from '@/components/ui/Workspace';
import { useVenueOperations } from '@/hooks/useVenueOperations';
import { colors } from '@/constants/theme';

export default function Operations() {
  const { data, error, busy, refresh } = useVenueOperations(null);
  return <Screen>
    <Button small variant="ghost" label="Voltar" onPress={()=>router.back()} />
    <WorkspaceHeader title="Seus espaços de trabalho" description="Entre na operação do estabelecimento em que você é dono ou faz parte da equipe.">
      <Button small variant="outline" label="Atualizar acessos" loading={busy} onPress={()=>void refresh()} />
      <Button small label="Meus estabelecimentos" onPress={()=>router.push('/estabelecimento')} />
    </WorkspaceHeader>
    {!!error && <Card><Text accessibilityRole="alert" style={s.error}>{error}</Text></Card>}
    <WorkspaceGrid>{(data.venues??[]).map(v=><Card key={v.id} style={{gap:12}}>
      <Text style={s.label}>{v.owner?'SEU ESTABELECIMENTO':'ACESSO DE EQUIPE'}</Text>
      <Text style={s.name}>{v.name}</Text>
      <Text style={s.body}>{v.owner?'Reservas, comandas, aulas e gestão do seu espaço.':'Você verá somente as áreas e relatórios autorizados pelo dono.'}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <Button small label="Abrir operação" onPress={()=>router.push({pathname:'/operacao/ao-vivo',params:{establishmentId:v.id}})} />
        {v.owner&&<Button small variant="outline" label="Gerenciar espaço" onPress={()=>router.push(`/estabelecimento/${v.id}`)} />}
      </View>
    </Card>)}</WorkspaceGrid>
    {!busy&&!error&&!data.venues?.length&&<WorkspaceEmpty icon="business-outline" title="Nenhum acesso vinculado ainda"
      description="É dono de um campo? Cadastre seu estabelecimento. É professor, funcionário ou sócio? Peça ao dono para liberar seu e-mail confirmado em Equipe e permissões.">
      <Button small label="Cadastrar meu estabelecimento" onPress={()=>router.push('/estabelecimento')} />
    </WorkspaceEmpty>}
    {busy&&!data.venues?.length&&<Card><Text style={s.body}>Consultando seus acessos…</Text></Card>}
    <Card><Text style={s.name}>Cada função, um acesso</Text><Text style={s.body}>Ser administrador da plataforma não muda a propriedade de campos de outros usuários. Aqui aparecem seus estabelecimentos e os convites de equipe autorizados.</Text></Card>
  </Screen>;
}
const s=StyleSheet.create({name:{color:colors.text,fontSize:16,fontWeight:'700'},body:{color:colors.textMuted,fontSize:13,lineHeight:20},label:{color:colors.primaryDark,fontSize:10,fontWeight:'700',letterSpacing:.8},error:{color:colors.danger,fontSize:13}});
