import { createClient } from "npm:@supabase/supabase-js@2";
import {
  sendWhatsAppText,
  whatsAppConfigured,
} from "../_shared/whatsappProviders.ts";
import { loadWhatsAppSettings } from '../_shared/whatsappSettings.ts';
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método inválido." }, 405);
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return reply({ error: "Entre na conta." }, 401);
  const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    ),
    { data: auth, error } = await db.auth.getUser(token);
  if (error || !auth.user) return reply({ error: "Sessão inválida." }, 401);
  try {
    const b = await req.json();
    const call = async (action: string, data: Record<string, unknown>) => {
      const { data: r, error } = await db.rpc("phone_ownership_service", {
        p_action: action,
        p_data: { ...data, actor: auth.user!.id },
      });
      if (error)
        throw Error(
          error.message.includes("TELEFONE:")
            ? error.message.split("TELEFONE:")[1].trim()
            : "Verificação indisponível.",
        );
      return r;
    };
    if (b.action === "send") {
      const settings = await loadWhatsAppSettings(db);
      if (
        Deno.env.get("PHONE_VERIFICATION_ENABLED") !== "true" ||
        !whatsAppConfigured(undefined,settings)
      )
        return reply(
          {
            error:
              "Verificação por WhatsApp aguarda configuração do remetente da plataforma.",
          },
          409,
        );
      if (b.consent !== true)
        return reply(
          { error: "Autorize receber o código no número informado." },
          400,
        );
      const phone = String(b.phone ?? "").replace(/\D/g, "");
      if (!/^55\d{10,11}$/.test(phone))
        return reply({ error: "Use DDI 55 + DDD + número." }, 400);
      const bytes = new Uint32Array(1);
      let n: number;
      do {
        crypto.getRandomValues(bytes);
        n = bytes[0];
      } while (n >= 4294000000);
      const code = String(n % 1000000).padStart(6, "0"),
        id = crypto.randomUUID(),
        salt = crypto.randomUUID();
      await call("create", {
        phone,
        id,
        salt,
        hash: await hash(salt + ":" + code),
      });
      const sent = await sendWhatsAppText(
        phone,
        `MarcouJogou: código de verificação ${code}. Expira em 5 minutos. Nunca compartilhe este código. Se não pediu, ignore.`,
        id,
        'automatic',undefined,fetch,settings,
      );
      return reply({
        id,
        message: sent.ok
          ? "Código aceito pelo provedor. Confira o WhatsApp; entrega não comprovada."
          : sent.uncertain
            ? "Envio inconclusivo. Se o código chegar, pode validar; não foi reenviado."
            : "Provedor não aceitou o envio. Aguarde antes de tentar novamente.",
      });
    }
    if (b.action !== "verify" || !/^\d{6}$/.test(String(b.code ?? "")))
      return reply({ error: "Informe o código de seis dígitos." }, 400);
    const ctx = await call("context", { id: b.id });
    if (!ctx.salt)
      return reply({ error: "Código expirado ou indisponível." }, 400);
    const verified = await call("verify", {
      id: b.id,
      hash: await hash(ctx.salt + ":" + b.code),
    });
    if (!verified.valid)
      return reply({ error: "Código incorreto ou expirado." }, 400);
    if (!verified.completed) {
      const { data: changed, error } = await db.auth.admin.updateUserById(
        auth.user.id,
        { phone: verified.phone, phone_confirm: true },
      );
      if (
        error ||
        changed.user?.id !== auth.user.id ||
        changed.user?.phone !== verified.phone
      )
        return reply(
          {
            error:
              "Não foi possível vincular o telefone. Nenhuma outra conta foi alterada.",
          },
          409,
        );
      await call("complete", { id: b.id });
    }
    return reply({
      message:
        "Telefone confirmado para sua conta. Lembretes continuam dependendo da sua autorização.",
    });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : "Verificação indisponível." },
      409,
    );
  }
});
