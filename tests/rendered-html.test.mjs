import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("la versión pública comunica el producto actual", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(layout, /VetConver \| Planillas SIGATM/);
  assert.match(page, /De Excel a SIGATM/);
  assert.match(page, /Anemia infecciosa equina/);
  assert.match(page, /Brucelosis y leucosis/);
  assert.match(page, /Brucella ovis/);
  assert.match(page, /Aujeszky y triquina/);
  assert.match(page, /Correo de consultas: próximamente/);
});

test("conserva veterinarios y administración, sin registrar laboratorios", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /role: "veterinarian"/);
  assert.match(page, /<AdminUsersPanel/);
  assert.match(page, /subscriptionStatus: "pending"/);
  assert.match(page, /El módulo para laboratorios no está disponible/);
  assert.doesNotMatch(page, /role: "laboratory"/);
  assert.doesNotMatch(page, /LaboratoryManagementPanel/);
});

test("incluye el módulo SIGATM completo y sus recursos", async () => {
  await Promise.all([
    access(new URL("public/sigatm/index.html", root)),
    access(new URL("public/sigatm/app.js", root)),
    access(new URL("public/sigatm/vendor/xlsx.full.min.js", root)),
    access(new URL("public/sigatm/assets/manual/01-datos-acta-redactado.png", root)),
    access(new URL("components/Brand.tsx", root)),
  ]);
});

test("protege el alta y ofrece ambas modalidades de pago", async () => {
  const [page, accessPanel, actionPage, sentPage] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/AccountAccess.tsx", root), "utf8"),
    readFile(new URL("app/auth/action/page.tsx", root), "utf8"),
    readFile(new URL("app/registro-enviado/page.tsx", root), "utf8"),
  ]);
  assert.match(page, /registro-enviado/);
  assert.match(page, /sendEmailVerification/);
  assert.match(sentPage, /Revisá tu correo/);
  assert.match(actionPage, /Tu correo quedó confirmado/);
  assert.match(accessPanel, /Mercado Pago/);
  assert.match(accessPanel, /Transferencia bancaria/);
  assert.match(accessPanel, /NOAMS/);
});
