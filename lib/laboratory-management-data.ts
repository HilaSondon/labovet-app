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

export async function loadLaboratoryModule(uid: string, module: LaboratoryModule) {
  const snapshot = await getDocs(moduleCollection(uid, module));
  return snapshot.docs
    .map((item) => ({ ...item.data(), id: item.id }) as LaboratoryManagementRecord)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function saveLaboratoryRecord(uid: string, module: LaboratoryModule, record: LaboratoryManagementRecord) {
  await setDoc(doc(moduleCollection(uid, module), record.id), record);
}

export async function saveLaboratoryRecords(uid: string, module: LaboratoryModule, records: LaboratoryManagementRecord[]) {
  for (let start = 0; start < records.length; start += 100) {
    await Promise.all(records.slice(start, start + 100).map((record) => saveLaboratoryRecord(uid, module, record)));
  }
}

export async function deleteLaboratoryRecord(uid: string, module: LaboratoryModule, id: string) {
  await deleteDoc(doc(moduleCollection(uid, module), id));
}
