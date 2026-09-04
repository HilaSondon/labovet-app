export async function authenticatedUid(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const { getAdminAuth } = await import("./firebase-admin");
  return (await getAdminAuth().verifyIdToken(header.slice(7))).uid;
}

export async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const { getAdminAuth } = await import("./firebase-admin");
  return getAdminAuth().verifyIdToken(header.slice(7));
}
