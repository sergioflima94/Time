// Real production bundle with intercepted backend. Never signs in or charges a real person.
const { chromium } = require("playwright-core"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = process.env.TEST_URL || "http://localhost:19019",
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  uid = id(1),
  pid = id(2),
  sellerId = id(3),
  partnerId = id(4),
  created = new Date().toISOString();
const user = {
    id: uid,
    aud: "authenticated",
    role: "authenticated",
    email: "shop@test.invalid",
    app_metadata: {},
    user_metadata: { name: "Validação loja" },
    identities: [],
    created_at: created,
  },
  token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`,
  session = {
    access_token: token,
    refresh_token: "test-only",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
const player = {
  id: pid,
  auth_user_id: uid,
  name: "Validação loja",
  nickname: null,
  phone: null,
  avatar_url: null,
  preferred_position: "line",
  favorite_sports: ["futebol"],
  is_guest: false,
  created_at: created,
};
let sellers = [
  {
    id: sellerId,
    name: "MarcouJogou • Loja oficial",
    kind: "official",
    status: "active",
    phone: "11999990000",
    pickup_address: "Arena Central, Rua do Esporte 100",
    pickup_enabled: true,
    delivery_enabled: true,
    delivery_fee_cents: 1500,
    cep_prefixes: ["740"],
    commission_bps: 0,
    revision: 1,
    can_manage: true,
    gateway: { provider: "mercado_pago", enabled: true },
  },
  {
    id: partnerId,
    name: "Parceiro Esporte",
    kind: "partner",
    status: "pending",
    phone: "11999991111",
    pickup_address: "Rua da Quadra 200",
    pickup_enabled: true,
    delivery_enabled: false,
    delivery_fee_cents: 0,
    cep_prefixes: [],
    commission_bps: 500,
    revision: 1,
    can_manage: true,
    gateway: null,
  },
];
let products = [
    {
      id: id(5),
      seller_id: sellerId,
      seller_name: sellers[0].name,
      seller_kind: "official",
      name: "Bola society",
      description:
        "Bola resistente para reunir a turma. Produto sintético de validação.",
      category: "ball",
      photos: [],
      active: true,
      revision: 1,
      sponsored: false,
      variants: ["Branca", "Azul", "Verde", "Amarela"].map((color, i) => ({
        id: id(10 + i),
        sku: `BOLA-${i}`,
        size: "5",
        color,
        price_cents: 12990,
        stock: 20,
        active: true,
        revision: 1,
        cost_cents: 8000,
      })),
    },
  ],
  orders = [],
  calls = [];
const out = path.resolve(".test-runtime/shop-ui");
fs.mkdirSync(out, { recursive: true });
async function run() {
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
    await ctx.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await ctx.route("https://*.supabase.co/**", async (route) => {
      const url = new URL(route.request().url()),
        headers = {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "x-supabase-api-version": "2024-01-01",
        };
      let json = [];
      const body =
        route.request().postData() &&
        route.request().headers()["content-type"]?.includes("application/json")
          ? route.request().postDataJSON()
          : {};
      if (url.pathname.includes("/storage/v1/object/")) {
        if (route.request().method() === "POST") {
          assert(url.pathname.includes(uid + "/"));
          await route.fulfill({
            status: 200,
            headers,
            json: { Key: "shop-media/test-upload" },
          });
        } else
          await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: fs.readFileSync(
              path.resolve("assets/branding/marcoujogou-icon.png"),
            ),
          });
        return;
      }
      if (url.pathname.endsWith("/token")) json = session;
      else if (url.pathname.endsWith("/user")) json = user;
      else if (url.pathname.endsWith("/players"))
        json = url.searchParams.has("auth_user_id") ? player : [player];
      else if (url.pathname.endsWith("/platform_configuration"))
        json = {
          settings: { discoveryEnabled: true, sponsoredEnabled: false },
        };
      else if (url.pathname.endsWith("/commercial_access_snapshot"))
        json = { role: null, licenses: [], agreements: [] };
      else if (url.pathname.endsWith("/shop_snapshot")) {
        const manage = body.p_mode === "manage";
        json = {
          admin: route.request().headers().authorization === `Bearer ${token}`,
          sellers: sellers.filter((s) => manage || s.status === "active"),
          products: products
            .filter(
              (p) =>
                manage ||
                (p.active &&
                  sellers.find((s) => s.id === p.seller_id).status ===
                    "active"),
            )
            .map((p) => ({
              ...p,
              variants: p.variants.map((v) => ({
                ...v,
                cost_cents: manage ? v.cost_cents : null,
              })),
            })),
          orders,
          offset: body.p_offset || 0,
        };
      } else if (url.pathname.endsWith("/shop_orders_page"))
        json = {
          orders: orders.filter(
            (o) => !body.p_seller || o.seller_id === body.p_seller,
          ),
          hasMore: false,
        };
      else if (url.pathname.endsWith("/shop_cart"))
        json = products.filter((p) =>
          p.variants.some((v) => body.p_variants.includes(v.id)),
        );
      else if (url.pathname.endsWith("/shop_order"))
        json = orders.find((o) => o.id === body.p_order);
      else if (url.pathname.endsWith("/shop_action")) {
        calls.push(body);
        const d = body.p_data,
          a = body.p_action;
        if (a === "prepare_order") {
          assert(d.consent && d.termsVersion === "shop-buy-v1");
          assert(!("totalCents" in d));
          const lines = d.items.map((i) => {
              const v = products[0].variants.find((v) => v.id === i.variantId);
              return {
                variant_id: v.id,
                product_name: products[0].name,
                sku: v.sku,
                size: v.size,
                color: v.color,
                quantity: i.quantity,
                unit_cents: v.price_cents,
              };
            }),
            subtotal = lines.reduce((n, l) => n + l.quantity * l.unit_cents, 0),
            shipping = d.fulfillment === "delivery" ? 1500 : 0;
          json = {
            id: id(100 + orders.length),
            buyer_id: pid,
            seller_id: sellerId,
            seller_name: sellers[0].name,
            seller_phone: sellers[0].phone,
            buyer_name: player.name,
            status: "pending",
            fulfillment: d.fulfillment,
            address: d.address,
            customer_phone: d.phone,
            pickup_address: sellers[0].pickup_address,
            subtotal_cents: subtotal,
            shipping_cents: shipping,
            total_cents: subtotal + shipping,
            provider: "mercado_pago",
            created_at: created,
            expires_at: new Date(Date.now() + 1800000).toISOString(),
            can_manage: true,
            lines,
            events: [
              {
                action: "pending",
                detail:
                  "Estoque reservado por 30 minutos. Aguardando pagamento validado.",
                created_at: created,
              },
            ],
            receipts: [],
          };
          orders.push(json);
        } else if (a === "seller_review") {
          const s = sellers.find((s) => s.id === d.id);
          s.status = d.status;
          s.commission_bps = d.commissionBps;
          s.revision++;
          json = { id: s.id };
        } else if (a === "product_save") {
          assert(
            d.variants[0].priceCents === 19990 && d.variants[0].stock === 15,
          );
          json = { id: id(30) };
        } else if (a === "cancel") {
          orders.find((o) => o.id === d.id).status = "cancelled";
          json = orders.find((o) => o.id === d.id);
        } else json = {};
      } else if (url.pathname.endsWith("/shop-payment")) {
        calls.push(body);
        json = {
          message: "Consulta de validação: nenhuma confirmação financeira.",
        };
      }
      await route.fulfill({ status: 200, headers, json });
    });
    const field = (label) =>
      page.getByText(label, { exact: true }).locator("..").locator("input");
    async function fits() {
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "horizontal overflow",
      );
    }
    async function shot(name) {
      await page.screenshot({
        path: path.join(out, name + ".png"),
        fullPage: true,
      });
    }
    await page.goto(base + "/loja");
    await page.getByText("Bola society", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("Parceiro Esporte", { exact: true }).count(),
      0,
    );
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      await fits();
      await shot("catalogo-" + width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Adicionar ao carrinho", exact: true })
      .click();
    await page.getByText("Carrinho (1)", { exact: true }).click();
    await page
      .getByRole("button", { name: "Entrar para fechar pedido", exact: true })
      .click();
    await page.getByPlaceholder("voce@email.com").fill(user.email);
    await page.getByPlaceholder("••••••••").fill("test-only");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(base + "/");
    await page.goto(base + "/loja");
    await page.getByText("Carrinho (1)", { exact: true }).click();
    await page.getByText("Entrega", { exact: true }).click();
    for (const [label, value] of [
      ["CEP (8 dígitos)", "74000123"],
      ["Rua", "Rua de teste"],
      ["Número", "100"],
      ["Cidade", "Goiânia"],
      ["UF", "GO"],
      ["Telefone para este pedido", "62999990000"],
    ])
      await field(label).fill(value);
    await page
      .getByRole("switch", { name: "Concordo com itens, vendedor e entrega" })
      .click();
    await fits();
    await shot("carrinho-entrega-390");
    await page
      .getByRole("button", {
        name: "Criar pedido e conferir pagamento",
        exact: true,
      })
      .click();
    await page.waitForURL(/\/loja\/pedido\//);
    await page.getByText("Aguardando pagamento", { exact: true }).waitFor();
    assert(orders[0].total_cents === 14490);
    await page.reload();await page.getByText('Aguardando pagamento',{exact:true}).waitFor();assert(page.url().endsWith(orders[0].id));
    await fits();
    await shot("pedido-pendente-390");
    await page.goto(base + "/loja/pedido/" + orders[0].id + "?status=approved");
    await page.getByText("Aguardando pagamento", { exact: true }).waitFor();
    await page
      .getByRole("button", {
        name: "Conferir pagamento no provedor",
        exact: true,
      })
      .click();
    await page
      .getByText("Consulta de validação: nenhuma confirmação financeira.", {
        exact: true,
      })
      .waitFor();
    assert(orders[0].status === "pending");
    assert.equal(
      await page
        .getByRole("button", { name: "Confirmar entrega", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Cancelar pedido não pago", exact: true })
      .click();
    await page.getByText("Cancelado", { exact: true }).waitFor();
    await page.goto(base + "/loja/gerenciar");
    await page
      .getByText("Gestão da loja e parceiros", { exact: true })
      .waitFor();
    await page.getByText("Configurar", { exact: true }).click();
    await page
      .getByRole("button", { name: "Parceiro Esporte", exact: true })
      .click();
    await page.getByText("Configurar", { exact: true }).click();
    await field("Motivo da aprovação, suspensão ou recusa").fill(
      "Parceria aprovada na validação",
    );
    await field("Comissão percentual (0 a 30)").fill("7,5");
    await page
      .getByRole("button", { name: "Aprovar parceiro", exact: true })
      .click();
    await page
      .getByText("Alteração salva e registrada.", { exact: true })
      .waitFor();
    assert.equal(sellers[1].status, "active");
    assert.equal(sellers[1].commission_bps, 750);
    await page.getByText("Produtos", { exact: true }).click();
    await page
      .getByRole("button", { name: "Novo produto", exact: true })
      .click();
    for (const [label, value] of [
      ["Nome do produto", "Uniforme do time"],
      ["Código SKU 1", "CAMISA-P"],
      ["Tamanho 1", "P"],
      ["Cor 1", "Azul"],
      ["Preço em reais 1", "199,90"],
      ["Custo unitário privado 1", "100"],
      ["Estoque disponível 1", "15"],
    ])
      await field(label).fill(value);
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Adicionar foto da galeria", exact: true })
      .click();
    await (
      await chooser
    ).setFiles(path.resolve("assets/branding/marcoujogou-icon.png"));
    await page.getByText("Fotos (1/5)", { exact: true }).waitFor();
    await fits();
    await shot("novo-produto-390");
    await page
      .getByRole("button", { name: "Salvar produto e estoque", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvar produto e estoque", exact: true })
      .waitFor({ state: "hidden" });
    assert(calls.some((c) => c.p_action === "product_save"));
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByText("Configurar", { exact: true }).click();
      await fits();
      await shot("gestao-" + width);
      await page.getByText("Produtos", { exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: public catalog, mobile/desktop layout, anonymous cart retained on login, delivery/consent/server total, querystring cannot approve payment, explicit provider reconciliation, pending cancellation, admin partner commission, SKU/cost/stock editing. Mocked backend only. Screenshots: " +
        out,
    );
    await ctx.close();
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
