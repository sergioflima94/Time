import { createClient } from "npm:@supabase/supabase-js@2";
import { sameWebhookSecret } from "../_shared/shopGateway.ts";
Deno.serve(async (req) => {
  if (
    req.method !== "POST" ||
    !(await sameWebhookSecret(
      req.headers.get("x-invoice-job") ?? "",
      Deno.env.get("INVOICE_JOB_SECRET") ?? "",
    ))
  )
    return new Response("Unauthorized", { status: 401 });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const call = async (action: string, data: Record<string, unknown> = {}) => {
    const { data: r, error } = await db.rpc("credit_reminder_service", {
      p_action: action,
      p_data: data,
    });
    if (error) throw new Error("Reminder service unavailable");
    return r;
  };
  try {
    await call("generate");
    const enabled = Deno.env.get("INVOICE_MESSAGES_ENABLED") === "true",
      emailKey = Deno.env.get("RESEND_API_KEY"),
      from = Deno.env.get("VENUE_INVITE_FROM"),
      waUrl = Deno.env.get("EVOLUTION_GO_URL")?.replace(/\/$/, ""),
      waKey = Deno.env.get("EVOLUTION_GO_API_KEY");
    // Don't claim an outbox batch when provider configuration is unavailable.
    const channels = [
      ...(emailKey && from ? ["email"] : []),
      ...(waUrl?.startsWith("https://") && waKey ? ["whatsapp"] : []),
    ];
    if (!enabled || !channels.length)
      return Response.json({
        generated: true,
        external: "waiting_configuration",
      });
    let accepted = 0;
    for (let n = 0; n < 20; n++) {
      const r = await call("claim", { channels });
      if (r.skipped) continue;
      if (!r.id) break;
      try {
        const text =
          "Você tem um aviso privado de fatura no MarcouJogou. Entre na sua conta para consultar saldo e vencimento: https://app.marcoujogou.com.br/faturas\nOs lembretes podem ser desativados em Minhas faturas.";
        const email = r.channel === "email";
        const response = await fetch(
          email ? "https://api.resend.com/emails" : `${waUrl}/send/text`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(15000),
            headers: email
              ? {
                  Authorization: `Bearer ${emailKey}`,
                  "Content-Type": "application/json",
                  "Idempotency-Key": `invoice-reminder/${r.id}`,
                }
              : { apikey: waKey!, "Content-Type": "application/json" },
            body: JSON.stringify(
              email
                ? {
                    from,
                    to: [r.email],
                    subject: "Aviso privado de fatura · MarcouJogou",
                    text,
                  }
                : {
                    number: r.phone,
                    text,
                    id: r.id,
                    delay: 500,
                    formatJid: true,
                  },
            ),
          },
        );
        if (!response.ok) {
          await call(response.status >= 500 ? "uncertain" : "failed", {
            id: r.id,
          });
          continue;
        }
        const data = await response.json(),
          providerId = email
            ? data.id
            : (data.id ?? data.key?.id ?? data.messageId);
        if (!providerId) {
          await call("uncertain", { id: r.id });
          continue;
        }
        await call("accepted", { id: r.id, providerId: String(providerId) });
        accepted++;
      } catch {
        await call("uncertain", { id: r.id });
      }
    }
    return Response.json({
      accepted,
      message: "Aceite no provedor não comprova entrega.",
    });
  } catch {
    return Response.json(
      { error: "Não foi possível processar os lembretes." },
      { status: 503 },
    );
  }
});
