// Production bundle, isolated fake backend. Never sends real invites or payments.
const { chromium } = require("playwright-core"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const base = process.env.TEST_URL || "http://localhost:19019",
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uid = id(1),
  pid = id(2),
  venue = id(3),
  field = id(4),
  program = id(5),
  now = new Date().toISOString();
const user = {
  id: uid,
  aud: "authenticated",
  role: "authenticated",
  email: "venue@test.invalid",
  app_metadata: {},
  user_metadata: { name: "Teste operação" },
  identities: [],
  created_at: now,
};
const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test-signature`;
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
  name: "Teste operação",
  nickname: null,
  phone: null,
  avatar_url: null,
  preferred_position: "line",
  favorite_sports: ["volei"],
  is_guest: false,
  created_at: now,
};
let owner = true,
  deny = false,
  denyVenue = false,
  actions = [],
  bills = [],
  seats = [];
const sessions = [1, 2].map((n) => ({
  id: id(10 + n),
  program_id: program,
  starts_at: new Date(Date.now() + (10 + n) * 86400000).toISOString(),
  ends_at: new Date(Date.now() + (10 + n) * 86400000 + 3600000).toISOString(),
  status: "open",
  occupied: 0,
}));
const cp = {
  id: program,
  establishment_id: venue,
  name: "Vôlei • turma iniciante",
  sport_id: "volei",
  format: "group",
  field_id: field,
  coach_id: id(6),
  level: "Iniciante",
  capacity: 10,
  duration_minutes: 60,
  active: true,
  monthly_cents: 18000,
  drop_in_cents: 3500,
  swaps_enabled: true,
  makeups_enabled: true,
  cutoff_hours: 12,
  makeup_days: 30,
  can_manage: true,
  can_price: true,
  venue_name: "Arena da Resenha",
  coach_name: "Professora Ana",
  sessions,
};
async function run() {
  const out = path.resolve(".test-runtime/venue-academy-prints");
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
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (/Refused to|violates.*Content Security Policy/i.test(msg.text()))
        errors.push(msg.text());
    });
    await ctx.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await ctx.route("https://*.supabase.co/**", async (route) => {
      const url = new URL(route.request().url()),
        body = route.request().postData() ? route.request().postDataJSON() : {};
      let json = [],
        status = 200;
      if (url.pathname.endsWith("/token")) json = session;
      else if (url.pathname.endsWith("/user")) json = user;
      else if (url.pathname.endsWith("/players"))
        json = url.searchParams.has("auth_user_id") ? player : [player];
      else if (url.pathname.endsWith("/player_profiles_snapshot")) json = [player];
      else if (url.pathname.endsWith("/platform_configuration"))
        json = {
          settings: { discoveryEnabled: true, sponsoredEnabled: false },
        };
      else if (url.pathname.endsWith("/commercial_access_snapshot"))
        json = { role: null, licenses: [], agreements: [] };
      else if (url.pathname.endsWith("/academy_snapshot")) {
        if (deny) {
          status = 403;
          json = { message: "OPERAÇÃO: Sem acesso." };
        } else
          json = {
            programs: [{ ...cp, can_manage: owner, can_price: owner }],
            bills,
            seats,
            swaps: [],
            credits: [],
            notices: [],
          };
      } else if (
        url.pathname.endsWith("/venue_snapshot") &&
        denyVenue &&
        body.p_venue
      ) {
        status = 403;
        json = { message: "OPERAÇÃO: Sem acesso ao PDV." };
      } else if (url.pathname.endsWith("/venue_snapshot"))
        json = body.p_venue
          ? {
              id: venue,
              me: pid,
              name: "Arena da Resenha",
              owner,
              server_time: new Date().toISOString(),
              capabilities: owner
                ? [
                    "pdv",
                    "live",
                    "reservations",
                    "cash",
                    "classes",
                    "class_prices",
                    "reports",
                    "kitchen",
                  ]
                : [],
              fields: [{ id: field, name: "Quadra híbrida" }],
              coaches: [
                { id: id(6), name: "Professora Ana", player_id: id(7) },
              ],
              staff: [
                {
                  player_id: id(7),
                  name: "Ana",
                  active: true,
                  roles: ["coach"],
                  capabilities: ["own_classes", "class_prices"],
                },
              ],
              teams: [
                {
                  id: id(8),
                  name: "Resenha FC",
                  players: [{ id: pid, name: "Sérgio" }],
                },
              ],
              occupancy: [
                {
                  id: id(9),
                  field_id: field,
                  label: "Resenha FC",
                  starts_at: now,
                  ends_at: new Date(Date.now() + 18 * 60000).toISOString(),
                  ended_at: null,
                },
              ],
              bookings: [],
              incidents: [],
              shifts: [],
              audit: [],
              kitchen: [],
              open_tabs: 3,
              kitchen_orders: 2,
              ...(owner
                ? { food_received_cents: 6400, classes_cash_cents: 18000 }
                : {}),
            }
          : { venues: [{ id: venue, name: "Arena da Resenha", owner }] };
      else if (url.pathname.endsWith("/academy_action")) {
        actions.push(body);
        json = { id: id(30 + actions.length), count: 8 };
        if (body.p_action === "program_save") {
          cp.monthly_cents = body.p_data.monthlyCents;
          cp.drop_in_cents = body.p_data.dropInCents;
        }
        if (body.p_action === "enroll") {
          bills = [
            {
              id: id(40),
              program_id: program,
              player_id: pid,
              plan: body.p_data.plan,
              competence: now.slice(0, 7) + "-01",
              amount_cents: cp.monthly_cents,
              status: "pending",
              name: player.name,
            },
          ];
          seats = sessions.map((s) => ({
            id: id(50 + Number(s.id.slice(-2))),
            bill_id: id(40),
            session_id: s.id,
            program_id: program,
            player_id: pid,
            name: player.name,
            active: true,
            revision: 0,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            attendance: null,
          }));
        }
      } else if (url.pathname.endsWith("/venue_action")) {
        actions.push(body);
        json = { id: id(41) };
        if (body.p_action === "tab_open")
          json = {
            tab: {
              id: id(42),
              establishment_id: venue,
              label: "C-TESTE",
              customer_player_id: body.p_data.playerId ?? null,
              customer_name: body.p_data.name || "Sérgio",
              table_label: "Mesa 3",
              game_id: null,
              status: "open",
              opened_by_player_id: pid,
              opened_at: now,
              closed_at: null,
            },
            participant: {
              id: id(43),
              tab_id: id(42),
              player_id: null,
              name: body.p_data.name,
            },
            inviteId: null,
          };
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
      page.getByText(label, { exact: true }).locator("..").locator("input");
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
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByRole('checkbox',{name:'Aceito os termos e as regras da comunidade',exact:true}).click();await page.getByRole('button',{name:'Aceitar e continuar',exact:true}).click();
    await page.waitForURL(base + "/");
    await page.goto(base + `/operacao/aulas?establishmentId=${venue}`);
    await page.getByText(cp.name, { exact: true }).waitFor();
    await fits();
    await page
      .getByRole("button", { name: "Editar mensalidade e avulsa" })
      .click();
    await input("Mensalidade (R$)").fill("195,00");
    await input("Avulsa (R$)").fill("40,00");
    await page.getByRole("button", { name: "Salvar novos preços" }).click();
    await page
      .getByText("Mensal R$ 195,00 · Avulsa R$ 40,00", { exact: true })
      .waitFor();
    assert.equal(
      actions.find((x) => x.p_action === "program_save").p_data.monthlyCents,
      19500,
    );
    await page
      .getByRole("button", { name: "Publicar agenda recorrente" })
      .click();
    await input("Primeiro dia (AAAA-MM-DD)").fill(now.slice(0, 10));
    await input("Último dia (AAAA-MM-DD)").fill(
      new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10),
    );
    await fits();
    await shot("aulas-precos-recorrencia-mobile");
    await page
      .getByRole("button", { name: "Verificar agenda e publicar" })
      .click();
    await page
      .getByText("8 horários publicados; duplicados ignorados.")
      .waitFor();
    assert.equal(
      actions.find((x) => x.p_action === "publish").p_data.slots.length,
      2,
    );
    await page.goto(base + `/operacao/comandas?establishmentId=${venue}`);
    await page
      .getByRole("button", { name: "Resenha FC", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Resenha FC", exact: true }).click();
    await page.getByRole("button", { name: "Sérgio", exact: true }).waitFor();
    await fits();
    await shot("pdv-time-mobile");
    await page
      .getByRole("button", { name: "Cliente avulso", exact: true })
      .click();
    await input("Nome do cliente").fill("Cliente teste");
    await input("Ou e-mail").fill("cliente@test.invalid");
    await input("Mesa ou referência").fill("Mesa 3");
    await page
      .getByRole("button", { name: "Abrir comanda", exact: true })
      .click();
    await page.getByText("Comanda aberta.", { exact: true }).waitFor();
    assert.equal(
      actions.find((x) => x.p_action === "tab_open").p_data.consent,
      false,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await fits();
    await shot("pdv-lateral-desktop");
    await page
      .getByRole("button", { name: "Ir para pedidos da comanda aberta" })
      .click();
    await page
      .getByText(
        "Comanda indisponível ou sem permissão. Atualize seu acesso.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.getByText("Cliente teste", { exact: true }).count(),
      0,
      "cached tab must not bypass server read permission",
    );
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await page.getByText("C-TESTE · Cliente teste", { exact: true }).waitFor();
    denyVenue = true;
    await page.getByRole("button", { name: "Atualizar times" }).click();
    await page.getByText("Sem acesso ao PDV.", { exact: true }).waitFor();
    assert.equal(
      await page.getByText("C-TESTE · Cliente teste", { exact: true }).count(),
      0,
    );
    denyVenue = false;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + `/operacao/ao-vivo?establishmentId=${venue}`);
    await page
      .getByText("Recebimentos registrados hoje", { exact: true })
      .waitFor();
    await fits();
    await shot("operacao-ao-vivo-mobile");
    // Follow the actual shortcuts flagged by Play review; direct page.goto()
    // alone never proves that a touch target navigates or survives returning.
    const shortcuts = [
      ['PDV / comandas', 'comandas', 'PDV · Arena da Resenha'],
      ['Aulas', 'aulas', 'Aulas e professores'],
      ['Caixa e receitas', 'caixa', 'Caixa · Arena da Resenha'],
      ['Cozinha e bar', 'cozinha', 'Cozinha e bar'],
      ['Equipe e permissões', 'equipe', 'Equipe e permissões'],
    ];
    for (let round = 0; round < 2; round++) {
      for (const [label, destination, heading] of shortcuts) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await page.waitForURL(url => url.pathname === `/operacao/${destination}` && url.searchParams.get('establishmentId') === venue);
        await page.getByText(heading, { exact: true }).last().waitFor();
        await page.getByRole('button', { name: 'Voltar', exact: true }).click();
        await page.getByText('Operação ao vivo', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'PDV / comandas', exact: true }).waitFor();
      }
    }
    await page.goto(base + `/operacao/equipe?establishmentId=${venue}`);
    await page.getByText("Equipe e permissões", { exact: true }).waitFor();
    await input("E-mail confirmado do funcionário / sócio").fill(
      "professora@test.invalid",
    );
    await fits();
    await shot("equipe-permissoes-mobile");
    owner = false;
    await page.goto(base + "/aulas");
    await page.getByText(cp.name, { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Editar mensalidade e avulsa" })
        .count(),
      0,
    );
    await page
      .getByRole("button", { name: "Reservar mensal", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Confirmar reserva e cobrança pendente" })
      .click();
    await page
      .getByText("Sua vaga está reservada.", { exact: true })
      .first()
      .waitFor();
    assert.equal(bills.length, 1);
    await fits();
    await shot("aluno-mensalidade-troca-mobile");
    await page.setViewportSize({ width: 320, height: 760 });
    await fits();
    deny = true;
    await page.getByRole("button", { name: "Atualizar aulas" }).click();
    await page.getByText("Sem acesso.", { exact: true }).waitFor();
    assert.equal(await page.getByText(cp.name, { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: mobile/desktop/320px, mensal/avulsa, recorrência 2x/semana, PDV time/avulso, painel/cronômetro, permissões, aluno mensal sem duplicação e limpeza após perda de acesso. Backend interceptado. Prints: " +
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
