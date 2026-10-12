// All migrations in isolated PostgreSQL; never creates real sellers/payments.
const {
  PGlite,
} = require("../.test-runtime/node_modules/@electric-sql/pglite");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const db = new PGlite(),
  users = Array.from(
    { length: 4 },
    (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
async function who(i, role = "authenticated") {
  await db.exec("reset role");
  await q("select set_config('request.jwt.claim.sub',$1,false)", [
    i === null ? "" : users[i],
  ]);
  await db.exec(`set role ${role}`);
}
const act = async (a, d = {}) =>
  (await q("select shop_action($1,$2::jsonb) data", [a, JSON.stringify(d)]))[0]
    .data;
const service = async (a, d = {}) =>
  (await q("select shop_service($1,$2::jsonb) data", [a, JSON.stringify(d)]))[0]
    .data;
const snap = async (mode = "catalog") =>
  (await q("select shop_snapshot($1) data", [mode]))[0].data;
async function run() {
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema vault;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
 create function vault.create_secret(secret text) returns uuid language plpgsql as $$declare k uuid:=gen_random_uuid();begin insert into vault.decrypted_secrets values(k,secret);return k;end$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_user::text$$;
 grant usage on schema public,auth to authenticated,anon,service_role;grant execute on all functions in schema auth to authenticated,anon,service_role;`);
    for (const f of fs
      .readdirSync(path.join(__dirname, "../supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
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
          `shop${i}@test.invalid`,
          JSON.stringify({ name: `Comprador ${i}` }),
        ],
      );
    const ps = await q("select id,auth_user_id from players"),
      p = (i) => ps.find((x) => x.auth_user_id === users[i]).id;
    await q(
      "insert into platform_admin_accounts(auth_user_id,role) values($1,'owner')",
      [users[0]],
    );
    await who(1);
    await assert.rejects(
      act("seller_create", { name: "Loja sem termos" }),
      /termos/,
    );
    await assert.rejects(
      act("seller_create", {
        name: "Falsa oficial",
        kind: "official",
        consent: true,
        termsVersion: "shop-v1",
      }),
      /Somente/,
    );
    const seller = (
      await act("seller_create", {
        name: "Parceiro de teste",
        phone: "11999990000",
        pickupAddress: "Rua de teste 100",
        consent: true,
        termsVersion: "shop-v1",
      })
    ).id;
    assert.equal((await snap("manage")).sellers[0].status, "pending");
    assert.equal((await snap()).sellers.length, 0);
    const draft = {
      sellerId: seller,
      name: "Bola de teste",
      description: "Produto fictício",
      category: "ball",
      photos: [],
      active: true,
      variants: [
        {
          sku: "BALL-1",
          size: "Único",
          color: "Branca",
          priceCents: 10000,
          costCents: 6000,
          stock: 2,
        },
      ],
    };
    const product = (await act("product_save", draft)).id;
    assert.equal((await snap()).products.length, 0);
    await who(2);
    await assert.rejects(act("product_save", draft), /permissão/);
    await assert.rejects(q("select * from shop_orders"), /permission denied/);
    await assert.rejects(service("gateway_context", {}), /permission denied/);
    await who(0);
    await act("seller_review", {
      id: seller,
      revision: 1,
      status: "active",
      commissionBps: 500,
      reason: "Acordo comercial de teste",
    });
    await who(1);
    const catalog = await snap(),
      sku = catalog.products[0].variants[0].id;
    assert.equal(catalog.products[0].variants[0].cost_cents, null);
    await who(null, "service_role");
    const gateway = (
      await service("gateway_save", {
        actor: users[1],
        sellerId: seller,
        provider: "mercado_pago",
        collectorId: "test-collector",
        credentials: { accessToken: "FAKE-TEST-ONLY" },
      })
    ).id;
    await who(2);
    const input = {
      sellerId: seller,
      nonce: "00000000-0000-4000-8000-000000000200",
      fulfillment: "pickup",
      phone: "11999990000",
      items: [{ variantId: sku, quantity: 1, priceCents: 1 }],
      totalCents: 1,
      consent: true,
      termsVersion: "shop-buy-v1",
    };
    await assert.rejects(
      act("prepare_order", { ...input, consent: false }),
      /Confirme/,
    );
    await assert.rejects(act("prepare_order", input), /homologados/);
    await who(1);
    await assert.rejects(
      act("gateway_enable", {
        id: gateway,
        verified: true,
        reason: "Autoaprovação indevida",
      }),
      /administrador/,
    );
    await who(0);
    await act("gateway_enable", {
      id: gateway,
      verified: true,
      reason: "Homologação fictícia exclusiva deste teste isolado",
    });
    await who(2);
    let order = await act("prepare_order", input);
    assert.equal(order.total_cents, 10000);
    assert(!("commission_cents" in order));
    assert.equal((await act("prepare_order", input)).id, order.id);
    await assert.rejects(
      act("prepare_order", {
        ...input,
        nonce: "00000000-0000-4000-8000-000000000201",
        items: [{ variantId: sku, quantity: 2 }],
      }),
      /estoque/,
    );
    await who(3);
    await assert.rejects(
      q("select shop_order($1)", [order.id]),
      /indisponível/,
    );
    await assert.rejects(
      act("fulfill", { id: order.id, status: "delivered" }),
      /indisponível/,
    );
    await who(null, "service_role");
    assert(
      (await service("claim_checkout", { actor: users[2], orderId: order.id }))
        .claimed,
    );
    assert.equal(
      (await service("claim_checkout", { actor: users[2], orderId: order.id }))
        .claimed,
      false,
    );
    await service("checkout_save", {
      orderId: order.id,
      externalId: "pref-test",
      url: "https://www.mercadopago.com.br/checkout/test",
    });
    const settled = {
      orderId: order.id,
      gatewayId: gateway,
      paymentId: "test-payment-1",
      amountCents: 10000,
      currency: "BRL",
      status: "approved",
      updatedAt: new Date().toISOString(),
      feeCents: 400,
    };
    await assert.rejects(
      service("settle", { ...settled, amountCents: 1 }),
      /divergentes/,
    );
    await service("settle", settled);
    await service("settle", settled);
    await who(2);
    order = (await q("select shop_order($1) data", [order.id]))[0].data;
    assert.equal(order.status, "paid");
    assert.equal(order.events.filter((e) => e.action === "paid").length, 1);
    await assert.rejects(
      act("fulfill", { id: order.id, status: "delivered" }),
      /vendedor/,
    );
    await act("refund_request", {
      id: order.id,
      reason: "Produto não desejado no teste",
    });
    await who(1);
    await act("fulfill", { id: order.id, status: "ready" });
    await assert.rejects(
      act("seller_review", {
        id: seller,
        revision: 2,
        status: "active",
        commissionBps: 3000,
        reason: "Tentativa de autoaprovação",
      }),
      /administrativa/,
    );
    await who(0);
    await act("commission_received", {
      id: order.id,
      reference: "REC-TEST",
      reason: "Recebimento fictício de teste",
    });
    await who(null, "service_role");
    await service("claim_refund", {
      actor: users[1],
      orderId: order.id,
      paymentId: "test-payment-1",
      reason: "Devolução fictícia de teste",
      restock: true,
    });
    await service("settle", {
      ...settled,
      status: "refunded",
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    });
    await service("settle", settled);
    await who(2);
    order = (await q("select shop_order($1) data", [order.id]))[0].data;
    assert.equal(order.status, "refunded");
    assert.equal((await snap()).products[0].variants[0].stock, 2);
    // Cancelled/expired stock must not be allocated again by a delayed payment.
    const late = await act("prepare_order", {
      ...input,
      nonce: "00000000-0000-4000-8000-000000000202",
    });
    await act("cancel", { id: late.id });
    await who(null, "service_role");
    await service("settle", {
      ...settled,
      orderId: late.id,
      paymentId: "late-payment",
      updatedAt: new Date().toISOString(),
    });
    await who(2);
    assert.equal(
      (await q("select shop_order($1) data", [late.id]))[0].data.status,
      "payment_review",
    );
    assert.equal((await snap()).products[0].variants[0].stock, 2);
    await who(1);
    await assert.rejects(
      act("product_save", {
        ...draft,
        id: product,
        revision: 1,
        variants: [
          { id: sku, revision: 1, sku: "BALL-1", priceCents: 10000, stock: 5 },
        ],
      }),
      /Estoque/,
    );
    // Delivery coverage, stored consent, private financial data and explicit returns.
    await act("seller_save", {
      id: seller,
      revision: 2,
      name: "Parceiro de teste",
      phone: "11999990000",
      pickupAddress: "Rua de teste 100",
      pickupEnabled: true,
      deliveryEnabled: true,
      deliveryFeeCents: 1500,
      cepPrefixes: ["740"],
    });
    const address = {
      cep: "74000123",
      street: "Rua Teste",
      number: "100",
      city: "Goiânia",
      state: "GO",
      complement: "",
      injected: "MUST-NOT-PERSIST",
    };
    await who(2);
    await assert.rejects(
      act("prepare_order", {
        ...input,
        nonce: require("node:crypto").randomUUID(),
        fulfillment: "delivery",
        address: { ...address, cep: "01000123" },
      }),
      /CEP fora/,
    );
    const delivery = await act("prepare_order", {
      ...input,
      nonce: require("node:crypto").randomUUID(),
      fulfillment: "delivery",
      address,
    });
    assert.equal(delivery.total_cents, 11500);
    assert(!("injected" in delivery.address));
    const recorded = (await q("select shop_order($1) data", [delivery.id]))[0]
      .data;
    assert.equal(recorded.buyer_terms_version, "shop-buy-v1");
    assert(recorded.buyer_terms_at);
    assert(!("provider_fee_cents" in recorded));
    assert(!("cost_cents" in recorded.lines[0]));
    await who(null, "service_role");
    await assert.rejects(
      service("seller_access", { actor: users[3], sellerId: seller }),
      /autorizado/,
    );
    await service("seller_access", { actor: users[1], sellerId: seller });
    const paid = {
      ...settled,
      orderId: delivery.id,
      paymentId: "delivery-payment",
      amountCents: 11500,
      updatedAt: new Date().toISOString(),
    };
    await service("settle", paid);
    await service("settle", {
      ...paid,
      status: "partial_refund",
      updatedAt: new Date(Date.now() + 2000).toISOString(),
    });
    await who(2);
    assert.equal(
      (await q("select shop_order($1) data", [delivery.id]))[0].data.status,
      "payment_review",
    );
    await who(1);
    await assert.rejects(
      act("fulfill", { id: delivery.id, status: "delivered" }),
      /Transição/,
    );
    await assert.rejects(
      act("restock_return", {
        id: delivery.id,
        received: true,
        reason: "Não houve devolução",
      }),
      /físico/,
    );
    await who(null, "service_role");
    await service("settle", {
      ...paid,
      status: "refunded",
      updatedAt: new Date(Date.now() + 4000).toISOString(),
    });
    await who(1);
    assert.equal((await snap()).products[0].variants[0].stock, 1);
    await act("restock_return", {
      id: delivery.id,
      received: true,
      reason: "Recebi os itens devolvidos",
    });
    await act("restock_return", {
      id: delivery.id,
      received: true,
      reason: "Repetição sem duplicação",
    });
    assert.equal((await snap()).products[0].variants[0].stock, 2);
    await who(2);
    const expiring = await act("prepare_order", {
      ...input,
      nonce: require("node:crypto").randomUUID(),
    });
    await db.exec("reset role");
    await q(
      "update shop_orders set expires_at=now()-interval '1 minute' where id=$1",
      [expiring.id],
    );
    await who(null, "service_role");
    await db.exec("select shop_expire()");
    await who(2);
    assert.equal(
      (await q("select shop_order($1) data", [expiring.id]))[0].data.status,
      "cancelled",
    );
    assert.equal((await snap()).products[0].variants[0].stock, 2);
    await who(1);
    await act("gateway_disconnect", {
      sellerId: seller,
      reason: "Encerramento da validação",
    });
    await who(2);
    await assert.rejects(
      act("prepare_order", {
        ...input,
        nonce: require("node:crypto").randomUUID(),
      }),
      /homologados/,
    );
    // More than a single history page, stable timestamp/UUID cursor, no duplicates.
    await db.exec("reset role");
    await q(
      "insert into shop_orders(seller_id,buyer_id,nonce,gateway_id,status,fulfillment,customer_phone,pickup_address,subtotal_cents,shipping_cents,total_cents,commission_cents,stock_released) select $1,$2,gen_random_uuid(),$3,'cancelled','pickup','11999990000','Rua Teste',100,0,100,0,true from generate_series(1,35)",
      [seller, p(2), gateway],
    );
    await who(2);
    const page1 = (await q("select shop_orders_page() data"))[0].data;
    assert.equal(page1.orders.length, 30);
    assert(page1.hasMore);
    const last = page1.orders.at(-1),
      page2 = (
        await q("select shop_orders_page('buyer',null,$1,$2) data", [
          last.created_at,
          last.id,
        ])
      )[0].data;
    assert(page2.orders.length > 0);
    assert(!page2.hasMore);
    assert(!page2.orders.some((o) => page1.orders.some((p) => p.id === o.id)));
    await who(3);
    assert.equal(
      (await q("select shop_orders_page() data"))[0].data.orders.length,
      0,
    );
    assert.equal(
      (await q("select shop_orders_page('manage') data"))[0].data.orders.length,
      0,
    );
    await who(null, "anon");
    assert.equal((await snap()).products.length, 1);
    await assert.rejects(act("seller_create", {}), /permission denied/);
    console.log(
      "PASS: partner approval, private tables/service, catalog visibility, server prices, stock and nonce, ownership, amount validation, idempotent paid/refund, stock restoration, late-payment review and stale inventory edits. No real money.",
    );
  } finally {
    await db.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
