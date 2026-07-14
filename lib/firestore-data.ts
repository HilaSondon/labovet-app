import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export type StoredAnimal = {
  cuig: string;
  identifier: string;
  category: string;
};
export type StoredWork = {
  id?: string;
  date: string;
  type: string;
  detail: string;
  animals: string;
  status: string;
  records?: StoredAnimal[];
  source?: "manual" | "excel";
  sigatmStatus?: "Pendiente" | "Finalizado";
};
export type StoredProducer = {
  id: number;
  name: string;
  renspa: string;
  establishment: string;
  address: string;
  phone: string;
  email: string;
  animals: number;
  works: StoredWork[];
};
export type StoredPatientEvent = {
  id?: string;
  date: string;
  type: string;
  detail: string;
  result: string;
  nextDate?: string;
};
export type StoredPatient = {
  id: number;
  name: string;
  species: string;
  breed: string;
  birth: string;
  owner: string;
  phone: string;
  events: StoredPatientEvent[];
};

const userCollection = (uid: string, name: string) =>
  collection(db, "users", uid, name);
const clean = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
const stableWorkId = (producerId: number, work: StoredWork) =>
  work.id ||
  `${producerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function loadVeterinaryData(uid: string) {
  const [producerSnap, workSnap, animalSnap, patientSnap, eventSnap] =
    await Promise.all(
      ["producers", "works", "animals", "patients", "patientEvents"].map(
        (name) => getDocs(userCollection(uid, name)),
      ),
    );
  const animalsByWork = new Map<string, StoredAnimal[]>();
  [...animalSnap.docs]
    .sort((a, b) => Number(a.data().position) - Number(b.data().position))
    .forEach((item) => {
      const data = item.data() as StoredAnimal & { workId: string };
      const list = animalsByWork.get(data.workId) || [];
      list.push({
        cuig: data.cuig || "",
        identifier: data.identifier || "",
        category: data.category || "",
      });
      animalsByWork.set(data.workId, list);
    });
  const worksByProducer = new Map<number, StoredWork[]>();
  workSnap.docs.forEach((item) => {
    const data = item.data() as Omit<StoredWork, "records"> & {
      producerId: number;
    };
    const work: StoredWork = {
      ...data,
      id: item.id,
      records: animalsByWork.get(item.id) || [],
    };
    const list = worksByProducer.get(Number(data.producerId)) || [];
    list.push(work);
    worksByProducer.set(Number(data.producerId), list);
  });
  worksByProducer.forEach((list) =>
    list.sort((a, b) =>
      b.date
        .split("/")
        .reverse()
        .join("")
        .localeCompare(a.date.split("/").reverse().join("")),
    ),
  );
  const eventsByPatient = new Map<number, StoredPatientEvent[]>();
  eventSnap.docs.forEach((item) => {
    const data = item.data() as StoredPatientEvent & { patientId: number };
    const list = eventsByPatient.get(Number(data.patientId)) || [];
    list.push({ ...data, id: item.id });
    eventsByPatient.set(Number(data.patientId), list);
  });
  const producers = producerSnap.docs.map((item) => {
    const data = item.data() as Omit<StoredProducer, "id" | "works">;
    const id = Number(item.id);
    return {
      ...data,
      id,
      works: worksByProducer.get(id) || [],
    } as StoredProducer;
  });
  const patients = patientSnap.docs.map((item) => {
    const data = item.data() as Omit<StoredPatient, "id" | "events">;
    const id = Number(item.id);
    return {
      ...data,
      id,
      events: eventsByPatient.get(id) || [],
    } as StoredPatient;
  });
  return { producers, patients };
}

export async function saveProducerData(uid: string, producer: StoredProducer) {
  const { works: _, ...data } = producer;
  await setDoc(
    doc(userCollection(uid, "producers"), String(producer.id)),
    clean(data),
    { merge: true },
  );
}

async function runBatches(
  items:
    | { kind: "delete"; ref: ReturnType<typeof doc> }[]
    | {
        kind: "set";
        ref: ReturnType<typeof doc>;
        data: Record<string, unknown>;
      }[],
) {
  for (let start = 0; start < items.length; start += 400) {
    const batch = writeBatch(db);
    items
      .slice(start, start + 400)
      .forEach((item) =>
        item.kind === "delete"
          ? batch.delete(item.ref)
          : batch.set(item.ref, item.data),
      );
    await batch.commit();
  }
}

export async function saveWorkMetadata(
  uid: string,
  producerId: number,
  work: StoredWork,
) {
  const id = stableWorkId(producerId, work);
  work.id = id;
  const { records: _, ...metadata } = work;
  await setDoc(
    doc(userCollection(uid, "works"), id),
    clean({ ...metadata, producerId }),
  );
}
export async function saveWorkData(
  uid: string,
  producerId: number,
  work: StoredWork,
) {
  await saveWorkMetadata(uid, producerId, work);
  const id = work.id!;
  const records = work.records || [];
  const existing = await getDocs(
    query(userCollection(uid, "animals"), where("workId", "==", id)),
  );
  await runBatches(
    existing.docs.map((item) => ({ kind: "delete" as const, ref: item.ref })),
  );
  await runBatches(
    records.map((animal, index) => ({
      kind: "set" as const,
      ref: doc(userCollection(uid, "animals"), `${id}-${index}`),
      data: { ...animal, producerId, workId: id, position: index },
    })),
  );
}

export async function savePatientData(uid: string, patient: StoredPatient) {
  const { events: _, ...data } = patient;
  await setDoc(
    doc(userCollection(uid, "patients"), String(patient.id)),
    clean(data),
    { merge: true },
  );
}
export async function savePatientEvent(
  uid: string,
  patientId: number,
  event: StoredPatientEvent,
) {
  const id =
    event.id ||
    `${patientId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  event.id = id;
  await setDoc(
    doc(userCollection(uid, "patientEvents"), id),
    clean({ ...event, patientId }),
  );
}
export async function deletePatientData(uid: string, patientId: number) {
  const events = await getDocs(
    query(
      userCollection(uid, "patientEvents"),
      where("patientId", "==", patientId),
    ),
  );
  await runBatches(
    events.docs.map((item) => ({ kind: "delete" as const, ref: item.ref })),
  );
  await deleteDoc(doc(userCollection(uid, "patients"), String(patientId)));
}
