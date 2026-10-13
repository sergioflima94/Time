# Atendimento de exclusão de conta

O botão do Perfil registra uma solicitação no Supabase sem exigir e-mail. O protocolo, a previsão inicial de sete dias e o estado podem ser consultados pelo titular. O processamento é **manual**: receber o pedido não elimina dados, e o sistema não promete exclusão imediata.

O operador deve consultar diariamente **Admin da plataforma → Exclusão de contas**. Suporte, administrador e proprietário podem consultar a fila privada; iniciar atendimento registra auditoria e bloqueia cancelamento automático. Não existe botão que marque uma conta como apagada sem fazer a eliminação.

## Procedimento para o operador

1. Abra o protocolo e confirme o titular pelo vínculo de autenticação do próprio pedido. Não peça senha ou código. O pedido no app já exige sessão autenticada.
2. Identifique o perfil, vínculos com times/estabelecimentos, mensagens, fotos/arquivos, localização, preferências, contatos, tokens de notificações, conteúdo pessoal, pedidos/transações e integrações. Verifique obrigações compartilhadas e transferência de responsabilidade sem apagar dados de terceiros.
3. Defina e documente apenas as retenções necessárias, sua finalidade e duração. Não assuma um prazo legal universal. Avise o titular quando uma pendência afetar a previsão.
4. Elimine os dados pessoais que não precisam ser conservados, inclusive Storage e prestadores. Quando necessário, anonimize registros compartilhados de forma que não continuem identificando a pessoa. Renomear o perfil ou remover apenas `auth.users` **não** atende ao pedido: o schema mantém o perfil após a remoção do Auth.
5. Remova/revogue o acesso autenticado após tratar dependências. Não apague times, reservas ou contas financeiras de outras pessoas por cascata. Assinaturas de loja precisam de cancelamento separado pelo titular; a exclusão não cancela nem estorna uma compra.
6. Verifique a eliminação e envie confirmação ao e-mail cadastrado, informando retenções justificadas. Somente então um operador confiável com acesso de serviço registra `status='completed'`, `completed_at` e `updated_at` no protocolo. Nunca exponha chave de serviço no app. O protocolo não guarda uma cópia do nome/e-mail; consulta-os só enquanto o vínculo existe.
7. Documente a operação e reaplique exclusões antes de disponibilizar qualquer restauração de backup.

Antes de publicação, o proprietário deve manter esse atendimento operacional. Não há processamento automático nem envio automático de confirmação implementados nesta versão. Se a equipe não puder cumprir a previsão, a submissão deve aguardar a adequação do procedimento.

## Segurança e testes

`account_deletion_self` deriva o titular de `auth.uid()`, inclusive para contas suspensas. Não aceita o ID de outra conta; um pedido aberto por titular é idempotente. Cancelamento é permitido apenas antes do início do atendimento. Tabelas não podem ser consultadas diretamente por clientes. A fila exige papel de plataforma conferido no servidor.

`node scripts/test-account-deletion-sql.cjs` executa as migrações e verifica isolamento em banco descartável. Nenhuma conta real é apagada nos testes ou ao implantar a migração.
