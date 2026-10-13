import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { PRIVACY_CONTACT_EMAIL } from '@/constants/publicWebsite';

export default function TermsScreen() {
  return <Screen contentStyle={{ gap: spacing.md }}>
    <Button small variant="ghost" label="Voltar" onPress={() => router.back()} />
    <Text style={styles.title}>Termos de uso · MarcouJogou</Text>
    <Text style={styles.copy}>Versão 12/10/2026. O MarcouJogou oferece organização esportiva, recursos sociais e ferramentas de gestão. Mantenha os dados da sua conta corretos e respeite outros usuários; conteúdo abusivo, fraude e uso sem autorização não são permitidos.</Text>
    <Text style={styles.title}>Regras da comunidade</Text>
    <Text style={styles.copy}>Não publique assédio, discriminação, discurso de ódio, ameaças, exploração sexual, material de abuso sexual infantil, conteúdo sexual explícito, violência ilícita, fraude ou dados pessoais de outras pessoas sem autorização. Crianças e adolescentes devem ser protegidos. Use os recursos de denúncia e bloqueio; a moderação pode remover conteúdo e suspender contas após análise. Para comunicar abuso ou risco de segurança: {PRIVACY_CONTACT_EMAIL}.</Text>
    <Text style={styles.title}>Assinatura do aplicativo</Text>
    <Text style={styles.copy}>Premium libera somente os benefícios digitais descritos na oferta. A compra pela Google Play ou App Store tem preço, período e eventuais condições de teste informados pela loja antes da confirmação. Assinaturas renovam automaticamente até o cancelamento pela loja de origem, conforme as condições exibidas nela. Cancelar impede renovações futuras e não necessariamente encerra o período já pago. Reembolso, contestação e perda de validade são processados conforme a loja e os direitos aplicáveis. Não prometemos reembolso automático pelo botão de cancelamento.</Text>
    <Text style={styles.copy}>Use a mesma conta MarcouJogou para restaurar uma compra. Uma licença gratuita concedida pelo administrador não cancela uma assinatura já existente. Não compre outro plano sem conferir seu acesso atual. Excluir a conta do aplicativo não é um pedido de cancelamento à loja; gerencie a assinatura também na loja.</Text>
    <Text style={styles.title}>Reservas, aulas e consumo</Text>
    <Text style={styles.copy}>Quadras, aulas presenciais, alimentos, comandas e produtos físicos são fornecidos pelo estabelecimento ou vendedor identificado, não pela loja de aplicativos. Valores, disponibilidade, política de cancelamento e condições de pagamento devem ser apresentados antes da contratação. O gateway usado para esses pagamentos é separado da assinatura Premium. A licença do aplicativo não inclui esses serviços nem concede crédito ao cliente.</Text>
    <Text style={styles.title}>Dados e atendimento</Text>
    <Text style={styles.copy}>O uso de dados segue a política de privacidade disponível no aplicativo. Os meios de atendimento e solicitação de exclusão ficam na seção Privacidade e conta. Estes termos não afastam direitos assegurados pela legislação aplicável. Para dúvidas ou reclamações: {PRIVACY_CONTACT_EMAIL}.</Text>
  </Screen>;
}
const styles = StyleSheet.create({ title: { color: colors.text, fontSize: 18, fontWeight: '800' }, copy: { color: colors.textMuted, fontSize: 14, lineHeight: 22 } });
