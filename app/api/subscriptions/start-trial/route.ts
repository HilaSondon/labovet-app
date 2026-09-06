import { NextResponse } from "next/server";
import { authenticatedUser } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const identity = await authenticatedUser(request);
    if (!identity.email_verified) return NextResponse.json({ error: "Correo no verificado" }, { status: 403 });
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const reference = getAdminDb().collection("users").doc(identity.uid);
    const snapshot = await reference.get();
    const profile = snapshot.data();
    if (!profile || profile.role !== "veterinarian") return NextResponse.json({ error: "Cuenta no habilitada" }, { status: 403 });
    if (profile.trialStartedAtIso) return NextResponse.json({ profile });
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const updates = {
      plan: "large_animals",
      subscriptionStatus: "trial",
      trialStartedAtIso: startedAt.toISOString(),
      subscriptionEndsAtIso: endsAt.toISOString(),
      subscriptionUpdatedAt: new Date(),
    };
    await reference.set(updates, { merge: true });
    return NextResponse.json({ profile: updates });
  } catch {
    return NextResponse.json({ error: "No pudimos iniciar la prueba" }, { status: 401 });
  }
}
