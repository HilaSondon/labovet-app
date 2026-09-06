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
  assert.doesNotMatch(layout, /@vercel\/analytics/);
  assert.match(layout, /<VisitTracker \/>/);
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

test("conserva guiones internos en identificaciones y limpia guiones de listas", async () => {
  const script = await readFile(new URL("public/sigatm/app.js", root), "utf8");
  const source = script.match(/function cleanMessageLine\(line\)\{[^\n]+\}/)?.[0];
  assert.ok(source, "No se encontró cleanMessageLine");
  const cleanMessageLine = Function(`${source}; return cleanMessageLine;`)();

  assert.equal(cleanMessageLine("2324-5465 VACA"), "2324-5465 VACA");
  assert.equal(cleanMessageLine("1- 2324-5465 VACA"), "2324-5465 VACA");
});

test("acepta el tipo de identificación equina al final", async () => {
  const script = await readFile(new URL("public/sigatm/app.js", root), "utf8");
  const source = script.match(/function trailingIdTypeCells\(line,typeResolver\)\{[^\n]+\}/)?.[0];
  assert.ok(source, "No se encontró trailingIdTypeCells");
  const parseTrailing = Function(`${source}; return trailingIdTypeCells;`)();
  const resolveType = (value) => value.toUpperCase().includes("CERTIFICADO") ? "Nro de Certificado" : "";
  assert.deepEqual(parseTrailing("03123135 YEGUA CERTIFICADO", resolveType), ["Nro de Certificado", "03123135", "YEGUA"]);
  assert.deepEqual(parseTrailing("03123135 YEGUA NRO DE CERTIFICADO", resolveType), ["Nro de Certificado", "03123135", "YEGUA"]);
});

test("los ejemplos automáticos no agregan numeración", async () => {
  const script = await readFile(new URL("public/sigatm/app.js", root), "utf8");
  const sampleHandler = script.match(/\$\("sampleButton"\)\.addEventListener\([^\n]+/)?.[0] || "";
  assert.match(sampleHandler, /`032025000001887 \$\{config\.category\}/);
  assert.doesNotMatch(sampleHandler, /`1- 032025000001887/);
  assert.doesNotMatch(sampleHandler, /"1\) GALLINAS/);
});

test("conserva como tubo la numeración pegada por el usuario", async () => {
  const script = await readFile(new URL("public/sigatm/app.js", root), "utf8");
  const source = script.match(/function numberedTube\(line\)\{[^\n]+\}/)?.[0];
  assert.ok(source, "No se encontró numberedTube");
  const numberedTube = Function(`${source}; return numberedTube;`)();
  assert.equal(numberedTube("1- 032025000001887 VACA"), "1");
  assert.equal(numberedTube("5- 032025000001888 VACA"), "5");
  assert.equal(numberedTube("4- 032025000001889 VACA"), "4");
  assert.equal(numberedTube("2324-5465 VACA"), "");
  assert.match(script, /tube&&cells\.length\?\[tube,\.\.\.cells\]/);
  assert.match(script, /if\(hasPastedTubes\)\$\("tubeMode"\)\.value="keep"/);
});

test("reconoce tubos separados solo por espacios sin confundir equinos", async () => {
  const script = await readFile(new URL("public/sigatm/app.js", root), "utf8");
  const trailingSource = script.match(/function trailingIdTypeCells\(line,typeResolver\)\{[^\n]+\}/)?.[0];
  const spacedSource = script.match(/function spacedTube\(line,variableId,typeResolver\)\{[^\n]+\}/)?.[0];
  assert.ok(trailingSource && spacedSource, "No se encontraron los analizadores de tubos");
  const spacedTube = Function(`${trailingSource}; ${spacedSource}; return spacedTube;`)();
  const resolveType = (value) => /CERTIFICADO/i.test(value) ? "Nro de Certificado" : "";
  assert.equal(spacedTube("5 032025000001888 VACA", false, resolveType), "5");
  assert.equal(spacedTube("03123135 YEGUA CERTIFICADO", true, resolveType), "");
  assert.equal(spacedTube("5 03123135 YEGUA CERTIFICADO", true, resolveType), "5");
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
  assert.match(accessPanel, /CLARA\.CHASIS\.FORMA/);
  assert.match(accessPanel, /Titular: Hilario Sondon/);
  const subscriptionRoute = await readFile(
    new URL("app/api/subscriptions/create/route.ts", root),
    "utf8",
  );
  assert.match(subscriptionRoute, /https:\/\/mpago\.la\/2s8oDCv/);
});

test("inicia siete días de prueba al verificar el correo y bloquea al vencer", async () => {
  const [page, trialRoute, accessPanel] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/subscriptions/start-trial/route.ts", root), "utf8"),
    readFile(new URL("components/AccountAccess.tsx", root), "utf8"),
  ]);
  assert.match(page, /\/api\/subscriptions\/start-trial/);
  assert.match(page, /trialExpired/);
  assert.match(trialRoute, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(trialRoute, /email_verified/);
  assert.match(accessPanel, /Tu prueba gratuita terminó/);
});

test("diferencia Mercado Pago de transferencia y registra la solicitud manual", async () => {
  const [panel, transferRoute, admin] = await Promise.all([
    readFile(new URL("components/SubscriptionPanel.tsx", root), "utf8"),
    readFile(new URL("app/api/subscriptions/request-transfer/route.ts", root), "utf8"),
    readFile(new URL("components/AdminUsersPanel.tsx", root), "utf8"),
  ]);
  assert.match(panel, /Aún no elegida/);
  assert.match(panel, /isMercadoPago && profile\.mercadoPagoPreapprovalId/);
  assert.match(panel, /Fin de la prueba/);
  assert.match(transferRoute, /paymentMethod: "transfer"/);
  assert.match(admin, /paymentMethod: "transfer"/);
});

test("permite administrar y cancelar una suscripción individual", async () => {
  const [page, panel, cancellation, webhook] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/SubscriptionPanel.tsx", root), "utf8"),
    readFile(new URL("app/api/subscriptions/cancel/route.ts", root), "utf8"),
    readFile(new URL("app/api/mercadopago/webhook/route.ts", root), "utf8"),
  ]);
  assert.match(page, /Mi suscripción/);
  assert.match(panel, /Cancelar suscripción/);
  assert.match(panel, /Transferencia manual/);
  assert.match(cancellation, /status: "canceled"/);
  assert.match(cancellation, /subscriptionCancelAtPeriodEnd/);
  assert.match(webhook, /cancellationHasTime/);
  assert.match(webhook, /canceled && cancellationHasTime/);
});

