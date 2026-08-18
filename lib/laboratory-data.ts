import { collection, doc, getDocs, setDoc } from "firebase/firestore/lite";
import { db } from "./firebase";

export type LaboratoryVeterinarian = {
  id: string;
  name: string;
  cuit: string;
};

export type LaboratoryProtocol = {
  id: string;
  reportNumber: string;
  actNumber: string;
  date: string;
  receptionDate: string;
  renspa: string;
  veterinarianCuit: string;
  veterinarianName: string;
  assayName: string;
  sampleCount: number;
  positiveCount: number;
  suspiciousCount: number;
  report: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  savedAt: string;
};

const userCollection = (uid: string, name: string) =>
  collection(db, "users", uid, name);

export async function loadLaboratoryData(uid: string) {
  const [protocolSnapshot, veterinarianSnapshot] = await Promise.all([
    getDocs(userCollection(uid, "labProtocols")),
    getDocs(userCollection(uid, "labVeterinarians")),
  ]);
  return {
    protocols: protocolSnapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }) as LaboratoryProtocol)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    veterinarians: veterinarianSnapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }) as LaboratoryVeterinarian)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function saveLaboratoryProtocol(uid: string, protocol: LaboratoryProtocol) {
  await setDoc(doc(userCollection(uid, "labProtocols"), protocol.id), protocol);
}

export async function saveLaboratoryVeterinarians(
  uid: string,
  veterinarians: LaboratoryVeterinarian[],
) {
  await Promise.all(
    veterinarians.map((veterinarian) =>
      setDoc(doc(userCollection(uid, "labVeterinarians"), veterinarian.id), veterinarian),
    ),
  );
}
