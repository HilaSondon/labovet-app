const authBase = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts";
const firestoreBase = "http://127.0.0.1:8080/v1/projects/labovet-e70a2/databases/(default)/documents";
const password = "LabOVet123!";

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `${response.status}`);
  return body;
}

async function ensureAccount({ email, displayName, role, plan }) {
  let account;
  try {
    account = await request(`${authBase}:signUp?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
    });
  } catch (error) {
    if (!String(error.message).includes("EMAIL_EXISTS")) throw error;
    account = await request(`${authBase}:signInWithPassword?key=demo-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  }

  const fields = {
    name: { stringValue: displayName },
    email: { stringValue: email },
    role: { stringValue: role },
    plan: { stringValue: plan },
    subscriptionStatus: { stringValue: "active" },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  await request(`${firestoreBase}/users/${account.localId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  return account;
}

async function copyCollection(sourceUid, targetUid, collectionName) {
  const response = await request(`${firestoreBase}/users/${sourceUid}/${collectionName}?pageSize=1000`, {
    headers: { Authorization: "Bearer owner" },
  });
  const documents = response.documents || [];
  for (let start = 0; start < documents.length; start += 50) {
    await Promise.all(documents.slice(start, start + 50).map((document) => {
      const id = document.name.split("/").pop();
      return request(`${firestoreBase}/users/${targetUid}/${collectionName}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
        body: JSON.stringify({ fields: document.fields || {} }),
      });
    }));
  }
  return documents.length;
}

try {
  const admin = await ensureAccount({
    email: "admin@labovet.local",
    displayName: "Administrador local",
    role: "admin",
    plan: "large_animals",
  });
  const laboratory = await ensureAccount({
    email: "laboratorio@labovet.local",
    displayName: "Laboratorio local",
    role: "laboratory",
    plan: "laboratory",
  });

  const laboratoryCollections = [
    "lab-samples", "labVeterinarians", "lab-clients", "lab-prices",
    "lab-qualityManual", "lab-procedures", "lab-records", "lab-reagents",
    "lab-equipment", "lab-audits", "lab-nonconformities", "lab-priceSettings",
    "lab-quickAccess", "labProtocols", "labSettings",
  ];
  let copied = 0;
  for (const collectionName of laboratoryCollections) {
    copied += await copyCollection(admin.localId, laboratory.localId, collectionName);
  }

  console.log(`Administrador local: admin@labovet.local / ${password}`);
  console.log(`Laboratorio local: laboratorio@labovet.local / ${password}`);
  console.log(`${copied} registros de laboratorio sincronizados con la vista exclusiva.`);
} catch (error) {
  console.error("No se pudo preparar el emulador:", error.message);
  process.exitCode = 1;
}
