import { NextResponse } from "next/server";
import { mercadoPago, validWebhookSignature } from "../../../../lib/mercadopago";

type MpSubscription = { id: string; status: string; external_reference?: string; payer_email?: string; next_payment_date?: string; payer_id?: number };
type MpPayment = {
  preapproval_id?: string;
  status?: string;
  summarized?: string;
  retry_attempt?: number;
  date_created?: string;
  last_modified?: string;
  debit_date?: string;
  payment?: { id?: number; status?: string; status_detail?: string };
};

function graceEnd() {
  return new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "VetConver Mercado Pago webhook" });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const dataId = String(body?.data?.id || url.searchParams.get("data.id") || "");
  const type = String(body?.type || url.searchParams.get("type") || "");
  if (!dataId) return NextResponse.json({ ok: true, ignored: "validation" });
  if (!validWebhookSignature(request, dataId)) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  try {
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    if (type === "subscription_preapproval") {
      const subscription = await mercadoPago(`/preapproval/${encodeURIComponent(dataId)}`) as MpSubscription;
      let uid = subscription.external_reference;
      if (!uid && subscription.payer_email) {
        const byEmail = await getAdminDb()
          .collection("users")
          .where("email", "==", subscription.payer_email.toLowerCase())
          .limit(1)
          .get();
        uid = byEmail.empty ? undefined : byEmail.docs[0].id;
      }
      if (uid) {
        const reference = getAdminDb().collection("users").doc(uid);
        const current = (await reference.get()).data();
        const cancellationHasTime = Boolean(
          current?.subscriptionCancelAtPeriodEnd &&
          current?.subscriptionEndsAtIso &&
          new Date(current.subscriptionEndsAtIso).getTime() > Date.now(),
        );
        const canceled = ["cancelled", "canceled"].includes(subscription.status);
        const mapped = canceled && cancellationHasTime
          ? current?.subscriptionStatus || "active"
          : subscription.status === "authorized" ? "active" : subscription.status === "paused" ? "suspended" : canceled ? "expired" : "pending";
        await reference.set({
          plan: "large_animals",
          subscriptionStatus: mapped,
          mercadoPagoPreapprovalId: subscription.id,
          mercadoPagoPayerId: subscription.payer_id || null,
          subscriptionEndsAtIso: canceled && cancellationHasTime
            ? current?.subscriptionEndsAtIso
            : subscription.next_payment_date || null,
          subscriptionUpdatedAt: new Date(),
          mercadoPagoStatus: subscription.status,
        }, { merge: true });
      }
    }
    if (type === "subscription_authorized_payment") {
      const payment = await mercadoPago(`/authorized_payments/${encodeURIComponent(dataId)}`) as MpPayment;
      if (payment.preapproval_id) {
        const matches = await getAdminDb().collection("users").where("mercadoPagoPreapprovalId", "==", payment.preapproval_id).limit(1).get();
        if (!matches.empty) {
          const reference = matches.docs[0].ref;
          const current = matches.docs[0].data();
          const paymentStatus = payment.payment?.status || payment.status || payment.summarized || "pending";
          const approved = paymentStatus === "approved";
          const rejected = paymentStatus === "rejected" || payment.status === "recycling";
          const retrying = rejected || payment.status === "waiting for gateway";
          const exhausted = payment.status === "processed" && rejected;
          await reference.set({
            subscriptionStatus: approved ? "active" : exhausted ? "suspended" : retrying ? "payment_retry" : current.subscriptionStatus,
            lastPaymentStatus: paymentStatus,
            lastPaymentStatusDetail: payment.payment?.status_detail || null,
            lastPaymentId: payment.payment?.id || null,
            lastPaymentApprovedAt: approved ? new Date(payment.last_modified || payment.date_created || Date.now()) : null,
            lastPaymentAttemptAt: new Date(payment.last_modified || payment.date_created || Date.now()),
            paymentRetryAttempt: payment.retry_attempt || 0,
            paymentGraceEndsAtIso: approved ? null : exhausted ? new Date().toISOString() : retrying ? current.paymentGraceEndsAtIso || graceEnd() : current.paymentGraceEndsAtIso || null,
            subscriptionUpdatedAt: new Date(),
          }, { merge: true });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No se pudo procesar" }, { status: 500 });
  }
}
