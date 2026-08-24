import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore/lite";
import { db } from "./firebase";

export type LaboratoryModule =
  | "samples" | "clients" | "prices" | "qualityManual" | "procedures"
  | "records" | "reagents" | "equipment" | "audits" | "nonconformities";

export type LaboratoryManagementRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: string | number | boolean;
};

const moduleCollection = (uid: string, module: LaboratoryModule) =>
  collection(db, "users", uid, `lab-${module}`);

export async function loadLaboratoryModule(uid: string, module: LaboratoryModule) {
  const snapshot = await getDocs(moduleCollection(uid, module));
  return snapshot.docs
    .map((item) => ({ ...item.data(), id: item.id }) as LaboratoryManagementRecord)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export async function saveLaboratoryRecord(uid: string, module: LaboratoryModule, record: LaboratoryManagementRecord) {
  await setDoc(doc(moduleCollection(uid, module), record.id), record);
}

export async function deleteLaboratoryRecord(uid: string, module: LaboratoryModule, id: string) {
  await deleteDoc(doc(moduleCollection(uid, module), id));
}
