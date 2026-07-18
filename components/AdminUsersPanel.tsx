"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
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
  createdAt?: { toDate?: () => Date };
};

const statuses: { value: SubscriptionStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "trial", label: "Prueba" },
  { value: "active", label: "Activo" },
  { value: "expired", label: "Vencido" },
  { value: "suspended", label: "Suspendido" },
];

const plans: PlanId[] = [
  "unassigned",
  "small_animals",
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

export default function AdminUsersPanel({ currentUid }: { currentUid: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [feedback, setFeedback] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    setFeedback("");
    try {
      const snapshot = await getDocs(collection(db, "users"));
      setUsers(
        snapshot.docs
          .map((item) => {
            const data = item.data();
            const legacyAccount = !data.subscriptionStatus;
            return {
              uid: item.id,
              name: String(data.name || "Veterinario sin nombre"),
              email: String(data.email || "Sin correo"),
              role: String(data.role || "veterinarian"),
              plan: legacyAccount ? "large_animals" : normalizePlan(data.plan),
              subscriptionStatus: legacyAccount
                ? "active"
                : normalizeStatus(data.subscriptionStatus),
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
    loadUsers();
  }, []);

  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!query ||
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)) &&
        (!statusFilter || user.subscriptionStatus === statusFilter),
    );
  }, [search, statusFilter, users]);

  const updateLocal = (
    uid: string,
    changes: Partial<Pick<AdminUser, "plan" | "subscriptionStatus">>,
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
        subscriptionUpdatedAt: serverTimestamp(),
        subscriptionUpdatedBy: currentUid,
      });
      setFeedback(`Acceso actualizado para ${user.name}.`);
    } catch (error) {
      console.error("No pudimos actualizar el acceso", error);
      setFeedback("No pudimos guardar el cambio. Revisá los permisos de administrador.");
    } finally {
      setSaving("");
    }
  };

  const activeUsers = users.filter(
    (user) =>
      user.subscriptionStatus === "active" ||
      user.subscriptionStatus === "trial",
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
        <button className="outline-btn" type="button" onClick={loadUsers}>
          Actualizar lista
        </button>
      </header>

      <section className="module-stats admin-user-stats">
        <article className="panel stat-card"><span>Usuarios registrados</span><strong>{users.length}</strong><small>cuentas creadas</small></article>
        <article className="panel stat-card"><span>Accesos activos</span><strong>{activeUsers}</strong><small>activos o en prueba</small></article>
        <article className={`panel stat-card ${pendingUsers ? "attention" : ""}`}><span>Pendientes</span><strong>{pendingUsers}</strong><small>requieren asignación</small></article>
        <article className="panel stat-card"><span>Servicio administrativo</span><strong>{managedUsers}</strong><small>gestionados por LabOVet</small></article>
      </section>

      {feedback && <div className="stock-notice"><span>{feedback}</span><button type="button" onClick={() => setFeedback("")}>×</button></div>}

      <section className="panel admin-users-panel">
        <div className="admin-users-toolbar">
          <div><h2>Listado de usuarios</h2><p>Los cambios se aplican en el próximo inicio de sesión o actualización del usuario.</p></div>
          <div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nombre o correo..." />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos los estados</option>
              {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        </div>

        <div className="admin-users-head"><span>Usuario</span><span>Plan</span><span>Estado</span><span>Registro</span><span>Acción</span></div>
        {loading ? (
          <div className="admin-users-empty">Cargando usuarios…</div>
        ) : visibleUsers.length ? (
          visibleUsers.map((user) => (
            <article className="admin-user-row" key={user.uid}>
              <div><b>{user.name}</b><small>{user.email}{user.role === "admin" ? " · Administrador" : ""}</small></div>
              <select value={user.plan} onChange={(event) => updateLocal(user.uid, { plan: event.target.value as PlanId })}>
                {plans.map((plan) => <option key={plan} value={plan}>{PLAN_DEFINITIONS[plan].name}</option>)}
              </select>
              <select className={`subscription-${user.subscriptionStatus}`} value={user.subscriptionStatus} onChange={(event) => updateLocal(user.uid, { subscriptionStatus: event.target.value as SubscriptionStatus })}>
                {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <time>{user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString("es-AR") : "—"}</time>
              <button type="button" onClick={() => saveAccess(user)} disabled={saving === user.uid}>{saving === user.uid ? "Guardando…" : "Guardar"}</button>
            </article>
          ))
        ) : (
          <div className="admin-users-empty">No encontramos usuarios con esos filtros.</div>
        )}
      </section>
    </>
  );
}
