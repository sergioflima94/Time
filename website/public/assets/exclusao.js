'use strict';
// A public, e-mail based request channel. No backend submission, telemetry or storage.
const form = document.getElementById('pedido-exclusao');
const prepared = document.getElementById('mensagem-preparada');
const text = document.getElementById('texto-pedido');
const mail = document.getElementById('abrir-email');
const status = document.getElementById('status-pedido');
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const email = document.getElementById('email-conta').value.trim();
  const note = document.getElementById('observacao').value.trim();
  const subject = 'Exclusão de conta — MarcouJogou';
  const body = `Olá, equipe do MarcouJogou.\n\nSolicito a exclusão da minha conta e dos dados pessoais associados.\nE-mail cadastrado: ${email}\n${note ? `\nObservação: ${note}\n` : ''}\nPeço confirmação de recebimento, orientação de verificação de titularidade e informação sobre o prazo de conclusão. Se houver retenção necessária, informem os dados, motivo e prazo.\n\nObrigado.`;
  text.value = `${subject}\n\n${body}`;
  mail.href = `mailto:sergioferreiralima09@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  prepared.hidden = false;
  status.textContent = 'Pedido preparado. Ele ainda não foi enviado; envie pelo seu e-mail.';
  text.focus();
});
mail.addEventListener('click', () => {
  status.textContent = 'Confira a mensagem no aplicativo de e-mail e envie. Esta página não confirma envio ou exclusão.';
});
document.getElementById('copiar-pedido').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível');
    await navigator.clipboard.writeText(text.value);
    status.textContent = 'Mensagem copiada. Envie para sergioferreiralima09@gmail.com; nada foi enviado por esta página.';
  } catch {
    text.focus(); text.select();
    status.textContent = 'Selecione e copie o texto acima; depois envie pelo seu e-mail. Nada foi enviado.';
  }
});
// Do not leave a prepared request for the next person using this browser tab.
window.addEventListener('pagehide', () => { form.reset(); text.value = ''; prepared.hidden = true; });
