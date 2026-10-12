const {
  PGlite,
} = require("../.test-runtime/node_modules/@electric-sql/pglite");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { randomUUID } = require("node:crypto");
const db = new PGlite(),
  q = async (s, a = []) => (await db.query(s, a)).rows;
const users = Array.from({ length: 4 }, () => randomUUID());
async function who(i) {
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [users[i]]);
  await db.exec("set role authenticated");
}
const act = async (action, data, requestId = randomUUID()) =>
  (
    await q("select credit_action($1,$2) data", [
      action,
      JSON.stringify({ ...data, requestId }),
    ])
  )[0].data;
async function run() {
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
    for (const f of fs
      .readdirSync(path.join(__dirname, "../supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(
        fs
          .readFileSync(
            path.join(__dirname, "../supabase/migrations", f),
            "utf8",
          )
          .replace(/^create extension if not exists .*;\r?$/gm, ""),
      );
    for (let i = 0; i < 4; i++)
      await q(
        "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
        [
          users[i],
          `credit${i}@test.invalid`,
          JSON.stringify({ name: `Cliente ${i}` }),
        ],
      );
    const players = await q("select id,auth_user_id from players"),
      p = (i) => players.find((x) => x.auth_user_id === users[i]).id;
    const venue = (
      await q(
        "insert into establishments(owner_player_id,name,payout_method,access_code) values($1,'Arena crédito','in_person','CREDITTEST') returning id",
        [p(0)],
      )
    )[0].id;
    assert.equal(
      (await q("select credit_cut_date(31,'2028-02-11')::text d"))[0].d,
      "2028-02-29",
    );
    assert.equal(
      (await q("select credit_cut_date(10,'2026-10-11')::text d"))[0].d,
      "2026-11-10",
    );
    await who(1);
    await assert.rejects(
      act("account_save", {
        venueId: venue,
        email: "credit1@test.invalid",
        cutDay: 31,
        limitCents: 10000,
      }),
      /Somente o dono/,
    );
    await who(0);
    await assert.rejects(
      act("account_save", {
        venueId: venue,
        email: "missing@test.invalid",
        cutDay: 31,
        limitCents: 10000,
      }),
      /conta confirmada/,
    );
    const account = (
      await act("account_save", {
        venueId: venue,
        email: "credit1@test.invalid",
        cutDay: 31,
        limitCents: 10000,
      })
    ).id;
    await db.exec("reset role");
    const category = (
      await q(
        "insert into product_categories(establishment_id,name) values($1,'Bebidas') returning id",
        [venue],
      )
    )[0].id;
    const product = (
      await q(
        "insert into products(establishment_id,category_id,name,price,station) values($1,$2,'Refrigerante',12,'bar') returning id",
        [venue, category],
      )
    )[0].id;
    async function meal(price = 12) {
      await who(0);
      const tab = (await act("open_tab", { accountId: account })).id;
      await db.exec("reset role");
      const order = (
        await q(
          "insert into service_orders(tab_id,created_by_player_id) values($1,$2) returning id",
          [tab, p(0)],
        )
      )[0].id;
      const item = (
        await q(
          "insert into service_order_items(order_id,product_id,quantity,unit_price) values($1,$2,1,$3) returning id",
          [order, product, price],
        )
      )[0].id;
      const person = (
        await q("select id from tab_participants where tab_id=$1", [tab])
      )[0].id;
      const itemShare = (
        await q(
          "insert into order_item_shares(item_id,participant_id,amount_cents) values($1,$2,$3) returning id",
          [item, person, Math.round(price * 100)],
        )
      )[0].id;
      return { tab, order, item, itemShare };
    }
    let m = await meal();
    await who(1);
    await assert.rejects(
      act("post_tab", {
        accountId: account,
        tabId: m.tab,
        expectedCents: 1200,
        consent: false,
      }),
      /Confirme/,
    );
    await assert.rejects(
      act("post_tab", {
        accountId: account,
        tabId: m.tab,
        expectedCents: 1100,
        consent: true,
      }),
      /saldo mudou/,
    );
    const nonce = randomUUID(),
      data = {
        accountId: account,
        tabId: m.tab,
        expectedCents: 1200,
        consent: true,
      },
      invoice = (await act("post_tab", data, nonce)).id;
    assert.equal((await act("post_tab", data, nonce)).id, invoice);
    await assert.rejects(
      act("post_tab", { ...data, expectedCents: 1100 }, nonce),
      /Identificador/,
    );
    let s = (await q("select credit_snapshot(null,null,'statement') data"))[0]
      .data;
    assert.equal(s.invoices[0].balance_cents, 1200);
    assert.equal(s.invoices[0].lines[0].acceptance, "app");
    await assert.rejects(
      q("select * from venue_credit_accounts"),
      /permission denied/,
    );
    await who(2);
    assert.equal(
      (await q("select credit_snapshot(null,null,'statement') data"))[0].data
        .invoices.length,
      0,
    );
    await assert.rejects(
      q("select credit_snapshot($1,null,'statement')", [venue]),
      /Sem acesso/,
    );
    await db.exec("reset role");
    assert.equal(
      (await q("select count(*)::int n from sale_payments"))[0].n,
      0,
    );
    await assert.rejects(
      q("update service_order_items set quantity=2 where id=$1", [m.item]),
      /Comanda faturada/,
    );
    await assert.rejects(
      q("update service_order_items set status='cancelled' where id=$1", [
        m.item,
      ]),
      /Comanda faturada/,
    );
    await q("update service_order_items set status='delivered' where id=$1", [
      m.item,
    ]);
    await assert.rejects(
      q(
        "insert into sale_payments(tab_id,payer_name,amount,method) values($1,'Cliente',12,'cash')",
        [m.tab],
      ),
      /Comanda faturada/,
    );
    await assert.rejects(
      q("delete from service_orders where id=$1", [m.order]),
      /Comanda faturada/,
    );
    await who(1);
    await assert.rejects(
      act("receive_invoice", {
        invoiceId: invoice,
        amountCents: 100,
        method: "cash",
        confirmed: true,
      }),
      /caixa autorizado/,
    );
    await who(0);
    await assert.rejects(
      act("receive_invoice", {
        invoiceId: invoice,
        amountCents: 100,
        method: "cash",
        confirmed: false,
      }),
      /Confira/,
    );
    await act("receive_invoice", {
      invoiceId: invoice,
      amountCents: 300,
      method: "cash",
      confirmed: true,
    });
    await assert.rejects(
      act("account_save", {
        venueId: venue,
        email: "credit1@test.invalid",
        cutDay: 15,
        limitCents: 10000,
      }),
      /Quite o saldo/,
    );
    await assert.rejects(
      act("account_save", {
        venueId: venue,
        email: "credit1@test.invalid",
        cutDay: 31,
        limitCents: 800,
      }),
      /menor/,
    );
    await assert.rejects(
      act("receive_invoice", {
        invoiceId: invoice,
        amountCents: 900,
        method: "manual_pix",
        confirmed: true,
      }),
      /check constraint/,
    );
    await act("receive_invoice", {
      invoiceId: invoice,
      amountCents: 900,
      method: "manual_pix",
      reference: "E-test-bank-123",
      confirmed: true,
    });
    await assert.rejects(
      act("receive_invoice", {
        invoiceId: invoice,
        amountCents: 1,
        method: "cash",
        confirmed: true,
      }),
      /superior/,
    );
    m = await meal(20);
    await who(1);
    assert.equal(
      (
        await act("post_tab", {
          accountId: account,
          tabId: m.tab,
          expectedCents: 2000,
          consent: true,
        })
      ).id,
      invoice,
    );
    await who(0);
    const view = (await q("select venue_snapshot($1) data", [venue]))[0].data;
    assert.equal(view.invoice_pending_cents, 2000);
    assert.equal(view.credit_received_cents, 1200);
    const dir = (
      await q("select credit_snapshot($1,null,'directory') data", [venue])
    )[0].data;
    assert.equal(dir.customers[0].name, "Cliente 1");
    assert.equal(dir.customers[0].limit_cents, undefined);
    const field = (
      await (async () => {
        await db.exec("reset role");
        return q(
          "insert into fields(establishment_id,name,address,created_by,sport_id) values($1,'Quadra','Rua',$2,'volei') returning id",
          [venue, p(0)],
        );
      })()
    )[0].id;
    const booking = (
      await q(
        "insert into field_bookings(field_id,establishment_id,team_name,recurrence,date,time,duration_minutes,created_by) values($1,$2,'Time','single',current_date,'19:00',60,$3) returning id,date::text",
        [field, venue, p(0)],
      )
    )[0];
    await who(0);
    let rental = (
      await act("rental_offer", {
        accountId: account,
        bookingId: booking.id,
        date: booking.date,
        amountCents: 5000,
      })
    ).id;
    await db.exec("reset role");
    await assert.rejects(
      q("update field_bookings set time='20:00' where id=$1", [booking.id]),
      /FATURA/,
    );
    await who(1);
    await act("cancel_rental", { rentalId: rental });
    await who(0);
    rental = (
      await act("rental_offer", {
        accountId: account,
        bookingId: booking.id,
        date: booking.date,
        amountCents: 5000,
      })
    ).id;
    await who(1);
    await act("post_rental", {
      rentalId: rental,
      accountId: account,
      expectedCents: 5000,
      consent: true,
    });
    await who(0);
    await assert.rejects(
      act("receive_rental", {
        rentalId: rental,
        amountCents: 5000,
        method: "cash",
        confirmed: true,
      }),
      /já tratada/,
    );
    await act("account_disable", { accountId: account });
    await who(1);
    s = (await q("select credit_snapshot(null,null,'statement') data"))[0].data;
    assert.equal(s.invoices[0].balance_cents, 7000);
    assert.equal(s.accounts[0].enabled, false);
    m = await meal().catch(() => null);
    assert.equal(m, null);
    await db.exec("reset role");
    await q(
      "update venue_credit_invoices set cut_date=current_date-1 where id=$1",
      [invoice],
    );
    await who(0);
    await act("account_save", {
      venueId: venue,
      email: "credit1@test.invalid",
      cutDay: 31,
      limitCents: 10000,
    });
    m = await meal();
    await who(1);
    await assert.rejects(
      act("post_tab", {
        accountId: account,
        tabId: m.tab,
        expectedCents: 1200,
        consent: true,
      }),
      /vencida/,
    );
    await who(0);
    await act("receive_invoice", {
      invoiceId: invoice,
      amountCents: 7000,
      method: "cash",
      confirmed: true,
    });
    // Partial counter payment before deferral leaves only the remainder on the statement.
    m = await meal(12);
    await db.exec("reset role");
    await q(
      "insert into sale_payments(tab_id,payer_name,amount,method) values($1,'Cliente',2,'cash')",
      [m.tab],
    );
    await who(1);
    const tabContext = (
      await q("select credit_snapshot(null,$1,'tab') data", [m.tab])
    )[0].data;
    assert.equal(tabContext.gross_cents, 1200);
    assert.equal(tabContext.paid_cents, 200);
    assert.equal(tabContext.balance_cents, 1000);
    assert.equal(tabContext.can_bill, true);
    const next = (
      await act("post_tab", {
        accountId: account,
        tabId: m.tab,
        expectedCents: 1000,
        consent: true,
      })
    ).id;
    await db.exec("reset role");
    assert.equal(
      (await q("select credit_balance($1)::int b", [next]))[0].b,
      1000,
    );
    const share = (
      await q("select id from tab_participants where tab_id=$1", [m.tab])
    )[0].id;
    await assert.rejects(
      q(
        "insert into sale_payment_intents(tab_id,payer_participant_id,covered_participant_ids,provider,method,amount_cents) values($1,$2,array[$2]::uuid[],'manual_pix','pix',1000)",
        [m.tab, share],
      ),
      /Comanda faturada/,
    );
    const other = await meal();
    await db.exec("reset role");
    const otherPerson = (
      await q("select id from tab_participants where tab_id=$1", [other.tab])
    )[0].id;
    await q(
      "insert into sale_payment_intents(tab_id,payer_participant_id,covered_participant_ids,provider,method,amount_cents,status) values($1,$2,array[$2]::uuid[],'manual_pix','pix',1200,'cancelled')",
      [other.tab, otherPerson],
    );
    await who(1);
    await assert.rejects(
      act("post_tab", {
        accountId: account,
        tabId: other.tab,
        expectedCents: 1200,
        consent: true,
      }),
      /já entrou/,
    );
    await db.exec("reset role");
    const unrelatedPayment = (
      await q(
        "insert into sale_payments(tab_id,payer_name,amount,method) values($1,'Outro cliente',1,'cash') returning id",
        [other.tab],
      )
    )[0].id;
    await assert.rejects(
      q(
        "insert into sale_payment_allocations(payment_id,item_share_id,amount_cents) values($1,$2,1)",
        [unrelatedPayment, m.itemShare],
      ),
      /mesma comanda/,
    );
    await q(
      "insert into sale_payment_allocations(payment_id,item_share_id,amount_cents) values($1,$2,1)",
      [unrelatedPayment, other.itemShare],
    );
    await assert.rejects(
      q("update service_order_items set order_id=$1 where id=$2", [
        m.order,
        other.item,
      ]),
      /transferir/,
    );
    m = await meal(100);
    await who(1);
    await assert.rejects(
      act("post_tab", {
        accountId: account,
        tabId: m.tab,
        expectedCents: 10000,
        consent: true,
      }),
      /Limite insuficiente/,
    );
    // A cash receipt enters an opened drawer exactly once, manual Pix and issuance do not.
    await who(0);
    const shift = (
      await q("select venue_action('cash_shift',$1) d", [
        JSON.stringify({
          venueId: venue,
          operation: "open",
          amountCents: 10000,
        }),
      ])
    )[0].d.id;
    await act("receive_invoice", {
      invoiceId: next,
      amountCents: 300,
      method: "cash",
      confirmed: true,
    });
    await act("receive_invoice", {
      invoiceId: next,
      amountCents: 700,
      method: "manual_pix",
      reference: "BANK-TEST",
      confirmed: true,
    });
    await db.exec("reset role");
    const booking2 = (
      await q(
        "insert into field_bookings(field_id,establishment_id,team_name,recurrence,date,time,duration_minutes,created_by) values($1,$2,'Outro time','single',current_date,'21:00',60,$3) returning id,date::text",
        [field, venue, p(0)],
      )
    )[0];
    await who(0);
    const rental2 = (
      await act("rental_offer", {
        accountId: account,
        bookingId: booking2.id,
        date: booking2.date,
        amountCents: 2000,
      })
    ).id;
    await act("receive_rental", {
      rentalId: rental2,
      amountCents: 2000,
      method: "cash",
      confirmed: true,
    });
    await q("select venue_action('cash_shift',$1)", [
      JSON.stringify({
        venueId: venue,
        operation: "close",
        shiftId: shift,
        amountCents: 12300,
      }),
    ]);
    await db.exec("reset role");
    const drawer = (
      await q(
        "select expected_amount,difference from cash_shifts where id=$1",
        [shift],
      )
    )[0];
    assert.equal(Number(drawer.expected_amount), 123);
    assert.equal(Number(drawer.difference), 0);
    await who(0);
    await q("select venue_action('staff_save',$1)", [
      JSON.stringify({
        venueId: venue,
        email: "credit2@test.invalid",
        role: "cashier",
        capabilities: ["pdv"],
      }),
    ]);
    await who(2);
    assert.equal(
      (await q("select credit_snapshot($1,null,'directory') d", [venue]))[0].d
        .customers.length,
      1,
    );
    await assert.rejects(
      q("select credit_snapshot($1,null,'statement')", [venue]),
      /Sem acesso/,
    );
    await assert.rejects(
      act("post_tab", {
        accountId: account,
        tabId: other.tab,
        expectedCents: 1200,
        consent: true,
      }),
      /não autorizado/,
    );
    console.log(
      "PASS: customer credit, consent, cut dates, immutable sources, privacy, limits, receipts, rentals, idempotence and arrears",
    );
  } finally {
    await db.close();
  }
}
run().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
