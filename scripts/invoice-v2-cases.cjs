const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
module.exports = async ({
  db,
  q,
  who,
  act,
  users,
  p,
  venue,
  field,
  account,
  meal,
}) => {
  const superuser = () => db.exec("reset role");
  const today = (
      await q(
        "select (now() at time zone 'America/Sao_Paulo')::date::text as business_date",
      )
    )[0].business_date,
    day = Number(today.slice(-2));
  await who(0);
  await act("account_save", {
    venueId: venue,
    email: "credit1@test.invalid",
    cutDay: day,
    limitCents: 100000,
    dueDays: 5,
  });
  const otherAccount = (
    await act("account_save", {
      venueId: venue,
      email: "credit2@test.invalid",
      cutDay: day,
      limitCents: 100000,
      dueDays: 3,
    })
  ).id;
  const shared = await meal(10);
  await who(0);
  for (const status of ['preparing','ready','delivered']) await q('select venue_action($1,$2)', ['kitchen_status', JSON.stringify({venueId:venue,itemId:shared.item,status})]);
  await superuser();
  const person1 = (
    await q("select id from tab_participants where tab_id=$1", [shared.tab])
  )[0].id;
  const person2 = (
    await q(
      "insert into tab_participants(tab_id,player_id,name) values($1,$2,'Cliente 2') returning id",
      [shared.tab, p(2)],
    )
  )[0].id;
  await q("delete from order_item_shares where item_id=$1", [shared.item]);
  await q(
    "insert into order_item_shares(item_id,participant_id,amount_cents) values($1,$2,500),($1,$3,500)",
    [shared.item, person1, person2],
  );
  await who(1);
  let ctx = (
    await q("select credit_snapshot(null,$1,'tab') data", [shared.tab])
  )[0].data;
  assert.equal(ctx.parts.length, 1);
  assert.equal(ctx.parts[0].remaining_cents, 500);
  assert.equal(ctx.split_ready, true);
  await assert.rejects(
    act("post_part", {
      tabId: shared.tab,
      accountId: account,
      participantId: person1,
      expectedCents: 500,
      consent: false,
    }),
    /Confirme/,
  );
  const partial = (
    await act("post_part", {
      tabId: shared.tab,
      accountId: account,
      participantId: person1,
      expectedCents: 500,
      consent: true,
    })
  ).id;
  await who(0);
  await assert.rejects(
    act("post_part", {
      tabId: shared.tab,
      accountId: otherAccount,
      participantId: person1,
      expectedCents: 500,
      consent: true,
    }),
    /pertencer/,
  );
  await who(2);
  await assert.rejects(
    act("pay_part", {
      tabId: shared.tab,
      participantId: person2,
      expectedCents: 500,
      consent: true,
      confirmed: true,
      method: "cash",
    }),
    /Só o caixa/,
  );
  await who(0);
  await act("pay_part", {
    tabId: shared.tab,
    participantId: person2,
    expectedCents: 500,
    consent: true,
    confirmed: true,
    method: "cash",
  });
  ctx = (await q("select credit_snapshot(null,$1,'tab') data", [shared.tab]))[0]
    .data;
  assert.equal(ctx.transferred_cents, 500);
  assert.equal(ctx.paid_cents, 500);
  assert.equal(ctx.balance_cents, 0);
  const pay = (
    await act("receive_invoice", {
      invoiceId: partial,
      amountCents: 200,
      method: "cash",
      confirmed: true,
    })
  ).id;
  await who(1);
  await assert.rejects(
    act("reverse_payment", {
      paymentId: pay,
      reason: "Teste de correção",
      confirmed: true,
    }),
    /Somente o dono/,
  );
  await who(0);
  await act("reverse_payment", {
    paymentId: pay,
    reason: "Lançamento em duplicidade",
    confirmed: true,
  });
  let statement = (
    await q("select credit_search($1,$2) data", [
      venue,
      JSON.stringify({ search: "Cliente 1", status: "open", limit: 1 }),
    ])
  )[0].data;
  assert.equal(statement.invoices[0].balance_cents, 500);
  assert.equal(
    statement.invoices[0].payments.find((x) => x.id === pay).reversal.reason,
    "Lançamento em duplicidade",
  );
  assert.equal(
    statement.invoices[0].due_date,
    (
      await (async () => {
        await superuser();
        return q(
          "select (cut_date+5)::text d from venue_credit_invoices where id=$1",
          [partial],
        );
      })()
    )[0].d,
  );
  await who(0);
  await act("receive_invoice", {
    invoiceId: partial,
    amountCents: 500,
    method: "cash",
    confirmed: true,
  });
  // New settings don't move the due date of the existing statement.
  await act("account_save", {
    venueId: venue,
    email: "credit1@test.invalid",
    cutDay: day,
    limitCents: 100000,
    dueDays: 30,
  });
  await superuser();
  await q(
    "update venue_credit_invoices set cut_date=$2::date-2,due_date=$2::date+3 where id=$1",
    [partial, today],
  );
  const coach = (
    await q(
      "insert into coaches(establishment_id,player_id,sport_ids) values($1,$2,array['volei']) returning id",
      [venue, p(0)],
    )
  )[0].id;
  const program = (
    await q(
      "insert into class_programs(establishment_id,name,sport_id,format,coach_id,field_id,level,capacity,duration_minutes,price,billing_type) values($1,'Aula faturada','volei','group',$2,$3,'Iniciante',10,60,20,'monthly') returning id",
      [venue, coach, field],
    )
  )[0].id;
  const bill = (
    await q(
      "insert into academy_bills(program_id,player_id,plan,competence,amount_cents) values($1,$2,'monthly',date_trunc('month',now())::date,2000) returning id",
      [program, p(1)],
    )
  )[0].id;
  const team = (
    await q(
      "insert into peladas(name,invite_code,created_by) values('Time da fatura','INVSEVEN',$1) returning id",
      [p(0)],
    )
  )[0].id;
  const game = (
    await q(
      "insert into games(pelada_id,field_id,scheduled_at,field_cost,created_by) values($1,$2,now(),100,$3) returning id",
      [team, field, p(0)],
    )
  )[0].id;
  for (const n of [1, 2, 3])
    await q(
      "insert into attendances(game_id,player_id,status) values($1,$2,'confirmed')",
      [game, p(n)],
    );
  await who(1);
  statement = (
    await q("select credit_search(null,$1) data", [JSON.stringify({})])
  )[0].data;
  assert.equal(
    statement.sources.classes.find((x) => x.id === bill).amount_cents,
    2000,
  );
  const quoted = statement.sources.games.find(
    (x) => x.id === game,
  ).amount_cents;
  const unified = (
    await act("post_class", {
      accountId: account,
      billId: bill,
      expectedCents: 2000,
      consent: true,
    })
  ).id;
  await act("post_game", {
    accountId: account,
    gameId: game,
    expectedCents: quoted,
    consent: true,
  });
  await superuser();
  assert.equal(
    (await q("select status from academy_bills where id=$1", [bill]))[0].status,
    "invoiced",
  );
  await assert.rejects(
    q("update academy_bills set status='cash_paid' where id=$1", [bill]),
    /Cobrança transferida/,
  );
  await assert.rejects(
    q("update games set field_cost=200 where id=$1", [game]),
    /congelados/,
  );
  const gamePayment = (
    await q("select id from payments where game_id=$1 and player_id=$2", [
      game,
      p(1),
    ])
  )[0].id;
  await assert.rejects(
    q("update payments set status='paid' where id=$1", [gamePayment]),
    /Cobrança transferida/,
  );
  assert.equal(
    (
      await q(
        "select (due_date-cut_date)::int days from venue_credit_invoices where id=$1",
        [unified],
      )
    )[0].days,
    30,
  );
  await who(0);
  await act("receive_invoice", {
    invoiceId: unified,
    amountCents: 2000,
    method: "cash",
    confirmed: true,
  });
  await superuser();
  assert.equal(
    (await q("select status from academy_bills where id=$1", [bill]))[0].status,
    "invoice_paid",
  );
  assert.equal(
    (await q("select status from payments where id=$1", [gamePayment]))[0]
      .status,
    "invoiced",
  );
  const secret = randomUUID();
  await q("insert into vault.decrypted_secrets values($1,$2)", [
    secret,
    JSON.stringify({
      accessToken: "SYNTHETIC-ONLY",
      webhookSecret: "synthetic-webhook-secret-123456",
    }),
  ]);
  await q("select set_config('request.jwt.claim.role','service_role',false)");
  const gateway = (
    await q(
      "insert into payment_gateway_connections(establishment_id,provider,status,pix_enabled,credential_secret_id) values($1,'mercado_pago','connected',true,$2) returning id",
      [venue, secret],
    )
  )[0].id;
  async function service(action, data) {
    await superuser();
    await q("select set_config('request.jwt.claim.role','service_role',false)");
    await db.exec("set role service_role");
    return (
      await q("select credit_payment_service($1,$2) data", [
        action,
        JSON.stringify(data),
      ])
    )[0].data;
  }
  await who(1);
  await assert.rejects(
    q("select credit_payment_service('context',$1)", [
      JSON.stringify({ intentId: randomUUID() }),
    ]),
    /permission denied/,
  );
  await assert.rejects(
    service("prepare", {
      actor: users[3],
      invoiceId: unified,
      requestId: randomUUID(),
    }),
    /Sem acesso/,
  );
  const nonce = randomUUID(),
    pre = { actor: users[1], invoiceId: unified, requestId: nonce };
  const intent = (await service("prepare", pre)).id;
  assert.equal((await service("prepare", pre)).claimed, false);
  await who(0);
  await assert.rejects(
    act("receive_invoice", {
      invoiceId: unified,
      amountCents: quoted,
      method: "cash",
      confirmed: true,
    }),
    /Consulte ou cancele/,
  );
  await assert.rejects(
    act("credit_note", {
      invoiceId: unified,
      amountCents: 1,
      reason: "Ajuste conferido",
      confirmed: true,
    }),
    /Consulte ou cancele/,
  );
  const envelope = await service("context", {
    actor: users[1],
    intentId: intent,
  });
  assert.equal(envelope.total_cents, quoted);
  assert.equal(envelope.reference, "invoice:" + intent);
  await service("checkout_save", {
    intentId: intent,
    externalId: "SYNTHETIC-PAYMENT-1",
    collectorId: "synthetic-merchant",
    pixCode: "SYNTHETIC-QR-ONLY",
    url: "https://www.mercadopago.com.br/payments/synthetic/ticket",
  });
  const receipt = {
    intentId: intent,
    gatewayId: gateway,
    paymentId: "SYNTHETIC-PAYMENT-1",
    amountCents: quoted,
    currency: "BRL",
    status: "approved",
    updatedAt: new Date().toISOString(),
  };
  await assert.rejects(
    service("settle", { ...receipt, amountCents: quoted + 1 }),
    /divergente/,
  );
  await service("settle", receipt);
  await service("settle", receipt);
  await superuser();
  assert.equal(
    (
      await q(
        "select count(*)::int n from venue_credit_payments where invoice_id=$1 and method='online_pix'",
        [unified],
      )
    )[0].n,
    1,
  );
  assert.equal(
    (await q("select status from payments where id=$1", [gamePayment]))[0]
      .status,
    "invoice_paid",
  );
  await assert.rejects(
    service("settle", { ...receipt, paymentId: "SYNTHETIC-OTHER" }),
    /mais de um/,
  );
  await service("settle", {
    ...receipt,
    status: "refunded",
    updatedAt: new Date(Date.now() + 1000).toISOString(),
  });
  await service("settle", receipt);
  await superuser();
  assert.equal(
    (await q("select credit_balance($1)::int b", [unified]))[0].b,
    quoted,
  );
  assert.equal(
    (await q("select status from payments where id=$1", [gamePayment]))[0]
      .status,
    "invoiced",
  );
  await who(0);
  await act("credit_note", {
    invoiceId: unified,
    amountCents: quoted,
    reason: "Cota dispensada após conferência",
    confirmed: true,
  });
  await superuser();
  assert.equal(
    (await q("select credit_balance($1)::int b", [unified]))[0].b,
    0,
  );
  // Real optional preferences; reminder availability is idempotent and not a claim of email delivery.
  const reminderMeal = await meal(5);
  await who(1);
  const reminderInvoice = (
    await act("post_tab", {
      accountId: account,
      tabId: reminderMeal.tab,
      expectedCents: 500,
      consent: true,
    })
  ).id;
  await act("reminder_preferences", {
    accountId: account,
    inApp: true,
    email: true,
    whatsapp: false,
  });
  await assert.rejects(
    act("reminder_preferences", {
      accountId: account,
      inApp: true,
      email: false,
      whatsapp: true,
    }),
    /telefone brasileiro verificado/,
  );
  await who(0);
  await assert.rejects(
    act("reminder_preferences", {
      accountId: account,
      inApp: false,
      email: false,
      whatsapp: false,
    }),
    /Só o cliente/,
  );
  await superuser();
  await q("update venue_credit_invoices set due_date=$2::date+2 where id=$1", [
    reminderInvoice,
    today,
  ]);
  await q("select set_config('request.jwt.claim.role','service_role',false)");
  await db.exec("set role service_role");
  await q("select credit_reminders_generate()");
  await q("select credit_reminders_generate()");
  let reminder = (
    await q("select credit_reminder_service('claim',$1) data", [
      JSON.stringify({ channels: ["email"] }),
    ])
  )[0].data;
  assert.equal(reminder.email, "credit1@test.invalid");
  await q("select credit_reminder_service('uncertain',$1)", [
    JSON.stringify({ id: reminder.id }),
  ]);
  assert.deepEqual(
    (
      await q("select credit_reminder_service('claim',$1) data", [
        JSON.stringify({ channels: ["email"] }),
      ])
    )[0].data,
    {},
  );
  await superuser();
  assert.equal(
    (
      await q(
        "select count(*)::int n from venue_credit_reminders where invoice_id=$1 and stage='before_due' and channel='app'",
        [reminderInvoice],
      )
    )[0].n,
    1,
  );
  await who(1);
  const mine = (
    await q("select credit_search(null,$1) data", [
      JSON.stringify({ status: "open", limit: 1 }),
    ])
  )[0].data;
  assert.equal(mine.invoices.length, 1);
  assert.equal(mine.invoices[0].player_id, p(1));
  const exported = (
    await q("select credit_export(null,$1) data", [
      JSON.stringify({ search: "Arena crédito" }),
    ])
  )[0].data;
  assert(exported.invoices.every((i) => i.player_id === p(1)));
  await who(3);
  assert.equal(
    (await q("select credit_export(null,$1) data", [JSON.stringify({})]))[0]
      .data.invoices.length,
    0,
  );
  console.log(
    "PASS: seven invoice upgrades: separate immutable due date, individual shared item + counter remainder, partial receipt/reversal, class + game transfer, frozen exact rateio, provider proof/replay/refund/hold, private search/export, optional verified reminders without repeat. Synthetic DB only.",
  );
};
