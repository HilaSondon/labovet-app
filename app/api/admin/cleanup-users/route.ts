import { NextResponse } from "next/server";
import { authenticatedUid } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  try {
    const uid = await authenticatedUid(request);
    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== "BORRAR USUARIOS") {
      return NextResponse.json({ error: "Confirmación incorrecta" }, { status: 400 });
    }

    const { getAdminAuth, getAdminDb } = await import("../../../../lib/firebase-admin");
    const db = getAdminDb();
    const profile = (await db.collection("users").doc(uid).get()).data();
    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
    }

    const auth = getAdminAuth();
    const authUids: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await auth.listUsers(1000, pageToken);
      authUids.push(...page.users.map((user) => user.uid).filter((userUid) => userUid !== uid));
      pageToken = page.pageToken;
    } while (pageToken);

    const profiles = await db.collection("users").get();
    const profileRefs = profiles.docs.filter((item) => item.id !== uid).map((item) => item.ref);
    const requests = await db.collection("subscriptionRequests").get();

    await Promise.all([
      ...profileRefs.map((reference) => db.recursiveDelete(reference)),
      ...requests.docs.filter((item) => item.id !== uid).map((item) => db.recursiveDelete(item.ref)),
    ]);

    for (let index = 0; index < authUids.length; index += 1000) {
      await auth.deleteUsers(authUids.slice(index, index + 1000));
    }

    return NextResponse.json({
      ok: true,
      deletedAuthenticationUsers: authUids.length,
      deletedProfiles: profileRefs.length,
      preservedUid: uid,
    });
  } catch (error) {
    console.error("No se pudieron limpiar los usuarios", error);
    return NextResponse.json({ error: "No se pudieron borrar los usuarios" }, { status: 500 });
  }
}
