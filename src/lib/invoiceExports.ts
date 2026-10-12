import { Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { CreditInvoice, CreditPayment } from "@/types/customerInvoices";
import { moneyCents } from "./venueOperations";
function csvCell(value: unknown) {
  const raw = String(value ?? ""),
    safe = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function invoiceCsv(invoices: CreditInvoice[]) {
  const rows: unknown[][] = [
    [
      "Fatura",
      "Estabelecimento",
      "Cliente",
      "Corte",
      "Vencimento",
      "Tipo",
      "Descrição",
      "Valor (R$)",
      "Data",
      "Situação",
    ],
  ];
  for (const i of invoices) {
    const common = [
      i.id,
      i.venue_name,
      i.customer_name,
      i.cut_date,
      i.due_date ?? i.cut_date,
    ];
    rows.push([
      ...common,
      "Saldo",
      "Saldo atual",
      (i.balance_cents / 100).toFixed(2).replace(".", ","),
      "",
      i.status,
    ]);
    for (const l of i.lines)
      rows.push([
        ...common,
        "Lançamento",
        l.description,
        (l.amount_cents / 100).toFixed(2).replace(".", ","),
        l.posted_at,
        l.acceptance,
      ]);
    for (const p of i.payments)
      rows.push([
        ...common,
        "Recebimento",
        p.method,
        (p.amount_cents / 100).toFixed(2).replace(".", ","),
        p.paid_at,
        p.reversal ? "Estornado" : (p.confirmation ?? "counter"),
      ]);
    for (const n of i.notes ?? [])
      rows.push([
        ...common,
        "Abatimento",
        n.reason,
        (n.amount_cents / 100).toFixed(2).replace(".", ","),
        n.created_at,
        "Registrado",
      ]);
    for (const p of i.payments)
      for (const r of p.refunds ?? [])
        rows.push([
          ...common,
          "Devolução parcial",
          p.id,
          (r.amount_cents / 100).toFixed(2).replace(".", ","),
          r.created_at,
          "Confirmada pelo provedor",
        ]);
    for (const a of i.agreements ?? [])
      for (const p of a.schedule)
        rows.push([
          ...common,
          "Parcela de acordo",
          `Parcela ${p.number} / ${a.status}`,
          (p.remaining_cents / 100).toFixed(2).replace(".", ","),
          p.due_date,
          a.needs_review ? "Revisão necessária" : a.status,
        ]);
  }
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}
export async function shareInvoiceCsv(content: string) {
  const name = `faturas-marcoujogou-${Date.now()}.csv`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
        new Blob([content], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Compartilhamento indisponível neste aparelho.");
  const file = new File(Paths.cache, name);
  file.create();
  file.write(content);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: "Extrato privado de faturas",
      UTI: "public.comma-separated-values-text",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
export function receiptText(i: CreditInvoice, p: CreditPayment) {
  return [
    "MarcouJogou · Recibo de pagamento (não fiscal)",
    `Recibo: ${p.id}`,
    `Fatura: ${i.id}`,
    `Estabelecimento: ${i.venue_name}`,
    `Cliente: ${i.customer_name}`,
    `Valor: ${moneyCents(p.amount_cents)}`,
    `Data: ${new Date(p.paid_at).toLocaleString("pt-BR")}`,
    `Forma: ${p.method === "online_pix" ? "Pix confirmado pelo provedor" : p.method === "cash" ? "Dinheiro conferido pelo caixa" : "Pix conferido manualmente"}`,
    `Situação: ${p.reversal ? "ESTORNADO · " + p.reversal.reason : "Recebimento registrado"}`,
    ...(p.refunds ?? []).map(
      (r) =>
        `Devolução parcial confirmada: ${moneyCents(r.amount_cents)} · ${new Date(r.created_at).toLocaleString("pt-BR")}`,
    ),
    p.reference ? `Referência: ${p.reference}` : "",
    "Não substitui nota fiscal. Compartilhe apenas com quem precisa destes dados.",
  ]
    .filter(Boolean)
    .join("\n");
}
export async function shareReceipt(i: CreditInvoice, p: CreditPayment) {
  if (Platform.OS === "web") {
    const text = receiptText(i, p);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Recibo MarcouJogou", text });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    const url = URL.createObjectURL(
        new Blob([text], { type: "text/plain;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `recibo-marcoujogou-${p.id}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({
    title: "Recibo MarcouJogou",
    message: receiptText(i, p),
  });
}
