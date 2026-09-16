import { NextResponse } from "next/server";
import { authenticatedUser } from "../../../../lib/server-auth";

function transferHasExpired(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).getTime() <= Date.now();
}

export async function GET(request: Request) {
  let identity;
  try {
    identity = await authenticatedUser(request);
  } catch {
    return NextResponse.json({ allowed: false, error: "Sesión no válida." }, { status: 401 });
  }

  try {
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const reference = getAdminDb().collection("users").doc(identity.uid);
    const snapshot = await reference.get();
    const profile = snapshot.data();
    if (!profile) return NextResponse.json({ allowed: false, status: "pending" }, { status: 403 });

    if (profile.role === "admin") {
      return NextResponse.json({ allowed: true, status: "active", role: "admin" });
    }

    if (!identity.email_verified) {
      return NextResponse.json({ allowed: false, status: "unverified" }, { status: 403 });
    }

    let status = String(profile.subscriptionStatus || "pending");
    const trialExpired = status === "trial" &&
      typeof profile.subscriptionEndsAtIso === "string" &&
      new Date(profile.subscriptionEndsAtIso).getTime() <= Date.now();
    const cancelledExpired = Boolean(profile.subscriptionCancelAtPeriodEnd) &&
      typeof profile.subscriptionEndsAtIso === "string" &&
      new Date(profile.subscriptionEndsAtIso).getTime() <= Date.now();
    const manualExpired = status === "active" &&
      profile.paymentMethod === "transfer" &&
      transferHasExpired(profile.subscriptionEndsAt);
    const retryExpired = status === "payment_retry" &&
      typeof profile.paymentGraceEndsAtIso === "string" &&
      new Date(profile.paymentGraceEndsAtIso).getTime() <= Date.now();

    if (trialExpired || cancelledExpired || manualExpired || retryExpired) {
      status = "expired";
      await reference.set({
        subscriptionStatus: "expired",
        subscriptionUpdatedAt: new Date(),
      }, { merge: true });
    }

    const allowed = status === "active" || status === "trial" || status === "payment_retry";
    return NextResponse.json({ allowed, status }, { status: allowed ? 200 : 403 });
  } catch (error) {
    console.error("No pudimos consultar el acceso de la cuenta", error);
    return NextResponse.json({ allowed: false, error: "No se pudo consultar el estado de la cuenta." }, { status: 500 });
  }
}
