const authBase = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts";
const firestoreBase = "http://127.0.0.1:8080/v1/projects/labovet-e70a2/databases/(default)/documents";
const password = "VetConver123!";

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

try {
  await ensureAccount({
    email: "admin@vetconver.local",
    displayName: "Administrador local",
    role: "admin",
    plan: "large_animals",
  });
  await ensureAccount({
    email: "veterinario@vetconver.local",
    displayName: "Veterinario local",
    role: "veterinarian",
    plan: "large_animals",
  });

  console.log(`Administrador local: admin@vetconver.local / ${password}`);
  console.log(`Veterinario local: veterinario@vetconver.local / ${password}`);
} catch (error) {
  console.error("No se pudo preparar el emulador:", error.message);
  process.exitCode = 1;
}
