import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";

export async function GET(request: Request) {
  try {
    const uid = await authenticatedUid(request);
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const profile = (await db.collection("users").doc(uid).get()).data();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Sin autorización" }, { status: 403 });
    const [snapshot, eventSnapshot, sourceSnapshot] = await Promise.all([
      db.collection("analyticsDaily").get(),
      db.collection("analyticsEventsDaily").get(),
      db.collection("analyticsSourcesDaily").get(),
    ]);
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
    const events: Record<string, number> = {};
    eventSnapshot.docs.forEach((item) => {
      const data = item.data();
      events[String(data.event)] = (events[String(data.event)] || 0) + Number(data.count || 0);
    });
    const sources: Record<string, number> = {};
    sourceSnapshot.docs.forEach((item) => {
      const data = item.data();
      sources[String(data.source)] = (sources[String(data.source)] || 0) + Number(data.count || 0);
    });
    return NextResponse.json({ days, today, events, sources });
  } catch {
    return NextResponse.json({ error: "Sin autorización" }, { status: 401 });
  }
}
