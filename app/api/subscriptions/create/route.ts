import { NextResponse } from "next/server";
import { authenticatedUser } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const identity = await authenticatedUser(request);
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const uid = identity.uid;
    if (!identity.email_verified) return NextResponse.json({ error: "Verificá tu correo antes de continuar" }, { status: 403 });
    const user = await getAdminDb().collection("users").doc(uid).get();
    const profile = user.data();
    if (!profile || profile.role !== "veterinarian") return NextResponse.json({ error: "Cuenta no habilitada" }, { status: 403 });
    if (profile.mercadoPagoPreapprovalId && ["pending", "trial", "active"].includes(profile.subscriptionStatus)) return NextResponse.json({ error: "Ya existe una suscripción para esta cuenta" }, { status: 409 });
    const checkoutUrl =
      process.env.MERCADOPAGO_SUBSCRIPTION_URL || "https://mpago.la/2s8oDCv";
    await user.ref.set(
      { paymentMethod: "mercadopago", subscriptionUpdatedAt: new Date() },
      { merge: true },
    );
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "No pudimos iniciar la suscripción." }, { status: 500 });
  }
}
