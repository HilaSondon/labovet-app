import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore, type Firestore } from "firebase-admin/firestore";

function serviceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 no configurado");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function adminApp() {
  if (getApps()[0]) return getApps()[0];
  // Firebase emulators do not need production credentials. Outside the
  // emulator we always require the configured service account, even in dev.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "labovet-e70a2" });
  }
  return initializeApp({ credential: cert(serviceAccount()) });
}
export const getAdminAuth = () => getAuth(adminApp());
let firestore: Firestore | undefined;
export const getAdminDb = () => firestore || (firestore = process.env.FIRESTORE_EMULATOR_HOST
  ? initializeFirestore(adminApp())
  : initializeFirestore(adminApp(), { preferRest: true }));
