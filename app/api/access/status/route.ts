import { NextResponse } from "next/server";
import { authenticatedUser } from "../../../../lib/server-auth";

function transferHasExpired(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false;
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59).getTime() <= Date.now();
}

export async function GET(request: Request) {
  try {
    const identity = await authenticatedUser(request);
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

    if (trialExpired || cancelledExpired || manualExpired) {
      status = "expired";
      await reference.set({
        subscriptionStatus: "expired",
        subscriptionUpdatedAt: new Date(),
      }, { merge: true });
    }

    const allowed = status === "active" || status === "trial";
    return NextResponse.json({ allowed, status }, { status: allowed ? 200 : 403 });
  } catch {
    return NextResponse.json({ allowed: false, status: "unauthenticated" }, { status: 401 });
  }
}