test("administra medios de pago, reintentos y conciliación automática", async () => {
  const [admin, webhook, reconciliation, access, vercel] = await Promise.all([
    readFile(new URL("components/AdminUsersPanel.tsx", root), "utf8"),
    readFile(new URL("app/api/mercadopago/webhook/route.ts", root), "utf8"),
    readFile(new URL("app/api/cron/reconcile-subscriptions/route.ts", root), "utf8"),
    readFile(new URL("app/api/access/status/route.ts", root), "utf8"),
    readFile(new URL("vercel.json", root), "utf8"),
  ]);
  assert.match(admin, /Mercado Pago/);
  assert.match(admin, /Transferencia/);
  assert.match(admin, /Pago en reintento/);
  assert.match(admin, /Con problemas/);
  assert.match(admin, /Cancelar MP/);
  assert.match(webhook, /payment_retry/);
  assert.match(webhook, /paymentRetryAttempt/);
  assert.match(reconciliation, /authorized_payments\/search/);
  assert.match(access, /retryExpired/);
  assert.match(vercel, /reconcile-subscriptions/);
});

test("ofrece guías separadas para VetConver y SIGATM", async () => {
  const [page, guide] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/GuidePanel.tsx", root), "utf8"),
  ]);
  assert.match(page, /Cómo cargar en SIGATM/);
  assert.match(page, /Cómo usar VetConver/);
  assert.match(page, /key="sigatm-guide"/);
  assert.match(page, /key="vetconver-guide"/);
  assert.match(guide, /03123135 YEGUA LIBRETA/);
  assert.match(guide, /Ingresá a Actas DNSA/);
  assert.match(guide, /ícono de tres líneas/);
  assert.match(guide, /nueva Acta DNSA/i);
});

test("registra visitas propias y las muestra solo al administrador", async () => {
  const [page, tracker, panel, visitRoute, summaryRoute] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("components/VisitTracker.tsx", root), "utf8"),
    readFile(new URL("components/VisitAnalyticsPanel.tsx", root), "utf8"),
    readFile(new URL("app/api/analytics/visit/route.ts", root), "utf8"),
    readFile(new URL("app/api/analytics/summary/route.ts", root), "utf8"),
  ]);
  assert.match(page, />Visitas</);
  assert.match(tracker, /vetconverVisitorId/);
  assert.match(tracker, /headers\.Authorization/);
  assert.match(visitRoute, /uniqueVisitors/);
  assert.match(visitRoute, /ignored: "admin"/);
  assert.match(summaryRoute, /profile\?\.role !== "admin"/);
  assert.match(panel, /Visitantes únicos/);
});
