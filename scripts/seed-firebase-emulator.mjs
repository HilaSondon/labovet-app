const authUrl = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key";
const firestoreUrl = "http://127.0.0.1:8080/v1/projects/labovet-e70a2/databases/(default)/documents/users";
const email = "admin@labovet.local";
const password = "LabOVet123!";

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `${response.status}`);
  return body;
}

try {
  const account = await request(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "Administrador local", returnSecureToken: true }),
  });
  const fields = {
    name: { stringValue: "Administrador local" },
    email: { stringValue: email },
    role: { stringValue: "admin" },
    plan: { stringValue: "large_animals" },
    subscriptionStatus: { stringValue: "active" },
    createdAt: { timestampValue: new Date().toISOString() },
  };
  await request(`${firestoreUrl}/${account.localId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  console.log(`Usuario local creado: ${email} / ${password}`);
} catch (error) {
  if (String(error.message).includes("EMAIL_EXISTS")) {
    console.log(`El usuario local ya existe: ${email} / ${password}`);
  } else {
    console.error("No se pudo preparar el emulador:", error.message);
    process.exitCode = 1;
  }
}
