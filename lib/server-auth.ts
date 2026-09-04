import { getAdminAuth } from "./firebase-admin";

export async function authenticatedUid(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  return (await getAdminAuth().verifyIdToken(header.slice(7))).uid;
}

export async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  return getAdminAuth().verifyIdToken(header.slice(7));
}
