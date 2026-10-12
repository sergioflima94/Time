const fs = require("node:fs"),
  Module = require("node:module"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const old = Module._extensions[".ts"];
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
const vars = {
  EVOLUTION_API_URL: "https://synthetic-evolution.invalid",
  EVOLUTION_API_KEY: "synthetic",
  EVOLUTION_API_INSTANCE: "synthetic-instance",
  EVOLUTION_GO_URL: "https://synthetic-go.invalid",
  EVOLUTION_GO_API_KEY: "synthetic",
};
global.Deno = { env: { get: (k) => vars[k] } };
const {
  sendWhatsAppText,
  evolutionRequest,
} = require("../supabase/functions/_shared/whatsappProviders.ts");
async function run() {
  try {
    let calls = [];
    const f = async (u, o) => {
      calls.push({ u, o });
      return Response.json({ key: { id: "synthetic-accepted" } });
    };
    let r = await sendWhatsAppText(
      "11999998877",
      "Test only",
      "synthetic",
      "evolution_api",
      "owned-instance",
      f,
    );
    assert.equal(r.provider, "evolution_api");
    assert(calls[0].u.endsWith("/message/sendText/owned-instance"));
    assert.equal(JSON.parse(calls[0].o.body).number, "5511999998877");
    assert.equal(calls[0].o.headers.apikey, "synthetic");
    assert(!calls[0].o.body.includes("synthetic-accepted"));
    calls = [];
    r = await sendWhatsAppText(
      "11999998877",
      "Test only",
      "synthetic",
      "automatic",
      null,
      async (u) => {
        calls.push(u);
        throw Error("timeout");
      },
    );
    assert.equal(r.uncertain, true);
    assert.equal(calls.length, 1);
    const q = await evolutionRequest(
      "/instance/connect/owned-instance",
      undefined,
      async (u) => {
        assert(u.endsWith("/instance/connect/owned-instance"));
        return Response.json({ code: "synthetic-qr" });
      },
    );
    assert.equal(q.payload.code, "synthetic-qr");
    vars.EVOLUTION_API_URL = "http://unsafe.invalid";
    assert.equal(
      (
        await sendWhatsAppText(
          "11999998877",
          "Test only",
          "synthetic",
          "evolution_api",
          null,
          f,
        )
      ).ok,
      false,
    );
    console.log(
      "PASS: Evolution API v2 route/auth/number, instance connection, explicit provider, no duplicate Go fallback after timeout, HTTPS-only config. Synthetic HTTP, no real message.",
    );
  } finally {
    if (old) Module._extensions[".ts"] = old;
    else delete Module._extensions[".ts"];
    delete global.Deno;
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
