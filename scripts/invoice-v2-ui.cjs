// Synthetic browser extension: no bank calls, debt, notification or real contacts.
const assert = require("node:assert/strict"),
  fs = require("node:fs/promises");
module.exports = async ({
  page,
  base,
  venue,
  tab,
  input,
  button,
  fits,
  shot,
  actions,
  invoices,
  searches,
  parts,
  setAdvanced,
  setShared,
}) => {
  setAdvanced();
  await page.goto(base + `/operacao/faturas?establishmentId=${venue}`);
  await page.getByText("Vencimento 20/10/2026", { exact: true }).waitFor();
  await button("Corrigir pagamento ou conceder abatimento").click();
  await button("R$ 5,00 · " + new Date().toLocaleDateString("pt-BR")).click();
  await input("Motivo da correção (mínimo 8 caracteres)").fill(
    "Registro recebido incorretamente",
  );
  await page
    .getByRole("switch", {
      name: "Conferi e assumo a responsabilidade pela correção",
    })
    .check();
  await button("Registrar correção auditada").click();
  await page
    .getByText("Correção registrada sem apagar o histórico.", { exact: true })
    .waitFor();
  assert.equal(invoices[0].balance_cents, 1200);
  await button("Ver lançamentos e pagamentos").click();
  await page.getByText(/Estornado: Registro recebido incorretamente/).waitFor();
  const receiptPromise = page.waitForEvent("download");
  await button("Compartilhar recibo").click();
  const receipt = await receiptPromise;
  assert.match(await fs.readFile(await receipt.path(), "utf8"), /ESTORNADO/);
  await page
    .getByRole("switch", {
      name: "Confirmo autorização para transferir este valor à fatura",
    })
    .check();
  await button("Deixar aula na fatura").click();
  await page
    .getByText("Cobrança transferida para fatura, sem duplicar na origem.", {
      exact: true,
    })
    .waitFor();
  await button("Cotas de jogos").click();
  await page
    .getByRole("switch", {
      name: "Confirmo autorização para transferir este valor à fatura",
    })
    .check();
  await button("Deixar cota na fatura").click();
  await page
    .getByText("Sem cobrança pendente elegível", { exact: false })
    .waitFor();
  assert(
    actions.some(
      (a) => a.p_action === "post_class" && a.p_data.expectedCents === 2000,
    ),
  );
  assert(
    actions.some(
      (a) => a.p_action === "post_game" && a.p_data.expectedCents === 334,
    ),
  );
  await page
    .getByRole("switch", { name: "Autorizar lembretes por e-mail" })
    .check();
  await button("Salvar minhas preferências de lembrete").click();
  await page
    .getByText("Preferências de lembrete salvas.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("switch", { name: "Autorizar lembretes por WhatsApp" })
      .count(),
    0,
  );
  await input("Cliente ou estabelecimento").fill("Cliente");
  await input("Vencimento de (AAAA-MM-DD)").fill("2026-10-01");
  await button("Aplicar filtros").click();
  await page.getByText("Filtro: 1 faturas", { exact: false }).waitFor();
  assert(
    searches.some((q) => q.search === "Cliente" && q.from === "2026-10-01"),
  );
  const csvPromise = page.waitForEvent("download");
  await button("Exportar extrato CSV do filtro").click();
  const csv = await csvPromise;
  assert.match(await fs.readFile(await csv.path(), "utf8"), /Vencimento/);
  await button("Gerar Pix da fatura").click();
  await page
    .getByText("Mercado Pago · aguardando pagamento", { exact: false })
    .waitFor();
  assert.equal(await button("Confirmar recebimento").count(), 1); // unrelated rental only
  await fits();
  await shot("fatura-pix-compartilhamento-correcao-e-fontes");
  await button("Consultar pagamento no provedor").click();
  await page.getByText("Saldo R$ 0,00", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("synthetic-pix-code-only", { exact: true }).count(),
    0,
  );
  setShared();
  await page.goto(base + `/operacao/comanda/${tab}`);
  await page
    .getByRole("switch", { name: "Aceito faturar somente a minha parte" })
    .check();
  await button("Faturar parte de Cliente de teste").click();
  await button("Ver fatura de Cliente de teste").waitFor();
  assert.equal(
    actions.find((a) => a.p_action === "post_part").p_data.expectedCents,
    600,
  );
  assert.equal(await button("Gerar cobrança Pix").count(), 0);
  assert.equal(await page.getByText("Novo pedido", { exact: true }).count(), 0);
  await page
    .getByRole("switch", { name: "Conferi o dinheiro ou o crédito no banco" })
    .check();
  await button("Confirmar recebimento").click();
  await page.getByText("Sem saldo na comanda.", { exact: true }).waitFor();
  assert.equal(parts[1].remaining_cents, 0);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await fits();
  }
  await shot("comanda-partes-individuais-sem-cobranca-duplicada");
  console.log(
    "PASS: seven invoice UI flows, due day, immutable reversal receipt/download, class/game consent, optional reminders, filter/CSV, pending Pix lock/verified settlement, shared tab individual invoice + counter remainder. Synthetic backend only.",
  );
};
