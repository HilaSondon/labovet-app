"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore/lite";
import { auth, db } from "../lib/firebase";
import "./AdminUsersPanel.css";
import {
  PLAN_DEFINITIONS,
  PlanId,
  SubscriptionStatus,
} from "../lib/access-control";

type AdminUser = {
  uid: string;
  name: string;
  email: string;
  role: string;
  plan: PlanId;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string;
  subscriptionEndsAtIso: string;
  trialStartedAtIso: string;
  paymentMethod: "mercadopago" | "transfer" | "";
  lastPaymentApprovedAt: string;
  lastPaymentAttemptAt: string;
  lastPaymentStatus: string;
  paymentGraceEndsAtIso: string;
  subscriptionCancelAtPeriodEnd: boolean;
  mercadoPagoPreapprovalId: string;
  request?: { plan: PlanId; status: string };
  createdAt?: { toDate?: () => Date };
};

const statuses: { value: SubscriptionStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "trial", label: "Prueba" },
  { value: "active", label: "Activo" },
  { value: "payment_retry", label: "Pago en reintento" },
  { value: "expired", label: "Vencido" },
  { value: "suspended", label: "Suspendido" },
];

const plans: PlanId[] = [
  "unassigned",
  "large_animals",
  "administrative_service",
];

const normalizePlan = (value: unknown): PlanId =>
  typeof value === "string" && value in PLAN_DEFINITIONS
    ? (value as PlanId)
    : "unassigned";

const normalizeStatus = (value: unknown): SubscriptionStatus =>
  statuses.some((status) => status.value === value)
    ? (value as SubscriptionStatus)
    : "pending";

const isoDate = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return "";
};

const shortDate = (value: string) => {
  if (!value) return "—";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR").format(date);
};

