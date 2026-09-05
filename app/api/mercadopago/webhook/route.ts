import { NextResponse } from "next/server";
import { mercadoPago, validWebhookSignature } from "../../../../lib/mercadopago";

type MpSubscription = { id: string; status: string; external_reference?: string; payer_email?: string; next_payment_date?: string; payer_id?: number };
type MpPayment = { preapproval_id?: string; status?: string };

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
        const mapped = subscription.status === "authorized" ? "trial" : subscription.status === "paused" ? "suspended" : ["cancelled", "canceled"].includes(subscription.status) ? "expired" : "pending";
        await getAdminDb().collection("users").doc(uid).set({
          plan: "large_animals",
          subscriptionStatus: mapped,
          mercadoPagoPreapprovalId: subscription.id,
          mercadoPagoPayerId: subscription.payer_id || null,
          subscriptionEndsAtIso: subscription.next_payment_date || null,
          subscriptionUpdatedAt: new Date(),
        }, { merge: true });
      }
    }
    if (type === "subscription_authorized_payment") {
      const payment = await mercadoPago(`/authorized_payments/${encodeURIComponent(dataId)}`) as MpPayment;
      if (payment.preapproval_id && payment.status === "approved") {
        const matches = await getAdminDb().collection("users").where("mercadoPagoPreapprovalId", "==", payment.preapproval_id).limit(1).get();
        if (!matches.empty) await matches.docs[0].ref.set({ subscriptionStatus: "active", lastPaymentApprovedAt: new Date(), subscriptionUpdatedAt: new Date() }, { merge: true });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No se pudo procesar" }, { status: 500 });
  }
}
