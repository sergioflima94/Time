const assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
module.exports = async ({ db, q, who, act, users, p, venue, meal }) => {
  const root = () => db.exec("reset role");
  const service = async (fn, action, data) => {
    await root();
    await q("select set_config('request.jwt.claim.role','service_role',false)");
    await db.exec("set role service_role");
    return (
      await q(`select ${fn}($1,$2) as data`, [action, JSON.stringify(data)])
    )[0].data;
  };
  const account =
    (await root(),
    (
      await q(
        "select id from venue_credit_accounts where establishment_id=$1 and player_id=$2",
        [venue, p(2)],
      )
    )[0].id);
  const tab = await meal(20);
  await who(2);
  const invoice = (
    await act("post_tab", {
      tabId: tab.tab,
      accountId: account,
      expectedCents: 2000,
      consent: true,
    })
  ).id;
  await assert.rejects(
    service("credit_payment_service", "prepare", {
      actor: users[2],
      invoiceId: invoice,
      requestId: randomUUID(),
      amountCents: 2001,
    }),
    /até o saldo/,
  );
  const intent = (
    await service("credit_payment_service", "prepare", {
      actor: users[2],
      invoiceId: invoice,
      requestId: randomUUID(),
      amountCents: 500,
    })
  ).id;
  const ctx = await service("credit_payment_service", "context", {
    actor: users[2],
    intentId: intent,
  });
  assert.equal(ctx.total_cents, 500);
  await service("credit_payment_service", "checkout_save", {
    intentId: intent,
    externalId: "V3-SYNTHETIC",
    collectorId: "synthetic-merchant",
  });
  const proof = {
    intentId: intent,
    gatewayId: ctx.gateway.id,
    paymentId: "V3-SYNTHETIC",
    amountCents: 500,
    currency: "BRL",
    status: "approved",
    updatedAt: new Date().toISOString(),
    feeCents: 50,
    netCents: 450,
  };
  await service("credit_payment_service", "settle", proof);
  const refundId = randomUUID();
  assert.equal(
    (
      await service("credit_payment_service", "refund_claim", {
        actor: users[0],
        intentId: intent,
        requestId: refundId,
        amountCents: 200,
      })
    ).claimed,
    true,
  );
  assert.equal(
    (
      await service("credit_payment_service", "refund_claim", {
        actor: users[0],
        intentId: intent,
        requestId: randomUUID(),
        amountCents: 200,
      })
    ).claimed,
    false,
  );
  const partial = {
    ...proof,
    status: "partial_refund",
    refundedCents: 200,
    updatedAt: new Date(Date.now() + 1000).toISOString(),
  };
  await service("credit_payment_service", "settle", partial);
  await service("credit_payment_service", "settle", partial);
  await root();
  assert.equal(
    (await q("select credit_balance($1)::int n", [invoice]))[0].n,
    1700,
  );
  assert.equal(
    (
      await q(
        "select count(*)::int n from venue_credit_refunds where intent_id=$1",
        [intent],
      )
    )[0].n,
    1,
  );
  const balance = (await q("select credit_balance($1)::int n", [invoice]))[0].n;
  await who(0);
  const today = (
    await q(
      "select ((now() at time zone 'America/Sao_Paulo')::date+10)::text d",
    )
  )[0].d;
  const plan = (
    await act("agreement_propose", {
      invoiceId: invoice,
      installments: 3,
      firstDue: today,
      gapDays: 30,
      reason: "Parcelamento combinado com cliente",
      expectedCents: balance,
    })
  ).id;
  await assert.rejects(
    act("agreement_accept", { agreementId: plan, consent: true }),
    /Somente o cliente/,
  );
  await who(2);
  await assert.rejects(
    act("agreement_accept", { agreementId: plan, consent: false }),
    /aceite/,
  );
  await act("agreement_accept", { agreementId: plan, consent: true });
  await root();
  let rows = (await q("select credit_agreement_schedule($1) data", [plan]))[0]
    .data;
  assert.equal(
    rows.reduce((s, x) => s + x.amount_cents, 0),
    1700,
  );
  assert.equal(rows[0].due_date, today);
  await who(0);
  await act("receive_invoice", {
    invoiceId: invoice,
    amountCents: 600,
    method: "cash",
    confirmed: true,
  });
  await root();
  rows = (await q("select credit_agreement_schedule($1) data", [plan]))[0].data;
  assert.equal(rows[0].remaining_cents, 0);
  assert.equal(
    rows.reduce((s, x) => s + x.remaining_cents, 0),
    1100,
  );
  await who(2);
  const statement = (
    await q("select credit_snapshot(null,null,'statement') data")
  )[0].data;
  assert.equal(
    statement.invoices.find((i) => i.id === invoice).agreements[0].status,
    "accepted",
  );
  assert.equal(statement.accounts.find((a) => a.id === account).overdue, false);
  const history = (
    await q("select credit_checkout_history($1) data", [invoice])
  )[0].data;
  assert.equal(history[0].refunded_cents, 200);
  assert.equal(history[0].fee_cents, 50);
  assert.equal(history[0].net_cents, 450);
  await who(3);
  await assert.rejects(
    q("select credit_checkout_history($1)", [invoice]),
    /Sem acesso/,
  );
  await assert.rejects(
    service("whatsapp_instance_service", "context", {
      actor: users[2],
      venueId: venue,
    }),
    /Somente o dono/,
  );
  const wa = await service("whatsapp_instance_service", "context", {
    actor: users[0],
    venueId: venue,
  });
  assert.match(wa.instance, /^mj-[a-f0-9]{32}$/);
  assert.equal(
    (
      await service("whatsapp_instance_service", "context", {
        actor: users[0],
        venueId: venue,
      })
    ).instance,
    wa.instance,
  );
  const dispatch = {
    id: "v3-synthetic-wa",
    venueId: venue,
    hash: "a".repeat(64),
  };
  assert.equal(
    (await service("whatsapp_dispatch_service", "claim", dispatch)).claimed,
    true,
  );
  assert.equal(
    (await service("whatsapp_dispatch_service", "claim", dispatch)).claimed,
    false,
  );
  await service("whatsapp_dispatch_service", "finish", {
    ...dispatch,
    status: "uncertain",
    provider: "evolution_api",
  });
  assert.equal(
    (await service("whatsapp_dispatch_service", "claim", dispatch)).status,
    "uncertain",
  );
  await root();
  await db.exec(
    "alter table auth.users add column if not exists phone text;alter table auth.users add column if not exists phone_confirmed_at timestamptz;",
  );
  const challenge = {
    actor: users[2],
    id: randomUUID(),
    salt: randomUUID(),
    phone: "5511999998877",
    hash: "b".repeat(64),
  };
  await service("phone_ownership_service", "create", challenge);
  assert.equal(
    (
      await service("phone_ownership_service", "verify", {
        actor: users[2],
        id: challenge.id,
        hash: "c".repeat(64),
      })
    ).valid,
    false,
  );
  const verified = await service("phone_ownership_service", "verify", {
    actor: users[2],
    id: challenge.id,
    hash: challenge.hash,
  });
  assert.equal(verified.valid, true);
  await root();
  await q(
    "update auth.users set phone=$1,phone_confirmed_at=now() where id=$2",
    [challenge.phone, users[2]],
  );
  await service("phone_ownership_service", "complete", {
    actor: users[2],
    id: challenge.id,
  });
  await who(0);
  await assert.rejects(
    q("select * from customer_phone_challenges"),
    /permission denied/,
  );
  console.log(
    "PASS: partial Pix amount, cumulative verified refund/replay, fees/net proof, agreement client consent/exact cents/schedule, private all-checkout history, owner-only isolated Evolution instance, no resend after uncertainty, phone ownership hash/attempt and private storage. Synthetic DB only.",
  );
};