export default function AdminUsersPanel({
  currentUid,
}: {
  currentUid: string;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [feedback, setFeedback] = useState("");
  const [cleaning, setCleaning] = useState(false);

  const cleanupTestUsers = async () => {
    const confirmation = window.prompt(
      "Esta acción elimina definitivamente todas las cuentas excepto tu administrador. Escribí BORRAR USUARIOS para continuar.",
    );
    if (confirmation !== "BORRAR USUARIOS") return;
    const current = auth.currentUser;
    if (!current) return setFeedback("Tu sesión ya no está activa.");
    setCleaning(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/cleanup-users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await current.getIdToken(true)}`,
        },
        body: JSON.stringify({ confirmation }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo completar");
      await loadUsers();
      setFeedback(`Limpieza completa: ${result.deletedAuthenticationUsers} cuentas y ${result.deletedProfiles} perfiles eliminados. Tu administrador se conservó.`);
    } catch (error) {
      console.error("No pudimos limpiar los usuarios", error);
      setFeedback("No pudimos borrar las cuentas. No se modificó tu administrador.");
    } finally {
      setCleaning(false);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    setFeedback("");
    try {
      const [snapshot, requestSnapshot] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "subscriptionRequests")),
      ]);
      const requests = new Map(
        requestSnapshot.docs.map((item) => [item.id, item.data()]),
      );
      setUsers(
        snapshot.docs
          .map((item) => {
            const data = item.data();
            const legacyAccount = !data.subscriptionStatus;
            const request = requests.get(item.id);
            return {
              uid: item.id,
              name: String(data.name || "Usuario sin nombre"),
              email: String(data.email || "Sin correo"),
              role: String(data.role || "veterinarian"),
              plan: legacyAccount ? "large_animals" : normalizePlan(data.plan),
              subscriptionStatus: legacyAccount
                ? "active"
                : normalizeStatus(data.subscriptionStatus),
              subscriptionEndsAt: String(data.subscriptionEndsAt || ""),
              subscriptionEndsAtIso: String(data.subscriptionEndsAtIso || ""),
              trialStartedAtIso: String(data.trialStartedAtIso || ""),
              paymentMethod: data.paymentMethod === "mercadopago" || data.paymentMethod === "transfer" ? data.paymentMethod : "",
              lastPaymentApprovedAt: isoDate(data.lastPaymentApprovedAt),
              lastPaymentAttemptAt: isoDate(data.lastPaymentAttemptAt),
              lastPaymentStatus: String(data.lastPaymentStatus || ""),
              paymentGraceEndsAtIso: String(data.paymentGraceEndsAtIso || ""),
              subscriptionCancelAtPeriodEnd: Boolean(data.subscriptionCancelAtPeriodEnd),
              mercadoPagoPreapprovalId: String(data.mercadoPagoPreapprovalId || ""),
              request: request
                ? {
                    plan: normalizePlan(request.plan),
                    status: String(request.status || "pending"),
                  }
                : undefined,
              createdAt: data.createdAt,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (error) {
      console.error("No pudimos cargar los usuarios", error);
      setFeedback(
        "No pudimos abrir los usuarios. Verificá que tu cuenta tenga rol administrador y que las reglas estén publicadas.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // La carga inicial sincroniza este panel con Firebase.
    loadUsers();
  }, []);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!query ||
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)) &&
        (!statusFilter ||
          user.subscriptionStatus === statusFilter ||
          (statusFilter === "mercadopago" && user.paymentMethod === "mercadopago") ||
          (statusFilter === "transfer" && user.paymentMethod === "transfer") ||
          (statusFilter === "problems" && ["payment_retry", "suspended", "expired"].includes(user.subscriptionStatus))),
    );
  }, [search, statusFilter, users]);

  const updateLocal = (
    uid: string,
    changes: Partial<
      Pick<AdminUser, "plan" | "subscriptionStatus" | "subscriptionEndsAt">
    >,
  ) =>
    setUsers((current) =>
      current.map((user) =>
        user.uid === uid ? { ...user, ...changes } : user,
      ),
    );

  const saveAccess = async (user: AdminUser) => {
    setSaving(user.uid);
    setFeedback("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionEndsAt: user.subscriptionEndsAt,
        subscriptionUpdatedAt: serverTimestamp(),
        subscriptionUpdatedBy: currentUid,
      });
      setFeedback(`Acceso actualizado para ${user.name}.`);
    } catch (error) {
      console.error("No pudimos actualizar el acceso", error);
      setFeedback(
        "No pudimos guardar el cambio. Revisá los permisos de administrador.",
      );
    } finally {
      setSaving("");
    }
  };

  const defaultExpiration = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  };

  const reviewRequest = async (user: AdminUser, approved: boolean) => {
    if (!user.request) return;
    setSaving(user.uid);
    setFeedback("");
    try {
      const successMessage = approved
        ? `Plan ${PLAN_DEFINITIONS[user.request.plan].name} activado para ${user.name}.`
        : `Solicitud rechazada para ${user.name}.`;
      if (approved) {
        const endsAt = user.subscriptionEndsAt || defaultExpiration();
        await updateDoc(doc(db, "users", user.uid), {
          plan: user.request.plan,
          subscriptionStatus: "active",
          subscriptionStartedAt: serverTimestamp(),
          paymentMethod: "transfer",
          subscriptionEndsAt: endsAt,
          subscriptionUpdatedAt: serverTimestamp(),
          subscriptionUpdatedBy: currentUid,
        });
      }
      await setDoc(
        doc(db, "subscriptionRequests", user.uid),
        {
          status: approved ? "approved" : "rejected",
          reviewedAt: serverTimestamp(),
          reviewedBy: currentUid,
        },
        { merge: true },
      );
      await loadUsers();
      setFeedback(successMessage);
    } catch (error) {
      console.error("No pudimos revisar la solicitud", error);
      setFeedback("No pudimos completar la revisión de la solicitud.");
    } finally {
      setSaving("");
    }
  };

  const cancelMercadoPago = async (user: AdminUser) => {
    if (!window.confirm(`¿Cancelar la renovación de Mercado Pago de ${user.name}? No se realizarán nuevos cobros.`)) return;
    const current = auth.currentUser;
    if (!current) return setFeedback("Tu sesión ya no está activa.");
    setSaving(user.uid);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await current.getIdToken(true)}` },
        body: JSON.stringify({ userId: user.uid }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo cancelar");
      await loadUsers();
      setFeedback(`La renovación de ${user.name} quedó cancelada en Mercado Pago.`);
    } catch (error) {
      console.error("No pudimos cancelar la suscripción", error);
      setFeedback("Mercado Pago no confirmó la cancelación. No se modificó el estado.");
    } finally {
      setSaving("");
    }
  };

  const activeUsers = users.filter(
    (user) =>
      user.subscriptionStatus === "active" ||
      user.subscriptionStatus === "trial" ||
      user.subscriptionStatus === "payment_retry",
  ).length;
  const pendingUsers = users.filter(
    (user) => user.subscriptionStatus === "pending",
  ).length;
  const managedUsers = users.filter(
    (user) => user.plan === "administrative_service",
  ).length;

  return (
    <>
      <header className="topbar module-topbar admin-header">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Usuarios y accesos</h1>
          <p>Asigná planes y controlá quién puede utilizar cada módulo.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="outline-btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} type="button" onClick={cleanupTestUsers} disabled={cleaning}>
            {cleaning ? "Eliminando…" : "Borrar usuarios de prueba"}
          </button>
          <button className="outline-btn" type="button" onClick={loadUsers}>
            Actualizar lista
          </button>
        </div>
      </header>

      <section className="module-stats admin-user-stats">
        <article className="panel stat-card">
          <span>Usuarios registrados</span>
          <strong>{users.length}</strong>
          <small>cuentas creadas</small>
        </article>
        <article className="panel stat-card">
          <span>Accesos activos</span>
          <strong>{activeUsers}</strong>
          <small>activos o en prueba</small>
        </article>
        <article
          className={`panel stat-card ${pendingUsers ? "attention" : ""}`}
        >
          <span>Pendientes</span>
          <strong>{pendingUsers}</strong>
          <small>requieren asignación</small>
        </article>
        <article className="panel stat-card">
          <span>Servicio administrativo</span>
          <strong>{managedUsers}</strong>
          <small>gestionados por VetConver</small>
        </article>
      </section>

      {feedback && (
        <div className="stock-notice">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback("")}>
            ×
          </button>
        </div>
      )}

      <section className="panel admin-users-panel">
        <div className="admin-users-toolbar">
          <div>
            <h2>Listado de usuarios</h2>
            <p>
              Los cambios se aplican en el próximo inicio de sesión o
              actualización del usuario.
            </p>
          </div>
          <div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nombre o correo..."
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="transfer">Transferencia</option>
              <option value="problems">Con problemas</option>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-users-head subscription-admin-grid">
          <span>Usuario</span>
          <span>Plan</span>
          <span>Método</span>
          <span>Estado</span>
          <span>Fechas y pagos</span>
          <span>Acción</span>
        </div>
        {loading ? (
          <div className="admin-users-empty">Cargando usuarios…</div>
        ) : visibleUsers.length ? (
          visibleUsers.map((user) => (
            <article className="admin-user-row subscription-admin-grid" key={user.uid}>
              <div>
                <b>{user.name}</b>
                <small>
                  {user.email}
                  {user.role === "admin"
                    ? " · Administrador"
                    : user.role === "laboratory"
                      ? " · Laboratorio"
                      : " · Veterinario"}
                </small>
                {user.request?.status === "pending" && (
                  <em>Solicitó: {PLAN_DEFINITIONS[user.request.plan].name}</em>
                )}
              </div>
              <select
                value={plans.includes(user.plan) ? user.plan : "unassigned"}
                onChange={(event) =>
                  updateLocal(user.uid, { plan: event.target.value as PlanId })
                }
              >
                {plans.map((plan) => (
                  <option key={plan} value={plan}>
                    {PLAN_DEFINITIONS[plan].name}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <b>{user.paymentMethod === "mercadopago" ? "Mercado Pago" : user.paymentMethod === "transfer" ? "Transferencia" : user.subscriptionStatus === "trial" ? "Sin elegir" : "—"}</b>
                {user.subscriptionCancelAtPeriodEnd && <small>Cancelación programada</small>}
              </div>
              <select
                className={`subscription-${user.subscriptionStatus}`}
                value={user.subscriptionStatus}
                onChange={(event) =>
                  updateLocal(user.uid, {
                    subscriptionStatus: event.target
                      .value as SubscriptionStatus,
                  })
                }
              >
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {user.subscriptionStatus === "trial" && <small>Prueba: {shortDate(user.trialStartedAtIso)} → {shortDate(user.subscriptionEndsAtIso)}</small>}
                {user.paymentMethod === "mercadopago" && <small>Último pago: {shortDate(user.lastPaymentApprovedAt || user.lastPaymentAttemptAt)}{user.lastPaymentStatus ? ` · ${user.lastPaymentStatus}` : ""}</small>}
                {user.paymentMethod === "mercadopago" && <small>{user.subscriptionCancelAtPeriodEnd ? "Acceso hasta" : "Próximo cobro"}: {shortDate(user.subscriptionEndsAtIso)}</small>}
                {user.subscriptionStatus === "payment_retry" && <small style={{ color: "var(--red)" }}>Gracia hasta: {shortDate(user.paymentGraceEndsAtIso)}</small>}
                {user.paymentMethod !== "mercadopago" && <input className="admin-expiration-input" value={user.subscriptionEndsAt} onChange={(event) => updateLocal(user.uid, { subscriptionEndsAt: event.target.value })} placeholder="DD/MM/AAAA" />}
              </div>
              {user.request?.status === "pending" ? (
                <div className="request-actions">
                  <button
                    type="button"
                    onClick={() => reviewRequest(user, true)}
                    disabled={saving === user.uid}
                  >
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewRequest(user, false)}
                    disabled={saving === user.uid}
                  >
                    Rechazar
                  </button>
                </div>
              ) : user.paymentMethod === "mercadopago" && user.mercadoPagoPreapprovalId && !user.subscriptionCancelAtPeriodEnd && ["active", "payment_retry"].includes(user.subscriptionStatus) ? (
                <div className="request-actions" style={{ flexDirection: "column" }}>
                  <button type="button" onClick={() => saveAccess(user)} disabled={saving === user.uid}>Guardar</button>
                  <button type="button" style={{ background: "var(--red)" }} onClick={() => cancelMercadoPago(user)} disabled={saving === user.uid}>Cancelar MP</button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => saveAccess(user)}
                  disabled={saving === user.uid}
                >
                  {saving === user.uid ? "Guardando…" : "Guardar"}
                </button>
              )}
            </article>
          ))
        ) : (
          <div className="admin-users-empty">
            No encontramos usuarios con esos filtros.
          </div>
        )}
      </section>
    </>
  );
}
