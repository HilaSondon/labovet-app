import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { initializeFirestore, type Firestore } from "firebase-admin/firestore";

function serviceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 no configurado");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function adminApp() { return getApps()[0] || initializeApp({ credential: cert(serviceAccount()) }); }
export const getAdminAuth = () => getAuth(adminApp());
let firestore: Firestore | undefined;
export const getAdminDb = () => firestore || (firestore = initializeFirestore(adminApp(), { preferRest: true }));
