import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore/lite";
import { db } from "./firebase";

export type LaboratoryModule =
  | "samples" | "veterinarians" | "clients" | "prices" | "qualityManual" | "procedures"
  | "records" | "reagents" | "equipment" | "audits" | "nonconformities" | "priceSettings" | "quickAccess";

export type LaboratoryManagementRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: string | number | boolean;
};

const collectionName = (module: LaboratoryModule) => module === "veterinarians" ? "labVeterinarians" : `lab-${module}`;
const moduleCollection = (uid: string, module: LaboratoryModule) => collection(db, "users", uid, collectionName(module));

const CACHE_TTL = 30 * 60 * 1000;
const inFlight = new Map<string, Promise<LaboratoryManagementRecord[]>>();
const cacheKey = (uid: string, module: LaboratoryModule) => `labovet:lab:${uid}:${module}`;

function readCache(uid: string, module: LaboratoryModule) {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey(uid, module)) || "null") as
      | { savedAt: number; data: LaboratoryManagementRecord[] }
      | null;
    return cached && Date.now() - cached.savedAt < CACHE_TTL ? cached.data : null;
  } catch { return null; }
}

function writeCache(uid: string, module: LaboratoryModule, data: LaboratoryManagementRecord[]) {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(cacheKey(uid, module), JSON.stringify({ savedAt: Date.now(), data })); } catch { /* storage lleno: Firebase sigue funcionando */ }
}

export async function loadLaboratoryModule(uid: string, module: LaboratoryModule) {
  const cached = readCache(uid, module);
  if (cached) return cached;
  const key = cacheKey(uid, module);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = getDocs(moduleCollection(uid, module)).then((snapshot) => {
    const data = snapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }) as LaboratoryManagementRecord)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    writeCache(uid, module, data);
    return data;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

export async function saveLaboratoryRecord(uid: string, module: LaboratoryModule, record: LaboratoryManagementRecord) {
  await setDoc(doc(moduleCollection(uid, module), record.id), record);
  const cached = readCache(uid, module);
  if (cached) writeCache(uid, module, [record, ...cached.filter((item) => item.id !== record.id)]);
}

export async function saveLaboratoryRecords(uid: string, module: LaboratoryModule, records: LaboratoryManagementRecord[]) {
  for (let start = 0; start < records.length; start += 100) {
    await Promise.all(records.slice(start, start + 100).map((record) => saveLaboratoryRecord(uid, module, record)));
  }
}

export async function deleteLaboratoryRecord(uid: string, module: LaboratoryModule, id: string) {
  await deleteDoc(doc(moduleCollection(uid, module), id));
  const cached = readCache(uid, module);
  if (cached) writeCache(uid, module, cached.filter((item) => item.id !== id));
}
