import { NextResponse } from "next/server";
import { mercadoPago } from "../../../../lib/mercadopago";

type MpSubscription = { status: string; next_payment_date?: string };
type MpInvoice = {
  status?: string;
  summarized?: string;
  retry_attempt?: number;
  date_created?: string;
  last_modified?: string;
  debit_date?: string;
  payment?: { id?: number; status?: string; status_detail?: string };
};

const invoiceTime = (invoice: MpInvoice) =>
  new Date(invoice.last_modified || invoice.date_created || invoice.debit_date || 0).getTime();

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Acceso no autorizado" }, { status: 401 });
  }
  try {
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const snapshot = await db.collection("users").where("paymentMethod", "==", "mercadopago").get();
    let updated = 0;
    for (const document of snapshot.docs) {
      const current = document.data();
      if (!current.mercadoPagoPreapprovalId) continue;
      const id = encodeURIComponent(String(current.mercadoPagoPreapprovalId));
      const subscription = await mercadoPago(`/preapproval/${id}`) as MpSubscription;
      const invoices = await mercadoPago(`/authorized_payments/search?preapproval_id=${id}&limit=20`) as { results?: MpInvoice[] };
      const latest = [...(invoices.results || [])].sort((a, b) => invoiceTime(b) - invoiceTime(a))[0];
      const paymentStatus = latest?.payment?.status || latest?.status || latest?.summarized || null;
      const approved = paymentStatus === "approved";
      const rejected = paymentStatus === "rejected" || latest?.status === "recycling";
      const exhausted = latest?.status === "processed" && rejected;
      const canceled = ["canceled", "cancelled"].includes(subscription.status);
      const paused = subscription.status === "paused";
      const retrying = Boolean(latest && !exhausted && !canceled && !paused && (rejected || latest.status === "waiting for gateway"));
      let status = canceled ? "expired" : paused ? "suspended" : retrying ? "payment_retry" : exhausted ? "suspended" : approved ? "active" : current.subscriptionStatus || "pending";
      const graceEndsAt = retrying
        ? current.paymentGraceEndsAtIso || new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
        : null;
      if (status === "payment_retry" && graceEndsAt && new Date(graceEndsAt).getTime() <= Date.now()) status = "suspended";
      await document.ref.set({
        subscriptionStatus: status,
        mercadoPagoStatus: subscription.status,
        subscriptionEndsAtIso: subscription.next_payment_date || current.subscriptionEndsAtIso || null,
        lastPaymentStatus: paymentStatus,
        lastPaymentStatusDetail: latest?.payment?.status_detail || null,
        lastPaymentId: latest?.payment?.id || null,
        lastPaymentAttemptAt: latest ? new Date(latest.last_modified || latest.date_created || Date.now()) : current.lastPaymentAttemptAt || null,
        lastPaymentApprovedAt: approved && latest ? new Date(latest.last_modified || latest.date_created || Date.now()) : current.lastPaymentApprovedAt || null,
        paymentRetryAttempt: latest?.retry_attempt || 0,
        paymentGraceEndsAtIso: graceEndsAt,
        subscriptionUpdatedAt: new Date(),
      }, { merge: true });
      updated += 1;
    }
    return NextResponse.json({ ok: true, checked: snapshot.size, updated });
  } catch (error) {
    console.error("No se pudieron conciliar suscripciones", error);
    return NextResponse.json({ error: "No se pudo completar la conciliación" }, { status: 500 });
  }
}
