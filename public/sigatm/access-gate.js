(function () {
  "use strict";

  const gate = document.getElementById("vetconverAccessGate");
  let finished = false;

  function deny(message) {
    if (finished) return;
    finished = true;
    gate.innerHTML = `<div><h1>Acceso protegido</h1><p>${message}</p><a href="/">Volver a VetConver</a></div>`;
  }

  function allow() {
    if (finished) return;
    finished = true;
    gate.remove();
    document.body.classList.remove("vetconver-access-pending");
  }

  if (window.top === window.self) {
    deny("Ingresá desde VetConver con una cuenta que tenga acceso vigente.");
    return;
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== window.location.origin || event.data?.type !== "vetconver-access-token") return;
    try {
      const response = await fetch("/api/access/status", {
        headers: { Authorization: `Bearer ${event.data.token}` },
      });
      const result = await response.json();
      if (response.ok && result.allowed) allow();
      else deny("Tu prueba o suscripción no está activa. Revisá Mi suscripción para continuar.");
    } catch {
      deny("No pudimos verificar tu acceso. Volvé a ingresar e intentá nuevamente.");
    }
  });

  window.setTimeout(() => deny("No pudimos validar la sesión. Volvé a ingresar desde VetConver."), 12000);
})();
