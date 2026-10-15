// Browser fixtures only: all Supabase HTTP and WebSockets intercepted, no real debt or payment.
const { chromium } = require("playwright-core"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = process.env.TEST_URL || "http://localhost:19019",
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uid = id(1),
  pid = id(2),
  venue = id(3),
  account = id(4),
  tab = id(5),
  participant = id(6),
  order = id(7),
  item = id(8),
  invoiceId = id(9),
  rental = id(10),
  now = new Date().toISOString();
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "credit@test.invalid",
  app_metadata: {},
  user_metadata: { name: "Cliente de teste" },
  identities: [],
  created_at: now,
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
const session = {
  access_token: token,
  refresh_token: "test-only",
  token_type: "bearer",
  expires_in: 3600,
  user,
};
const player = {
  id: pid,
  auth_user_id: uid,
  name: "Cliente de teste",
  favorite_sports: ["volei"],
  preferred_position: "line",
  is_guest: false,
  created_at: now,
};
const acct = {
  id: account,
  establishment_id: venue,
  player_id: pid,
  name: "Cliente de teste",
  venue_name: "Arena da Resenha",
  enabled: true,
  cut_day: 15,
  due_days: 5,
  limit_cents: 30000,
  balance_cents: 0,
  overdue: false,
};
const tabRow = {
  id: tab,
  establishment_id: venue,
  label: "C-FATURA",
  customer_player_id: pid,
  customer_name: "Cliente de teste",
  opened_by_player_id: pid,
  opened_at: now,
  status: "open",
  table_label: null,
  closed_at: null,
};
let owner = true,
  denied = false,
  billed = null,
  invoices = [],
  actions = [],
  advanced = false,
  shared = false,
  searches = [];
const preference = {
  account_id: account,
  in_app: true,
  email: false,
  whatsapp: false,
  email_verified: true,
  phone_verified: false,
};
const sources = {
  classes: [
    {
      id: id(25),
      kind: "class",
      account_id: account,
      description: "Vôlei mensal",
      customer_name: acct.name,
      amount_cents: 2000,
    },
  ],
  games: [
    {
      id: id(26),
      kind: "game",
      account_id: account,
      description: "Cota Resenha FC",
      customer_name: acct.name,
      amount_cents: 334,
    },
  ],
};
const parts = [
  { id: participant, player_id: pid, name: acct.name, remaining_cents: 600 },
  {
    id: id(27),
    player_id: id(28),
    name: "Outro cliente",
    remaining_cents: 600,
  },
];
const rentalRow = {
  id: rental,
  account_id: account,
  booking_id: id(12),
  service_date: "2026-10-15",
  description: "Locação · Resenha FC · 2026-10-15 19:00",
  amount_cents: 10000,
  status: "pending",
  customer_name: acct.name,
  venue_name: acct.venue_name,
  venue_id: venue,
};
async function run() {
  const out = path.resolve(".test-runtime/customer-invoice-prints");
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  try {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      page = await ctx.newPage(),
      errors = [];
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (/Refused to|violates.*Content Security Policy/i.test(m.text()))
        errors.push(m.text());
    });
    await ctx.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await ctx.addInitScript(() =>
      Object.defineProperty(navigator, "share", {
        value: undefined,
        configurable: true,
      }),
    );
    await ctx.route("https://*.supabase.co/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        body =
          req.postData() && req.headers()["content-type"]?.includes("json")
            ? req.postDataJSON()
            : {};
      let json = [],
        status = 200;
      if (url.pathname.endsWith("/token")) json = session;
      else if (url.pathname.endsWith("/user")) json = user;
      else if (url.pathname.endsWith("/players"))
        json = url.searchParams.has("auth_user_id") ? player : [player];
      else if (url.pathname.endsWith("/commercial_access_snapshot"))
        json = { role: null, licenses: [], agreements: [] };
      else if (url.pathname.endsWith("/platform_configuration"))
        json = { settings: { discoveryEnabled: true } };
      else if (url.pathname.endsWith("/service_tabs")) json = [tabRow];
      else if(url.pathname.endsWith('/establishments'))json=[{id:venue,owner_player_id:pid,name:acct.venue_name,payout_method:'in_person',access_code:'SYNTHETIC',created_at:now,messaging_provider:'evolution_api'}];
      else if (url.pathname.endsWith("/tab_participants"))
        json = [
          { id: participant, tab_id: tab, player_id: pid, name: acct.name },
        ];
      else if (url.pathname.endsWith("/service_orders"))
        json = [
          {
            id: order,
            tab_id: tab,
            status: "submitted",
            created_by_player_id: pid,
            created_at: now,
          },
        ];
      else if (url.pathname.endsWith("/service_order_items"))
        json = [
          {
            id: item,
            order_id: order,
            product_id: id(11),
            quantity: 1,
            unit_price: 12,
            status: "submitted",
          },
        ];
      else if (url.pathname.endsWith("/venue_snapshot"))
        json = {
          id: venue,
          me: pid,
          name: acct.venue_name,
          owner,
          capabilities: owner ? ["cash", "reports", "pdv"] : [],
          teams: [],
        };
      else if (url.pathname.endsWith("/credit_export"))
        json = { invoices, truncated: false, generated_at: now };
      else if(url.pathname.endsWith('/credit_checkout_history'))json=invoices[0].online?.intents??[];
      else if(url.pathname.endsWith('/verify-customer-phone')){if(body.action==='send')json={id:id(45),message:'Código aceito pelo provedor. Confira o WhatsApp; entrega não comprovada.'};else{preference.phone_verified=true;json={message:'Telefone confirmado para sua conta. Lembretes continuam dependendo da sua autorização.'};}}
      else if(url.pathname.endsWith('/whatsapp-instance'))json=body.action==='connect'?{configured:true,state:'connecting',code:'SYNTHETIC-QR-NO-REAL-NUMBER',pairingCode:'1234-5678',message:'QR temporário de teste.'}:{configured:true,state:'open',message:'WhatsApp conectado.'};
      else if (url.pathname.endsWith("/invoice-payment")) {
        const i = invoices[0];
        if (body.action === "checkout")
          i.online = {
            available: true,
            held: true,
            intents: [
              {
                id: id(30),
                provider: "mercado_pago",
                state: "pending",
                amount_cents: body.amountCents??i.balance_cents,
                created_at:now,
                pix_code: "synthetic-pix-code-only",
                expires_at: new Date(Date.now() + 1800000).toISOString(),
              },
            ],
          };
        if (body.action === "reconcile") {
          i.online.held = false;
          i.online.intents[0].state = "paid";
          i.payments.push({
            id: id(31),
            amount_cents: i.online.intents[0].amount_cents,
            method: "online_pix",
            paid_at: now,
            confirmation: "gateway",
          });
          i.balance_cents -= i.online.intents[0].amount_cents;
          i.online.intents[0].fee_cents=50;i.online.intents[0].net_cents=i.online.intents[0].amount_cents-50;
        }
        if(body.action==='refund'){const t=i.online.intents[0],n=body.amountCents??t.amount_cents;t.refunded_cents=(t.refunded_cents??0)+n;t.refund_pending=false;i.balance_cents+=n;i.payments.at(-1).refunds=[{id:id(46),amount_cents:n,cumulative_cents:n,created_at:now}];}
        json = { id: invoiceId, message: "Provedor consultado." };
      } else if (
        url.pathname.endsWith("/credit_snapshot") ||
        url.pathname.endsWith("/credit_search")
      ) {
        if (url.pathname.endsWith("/credit_search"))
          searches.push(body.p_query);
        if (denied) {
          status = 403;
          json = {
            message: "FATURA: Sem acesso às faturas deste estabelecimento.",
          };
        } else if (body.p_mode === "tab")
          json = {
            me: pid,
            can_record: owner,
            venue_id: venue,
            tab_id: tab,
            balance_cents: shared
              ? parts.reduce((s, p) => s + p.remaining_cents, 0)
              : 1200,
            gross_cents: 1200,
            paid_cents: 0,
            can_bill: true,
            payment_started: false,
            billed: shared ? null : billed,
            ...(shared
              ? {
                  parts,
                  split_ready: true,
                  has_transfers: parts.some((p) => p.invoice_id),
                  transferred_cents: parts.some((p) => p.invoice_id) ? 600 : 0,
                }
              : {}),
            accounts: [acct],
          };
        else if (body.p_mode === "directory")
          json = {
            customers: [{ id: account, player_id: pid, name: acct.name }],
          };
        else
          json = {
            me: pid,
            owner: owner && !!body.p_venue,
            can_record: owner && !!body.p_venue,
            can_offer: owner && !!body.p_venue,
            accounts: [acct],
            invoices,
            rentals: [rentalRow],
            bookings: owner
              ? [
                  {
                    id: id(12),
                    team_name: "Resenha FC",
                    date: "2026-10-15",
                    recurrence: "single",
                    time: "19:00",
                    duration_minutes: 60,
                  },
                ]
              : [],
            ...(advanced
              ? {
                  sources,
                  preferences: [preference],
                  summary: {
                    count: 1,
                    pending_cents: invoices[0]?.balance_cents ?? 0,
                    overdue_cents: 0,
                  },
                }
              : {}),
          };
      } else if (url.pathname.endsWith("/credit_action")) {
        actions.push(body);
        const d = body.p_data;
        json = { id: account };
        if (body.p_action === "post_tab") {
          billed = {
            id: id(15),
            invoice_id: invoiceId,
            kind: "food",
            description: "Consumo · C-FATURA",
            amount_cents: 1200,
            cut_date: "2026-10-15",
            customer_name: acct.name,
            posted_at: now,
            acceptance: "app",
          };
          acct.balance_cents += 1200;
          invoices = [
            {
              id: invoiceId,
              account_id: account,
              venue_id: venue,
              venue_name: acct.venue_name,
              player_id: pid,
              customer_name: acct.name,
              cut_date: "2026-10-15",
              due_date: "2026-10-20",
              total_cents: 1200,
              balance_cents: 1200,
              status: "open",
              lines: [billed],
              payments: [],
            },
          ];
          json = { id: invoiceId };
        } else if (body.p_action === "receive_invoice") {
          const i = invoices[0];
          i.balance_cents -= d.amountCents;
          acct.balance_cents -= d.amountCents;
          i.payments.push({
            id: id(18),
            amount_cents: d.amountCents,
            method: d.method,
            reference: d.reference,
            paid_at: now,
            confirmation: "counter",
          });
        } else if (body.p_action === "reverse_payment") {
          const p = invoices[0].payments.find((p) => p.id === d.paymentId);
          p.reversal = { reason: d.reason, created_at: now };
          invoices[0].balance_cents += p.amount_cents;
        } else if (
          body.p_action === "post_class" ||
          body.p_action === "post_game"
        ) {
          const rows =
            body.p_action === "post_class" ? sources.classes : sources.games;
          invoices[0].balance_cents += rows[0].amount_cents;
          rows.splice(0, 1);
        } else if (body.p_action === "reminder_preferences") {
          Object.assign(preference, {
            in_app: d.inApp,
            email: d.email,
            whatsapp: d.whatsapp,
          });
        } else if(body.p_action==='agreement_propose'){
          invoices[0].agreements=[{id:id(47),status:'proposed',amount_cents:invoices[0].balance_cents,reason:d.reason,schedule:[{number:1,amount_cents:invoices[0].balance_cents/2,remaining_cents:invoices[0].balance_cents/2,due_date:d.firstDue},{number:2,amount_cents:invoices[0].balance_cents/2,remaining_cents:invoices[0].balance_cents/2,due_date:'2026-12-10'}]}];
        } else if(body.p_action==='agreement_accept'){
          invoices[0].agreements[0].status='accepted';invoices[0].effective_due_date=invoices[0].agreements[0].schedule[0].due_date;
        } else if (body.p_action === "post_part") {
          const p = parts.find((p) => p.id === d.participantId);
          p.remaining_cents = 0;
          p.invoice_id = invoiceId;
        } else if (body.p_action === "pay_part")
          parts.find((p) => p.id === d.participantId).remaining_cents = 0;
        else if (body.p_action === "post_rental") {
          rentalRow.status = "billed";
          acct.balance_cents += rentalRow.amount_cents;
          invoices[0].balance_cents += rentalRow.amount_cents;
          invoices[0].total_cents += rentalRow.amount_cents;
        }
      }
      await route.fulfill({
        status,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "x-supabase-api-version": "2024-01-01",
        },
        json,
      });
    });
    const input = (label) =>
        page.getByText(label, { exact: true }).locator("..").locator("input"),
      button = (label) =>
        page.getByRole("button", { name: label, exact: true });
    const fits = async () =>
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "horizontal overflow",
      );
    const shot = async (name) =>
      page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
    await page.goto(base + "/login");
    await page.getByPlaceholder("voce@email.com").fill(user.email);
    await page.getByPlaceholder("••••••••").fill("test-only");
    await button("Entrar").click();
    await page.waitForURL(base + "/");
    await require('./ui-test-consent.cjs')(page);
    await page.goto(base + `/operacao/faturas?establishmentId=${venue}`);
    await page
      .getByText("Liberar ou atualizar cliente", { exact: true })
      .waitFor();
    await input("E-mail da conta confirmada").fill("jogador@test.invalid");
    await button("Liberar crédito").click();
    await page.getByText("Crédito autorizado.", { exact: true }).waitFor();
    assert.equal(actions[0].p_data.cutDay, 10);
    assert.equal(actions[0].p_data.limitCents, 30000);
    assert.equal(actions[0].p_data.dueDays, 5);
    assert.match(actions[0].p_data.requestId, /^[0-9a-f-]{36}$/);
    await fits();
    await shot("dono-clientes-e-faturas-mobile");
    await page.goto(base + `/operacao/comanda/${tab}`);
    await button("Deixar na fatura").waitFor();
    assert(await button("Deixar na fatura").isDisabled());
    await button("Cliente de teste").last().click();
    await page
      .getByRole("switch", {
        name: "Aceito assumir o saldo inteiro na minha fatura",
      })
      .check();
    assert(await button("Gerar cobrança Pix").isVisible());
    await fits();
    await shot("comanda-pagar-agora-ou-faturar-mobile");
    await button("Deixar na fatura").click();
    await page
      .getByText("Comanda na fatura · R$ 12,00", { exact: true })
      .waitFor();
    assert.equal(await button("Gerar cobrança Pix").count(), 0);
    assert.equal(
      await page.getByText("Novo pedido", { exact: true }).count(),
      0,
    );
    assert.equal(
      actions.find((a) => a.p_action === "post_tab").p_data.expectedCents,
      1200,
    );
    assert.equal(
      actions.find((a) => a.p_action === "post_tab").p_data.consent,
      true,
    );
    await shot("comanda-faturada-sem-dupla-cobranca");
    await page.goto(base + `/operacao/faturas?establishmentId=${venue}`);
    await button("Ver lançamentos e pagamentos").click();
    await input("Valor recebido (R$) · aceita parcial").fill("5");
    await page
      .getByRole("switch", { name: "Conferi o dinheiro ou o crédito no banco" })
      .last()
      .check();
    await button("Confirmar recebimento").last().click();
    await page
      .getByText("Recebimento registrado, saldo atualizado.", { exact: true })
      .waitFor();
    assert.equal(invoices[0].balance_cents, 700);
    await fits();
    await shot("dono-recebimento-parcial-fatura");
    await require("./invoice-v2-ui.cjs")({
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
      sources,
      preference,
      setAdvanced: () => {
        advanced = true;
        invoices[0].online = { available: true, held: false, intents: [] };
      },
      setShared: () => {
        shared = true;
      },
      setOwner: (v) => {
        owner = v;
      },
    });
    await require('./invoice-v3-ui.cjs')({page,base,venue,input,button,fits,shot,actions,invoices,setOwner:v=>{owner=v;}});
    // Restore baseline state after the extended synthetic scenarios.
    invoices[0].balance_cents = 700;
    invoices[0].online = { available: false, held: false, intents: [] };
    advanced = false;
    owner = false;
    await page.goto(base + "/faturas");
    await page.getByText("Minhas faturas", { exact: true }).waitFor();
    await page.getByText("Saldo R$ 7,00", { exact: true }).waitFor();
    assert.equal(await button("Liberar crédito").count(), 0);
    assert.equal(await button("Confirmar recebimento").count(), 0);
    assert(await button("Deixar locação na fatura").isDisabled());
    await page
      .getByRole("switch", { name: "Aceito deixar este valor na minha fatura" })
      .check();
    await button("Deixar locação na fatura").click();
    await page
      .getByText("Locação incluída na fatura.", { exact: true })
      .waitFor();
    await fits();
    await shot("cliente-minhas-faturas-e-locacao");
    await page.setViewportSize({ width: 320, height: 760 });
    await fits();
    await page.setViewportSize({ width: 1280, height: 900 });
    await fits();
    await shot("cliente-faturas-desktop");
    denied = true;
    await button("Atualizar faturas").click();
    await page
      .getByText("Sem acesso às faturas deste estabelecimento.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByText("Saldo R$ 107,00", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.getByText("Arena da Resenha", { exact: true }).count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: owner authorization, opt-in whole tab, immediate-payment option, billed payment lock, partial receipt, rental choice, customer privacy, 320/mobile/desktop, CSP. Screenshots: " +
        out,
    );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
