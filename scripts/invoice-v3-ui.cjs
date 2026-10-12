const assert = require("node:assert/strict");
module.exports = async ({
  page,
  base,
  venue,
  input,
  button,
  fits,
  shot,
  actions,
  invoices,
  setOwner,
}) => {
  const i = invoices[0];
  i.balance_cents = 3000;
  i.online = { available: true, held: false, intents: [] };
  setOwner(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + `/operacao/faturas?establishmentId=${venue}`);
  await input("Valor do Pix (R$) · vazio paga todo o saldo").fill("5");
  await button("Gerar Pix da fatura").click();
  await page.getByText(/aguardando pagamento/).waitFor();
  assert.equal(i.online.intents[0].amount_cents, 500);
  await button("Consultar pagamento no provedor").click();
  await page.getByText("Saldo R$ 25,00", { exact: true }).waitFor();
  await input("Valor a devolver (R$) · vazio devolve o restante").fill("1");
  await page
    .getByRole("switch", { name: "Confirmo o valor da devolução deste Pix" })
    .check();
  await button("Solicitar devolução no provedor").click();
  await page.getByText("Saldo R$ 26,00", { exact: true }).waitFor();
  await button("Carregar histórico anterior de cobranças").click();
  await page.getByText("Devolvido: R$ 1,00.", { exact: false }).waitFor();
  await button("Propor parcelamento sem juros").click();
  await input("Número de parcelas (2 a 12)").fill("2");
  await input("Primeiro vencimento (AAAA-MM-DD)").fill("2026-11-10");
  await input("Motivo e condições do acordo").fill(
    "Parcelamento sem juros combinado",
  );
  await button("Enviar proposta para o cliente").click();
  await page.getByText(/Proposta aguardando cliente/).waitFor();
  assert.equal(
    actions.find((a) => a.p_action === "agreement_propose").p_data
      .expectedCents,
    2600,
  );
  setOwner(false);
  await page.goto(base + "/faturas");
  await page
    .getByRole("switch", {
      name: "Aceito o valor e os vencimentos deste acordo",
    })
    .check();
  await button("Aceitar acordo de pagamento").click();
  await page.getByText(/Acordo aceito ·/).waitFor();
  await input("Meu celular com DDD").fill("11999998877");
  await page
    .getByRole("switch", {
      name: "Autorizo receber o código de verificação neste WhatsApp",
    })
    .check();
  await button("Enviar código para meu WhatsApp").click();
  await input("Código de seis dígitos").fill("123456");
  await button("Confirmar meu telefone").click();
  await page
    .getByRole("switch", { name: "Autorizar lembretes por WhatsApp" })
    .waitFor();
  await fits();
  await shot("fatura-pix-parcial-devolucao-acordo-e-telefone");
  setOwner(true);
  await page.goto(base + `/estabelecimento/${venue}`);
  await button("Conectar WhatsApp pela Evolution API").click();
  await page.getByText("Código: 1234-5678", { exact: true }).waitFor();
  await fits();
  await shot("evolution-api-pareamento-mobile");
  await button("Consultar conexão do WhatsApp").click();
  await page.getByText("Estado: Conectado", { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 760 });
  await fits();
  assert.equal(
    await page.getByText("Código: 1234-5678", { exact: true }).count(),
    0,
  );
  console.log(
    "PASS: partial Pix/partial refund, history selector, owner proposal + client agreement acceptance, phone verification opt-in, Evolution API QR/pairing + connected state, 390/320 layout. No real network/payment/message.",
  );
};
