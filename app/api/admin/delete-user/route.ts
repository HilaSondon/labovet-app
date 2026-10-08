import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const adminUid = await authenticatedUid(request);
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || "");
    const confirmation = String(body.confirmation || "");
    if (!userId || userId === adminUid) {
      return NextResponse.json({ error: "No podés eliminar tu propia cuenta administradora." }, { status: 400 });
    }

    const { getAdminAuth, getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const adminProfile = (await db.collection("users").doc(adminUid).get()).data();
    if (adminProfile?.role !== "admin") {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
    }

    const targetRef = db.collection("users").doc(userId);
    const targetSnapshot = await targetRef.get();
    if (!targetSnapshot.exists) {
      return NextResponse.json({ error: "El usuario seleccionado ya no existe." }, { status: 404 });
    }
    const target = targetSnapshot.data() || {};
    if (target.role === "admin") {
      return NextResponse.json({ error: "Las cuentas administradoras no pueden eliminarse desde este panel." }, { status: 400 });
    }
    const expected = String(target.username || target.email || "");
    if (!expected || confirmation !== expected) {
      return NextResponse.json({ error: "La confirmación no coincide con el usuario seleccionado." }, { status: 400 });
    }

    const auth = getAdminAuth();
    await auth.deleteUser(userId);
    await Promise.all([
      db.recursiveDelete(targetRef),
      db.recursiveDelete(db.collection("subscriptionRequests").doc(userId)),
      db.recursiveDelete(db.collection("adminUserRecords").doc(userId)),
    ]);

    return NextResponse.json({ ok: true, deletedUid: userId });
  } catch (error) {
    console.error("No se pudo eliminar el usuario", error);
    return NextResponse.json({ error: "No se pudo eliminar el usuario completo." }, { status: 500 });
  }
}
