import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";

export async function GET(request: Request) {
  try {
    const uid = await authenticatedUid(request);
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const profile = (await db.collection("users").doc(uid).get()).data();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Sin autorización" }, { status: 403 });
    const snapshot = await db.collection("analyticsDaily").get();
    const days = snapshot.docs.map((doc) => ({
      date: doc.id,
      visits: Number(doc.data().visits || 0),
      uniqueVisitors: Number(doc.data().uniqueVisitors || 0),
    })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return NextResponse.json({ days, today });
  } catch {
    return NextResponse.json({ error: "Sin autorización" }, { status: 401 });
  }
}
