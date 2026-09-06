import { NextResponse } from "next/server";
import { authenticatedUser } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const identity = await authenticatedUser(request);
    if (!identity.email_verified) return NextResponse.json({ error: "Verificá tu correo" }, { status: 403 });
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const reference = db.collection("users").doc(identity.uid);
    const profile = (await reference.get()).data();
    if (!profile || profile.role !== "veterinarian") return NextResponse.json({ error: "Cuenta no habilitada" }, { status: 403 });
    await Promise.all([
      reference.set({ paymentMethod: "transfer", subscriptionStatus: "pending", subscriptionEndsAtIso: null, subscriptionUpdatedAt: new Date() }, { merge: true }),
      db.collection("subscriptionRequests").doc(identity.uid).set({
        userId: identity.uid,
        name: profile.name || "Usuario",
        email: profile.email || identity.email || "",
        plan: "large_animals",
        paymentMethod: "transfer",
        status: "pending",
        requestedAt: new Date(),
      }, { merge: true }),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No pudimos registrar la solicitud" }, { status: 401 });
  }
}
