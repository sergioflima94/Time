// Handler boundary tests; synthetic identity/client and no external network.
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const ext = Module._extensions[".ts"],
  load = Module._load,
  oldDeno = global.Deno,
  oldFetch = global.fetch;
let handler,
  provider = "mercado_pago",
  calls = [];
const env = {
  SUPABASE_URL: "https://synthetic.test.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-only",
  INVOICE_JOB_SECRET: "synthetic-job-token-only",
};
const db = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "synthetic-actor" } },
      error: null,
    }),
  },
  rpc: async (fn, b) => {
    calls.push([fn, b]);
    return {
      data:
        b.p_action === "webhook_context"
          ? {
              provider,
              credentials: { webhookSecret: "synthetic-signature-only" },
            }
          : {},
      error: null,
    };
  },
};
Module._extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    f,
  );
Module._load = function (n, ...rest) {
  return n === "npm:@supabase/supabase-js@2"
    ? { createClient: () => db }
    : load.call(this, n, ...rest);
};
global.Deno = {
  env: { get: (k) => env[k] },
  serve: (h) => {
    handler = h;
  },
};
global.fetch = async () => {
  throw Error("Forbidden real provider access in handler test");
};
const req = (url, body, headers = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
async function run() {
  try {
    require(path.resolve("supabase/functions/invoice-payment/index.ts"));
    assert.equal(
      (
        await handler(
          req("https://synthetic.test.invalid/invoice-payment", {
            action: "checkout",
          }),
        )
      ).status,
      401,
    );
    assert.equal(calls.length, 0);
    assert.equal(
      (
        await handler(
          req(
            "https://synthetic.test.invalid/invoice-payment",
            { action: "checkout" },
            { authorization: "Bearer synthetic" },
          ),
        )
      ).status,
      409,
    );
    assert(
      !calls.some(([, b]) => b.p_action === "prepare"),
      "disabled flag must not claim debt",
    );
    require(path.resolve("supabase/functions/invoice-webhook/index.ts"));
    calls = [];
    const url =
      "https://synthetic.test.invalid/invoice-webhook/00000000-0000-4000-8000-000000000001?data.id=123";
    assert.equal(
      (await handler(req(url, { type: "payment", data: { id: "123" } })))
        .status,
      401,
    );
    assert(!calls.some(([, b]) => b.p_action === "settle"));
    provider = "picpay";
    assert.equal((await handler(req(url, {}))).status, 401);
    assert(!calls.some(([, b]) => b.p_action === "settle"));
    require(path.resolve("supabase/functions/invoice-reminders/index.ts"));
    calls = [];
    assert.equal(
      (
        await handler(
          req("https://synthetic.test.invalid/invoice-reminders", {}),
        )
      ).status,
      401,
    );
    assert.equal(calls.length, 0);
    const r = await handler(
      req(
        "https://synthetic.test.invalid/invoice-reminders",
        {},
        { "x-invoice-job": env.INVOICE_JOB_SECRET },
      ),
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).external, "waiting_configuration");
    assert(!calls.some(([, b]) => b.p_action === "claim"));
    console.log(
      "PASS: invoice Edge bearer auth, disabled checkout without claim, unsigned MP/unauthorized PicPay cannot settle, private reminder job auth, missing config does not claim or send. Zero external network.",
    );
  } finally {
    Module._load = load;
    if (ext) Module._extensions[".ts"] = ext;
    else delete Module._extensions[".ts"];
    global.Deno = oldDeno;
    global.fetch = oldFetch;
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
