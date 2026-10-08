"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteField,
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
  username: string;
  contactEmail: string;
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
  hasLabLogo?: boolean;
  adminBilling: {
    contactName: string;
    phone: string;
    taxId: string;
    location: string;
    agreedAmount: string;
    billingFrequency: "monthly" | "quarterly" | "annual" | "custom";
    nextDueDate: string;
    lastPaymentDate: string;
    serviceDetails: string;
    notes: string;
  };
};

const emptyBilling: AdminUser["adminBilling"] = {
  contactName: "", phone: "", taxId: "", location: "", agreedAmount: "",
  billingFrequency: "monthly", nextDueDate: "", lastPaymentDate: "",
  serviceDetails: "", notes: "",
};

async function prepareLaboratoryLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Usá una imagen PNG, JPG o WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo no debe superar 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    let scale = Math.min(1, 480 / image.naturalWidth, 320 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    let data = "";
    do {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL("image/png");
      scale *= 0.75;
    } while (data.length > 350_000 && canvas.width > 80 && canvas.height > 80);
    if (data.length > 350_000) throw new Error("El logo es demasiado complejo. Probá un PNG más simple.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

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
  "laboratory",
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
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [accountType, setAccountType] = useState<"veterinarian" | "laboratory" | "admin">("veterinarian");
  const [managedUser, setManagedUser] = useState<AdminUser | null>(null);

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
      const [snapshot, requestSnapshot, adminSnapshot] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "subscriptionRequests")),
        getDocs(collection(db, "adminUserRecords")),
      ]);
      const requests = new Map(
        requestSnapshot.docs.map((item) => [item.id, item.data()]),
      );
      const adminRecords = new Map(
        adminSnapshot.docs.map((item) => [item.id, item.data()]),
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
              username: String(data.username || ""),
              contactEmail: String(data.contactEmail || ""),
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
              hasLabLogo: Boolean(data.laboratoryLogoData),
              adminBilling: {
                ...emptyBilling,
                ...(adminRecords.get(item.id)?.billing && typeof adminRecords.get(item.id)?.billing === "object" ? adminRecords.get(item.id)?.billing : {}),
                agreedAmount: String(adminRecords.get(item.id)?.billing?.agreedAmount || ""),
              },
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
          user.email.toLowerCase().includes(query) ||
          user.username.toLowerCase().includes(query) ||
          user.contactEmail.toLowerCase().includes(query)) &&
        (!statusFilter ||
          user.subscriptionStatus === statusFilter ||
          (statusFilter === "mercadopago" && user.paymentMethod === "mercadopago") ||
          (statusFilter === "transfer" && user.paymentMethod === "transfer") ||
          (statusFilter === "problems" && ["payment_retry", "suspended", "expired"].includes(user.subscriptionStatus))) &&
        user.role === accountType,
    );
  }, [accountType, search, statusFilter, users]);

  const updateLocal = (
    uid: string,
    changes: Partial<
      Pick<AdminUser, "role" | "plan" | "subscriptionStatus" | "subscriptionEndsAt">
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
        role: user.role,
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

  const openManagement = (user: AdminUser) => {
    setManagedUser({ ...user, adminBilling: { ...user.adminBilling } });
  };

  const changeBilling = (field: keyof AdminUser["adminBilling"], value: string) => {
    setManagedUser((current) => current ? {
      ...current,
      adminBilling: { ...current.adminBilling, [field]: value },
    } : current);
  };

  const saveAdministrativeDetails = async () => {
    if (!managedUser) return;
    setSaving(managedUser.uid);
    setFeedback("");
    try {
      await setDoc(doc(db, "adminUserRecords", managedUser.uid), {
        userId: managedUser.uid,
        billing: managedUser.adminBilling,
        updatedAt: serverTimestamp(),
        updatedBy: currentUid,
      }, { merge: true });
      setUsers((current) => current.map((item) => item.uid === managedUser.uid ? managedUser : item));
      setFeedback(`Ficha administrativa actualizada para ${managedUser.name}.`);
    } catch (error) {
      console.error("No pudimos guardar la ficha administrativa", error);
      setFeedback("No pudimos guardar la ficha administrativa.");
    } finally {
      setSaving("");
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (user.uid === currentUid || user.role === "admin") return setFeedback("Las cuentas administradoras no pueden eliminarse desde este panel.");
    const identifier = user.username || user.email;
    const confirmation = window.prompt(`Esta acción elimina definitivamente a ${user.name}. Para confirmar, escribí exactamente: ${identifier}`);
    if (confirmation !== identifier) return;
    const current = auth.currentUser;
    if (!current) return setFeedback("Tu sesión ya no está activa.");
    setSaving(user.uid);
    try {
      const response = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await current.getIdToken(true)}` },
        body: JSON.stringify({ userId: user.uid, confirmation }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo eliminar el usuario.");
      setManagedUser(null);
      setUsers((currentUsers) => currentUsers.filter((item) => item.uid !== user.uid));
      setFeedback(`Se eliminó definitivamente la cuenta de ${user.name}.`);
    } catch (error) {
      console.error("No pudimos eliminar el usuario", error);
      setFeedback(error instanceof Error ? error.message : "No se pudo eliminar el usuario.");
    } finally {
      setSaving("");
    }
  };

  const assignLaboratoryLogo = async (user: AdminUser, file: File) => {
    setSaving(user.uid);
    setFeedback("");
    try {
      const logo = await prepareLaboratoryLogo(file);
      await updateDoc(doc(db, "users", user.uid), {
        laboratoryLogoData: logo, laboratoryLogoUpdatedAt: serverTimestamp(), laboratoryLogoUpdatedBy: currentUid,
      });
      setUsers((current) => current.map((item) => item.uid === user.uid ? { ...item, hasLabLogo: true } : item));
      setFeedback(`Logo asignado a ${user.name}. Aparecerá en PDF y Excel cuando el laboratorio recargue su sesión.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo guardar el logo.");
    } finally {
      setSaving("");
    }
  };

  const removeLaboratoryLogo = async (user: AdminUser) => {
    if (!window.confirm(`¿Quitar el logo de ${user.name} de sus próximos informes?`)) return;
    setSaving(user.uid);
    setFeedback("");
    try {
      await updateDoc(doc(db, "users", user.uid), {
        laboratoryLogoData: deleteField(), laboratoryLogoUpdatedAt: serverTimestamp(), laboratoryLogoUpdatedBy: currentUid,
      });
      setUsers((current) => current.map((item) => item.uid === user.uid ? { ...item, hasLabLogo: false } : item));
      setFeedback(`Se quitó el logo de ${user.name}.`);
    } catch (error) {
      console.error("No pudimos quitar el logo", error);
      setFeedback("No se pudo quitar el logo del laboratorio.");
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
  const laboratoryUsers = users.filter((user) => user.role === "laboratory").length;

  const createManagedUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const current = auth.currentUser;
    if (!current) return setFeedback("Tu sesión ya no está activa.");
    setCreatingUser(true);
    setFeedback("");
    try {
      const form = new FormData(formElement);
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await current.getIdToken(true)}` },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo crear el usuario.");
      formElement.reset();
      setShowCreateUser(false);
      await loadUsers();
      setFeedback(`Cuenta creada. Usuario de acceso: ${result.username}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "No se pudo crear el usuario.");
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <>
      <header className="topbar module-topbar admin-header">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN</span>
          <h1>Usuarios, suscripciones y pagos</h1>
          <p>Administrá accesos y llevá el seguimiento comercial sin alterar los datos operativos.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="outline-btn" type="button" onClick={() => setShowCreateUser((visible) => !visible)}>
            {showCreateUser ? "Cancelar alta" : "+ Crear usuario"}
          </button>
          <button className="outline-btn" style={{ color: "var(--red)", borderColor: "var(--red)" }} type="button" onClick={cleanupTestUsers} disabled={cleaning}>
            {cleaning ? "Eliminando…" : "Borrar usuarios de prueba"}
          </button>
          <button className="outline-btn" type="button" onClick={loadUsers}>
            Actualizar lista
          </button>
        </div>
      </header>

      {showCreateUser && <section className="panel admin-create-user">
        <div><span className="eyebrow">ALTA ADMINISTRATIVA</span><h2>Crear acceso listo para usar</h2><p>El correo de contacto es opcional y no se utiliza para iniciar sesión.</p></div>
        <form onSubmit={createManagedUser}>
          <label>Nombre o laboratorio<input name="name" required /></label>
          <label>Nombre de usuario<input name="username" minLength={3} maxLength={40} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" required /></label>
          <label>Contraseña provisoria<input name="password" type="text" minLength={8} required /></label>
          <label>Correo de contacto opcional<input name="contactEmail" type="email" /></label>
          <label>Tipo de cuenta<select name="role" defaultValue="laboratory"><option value="laboratory">Laboratorio</option><option value="veterinarian">Veterinario</option></select></label>
          <button className="outline-btn" disabled={creatingUser}>{creatingUser ? "Creando…" : "Crear cuenta activa"}</button>
        </form>
      </section>}

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
          <span>Laboratorios</span>
          <strong>{laboratoryUsers}</strong>
          <small>cuentas de laboratorio</small>
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

      <nav className="admin-account-tabs" aria-label="Tipos de cuenta">
        <button className={accountType === "veterinarian" ? "active" : ""} onClick={() => setAccountType("veterinarian")}>Veterinarios <span>{users.filter((user) => user.role === "veterinarian").length}</span></button>
        <button className={accountType === "laboratory" ? "active" : ""} onClick={() => setAccountType("laboratory")}>Laboratorios <span>{users.filter((user) => user.role === "laboratory").length}</span></button>
        <button className={accountType === "admin" ? "active" : ""} onClick={() => setAccountType("admin")}>Administradores <span>{users.filter((user) => user.role === "admin").length}</span></button>
      </nav>

      <section className="panel admin-users-panel">
        <div className="admin-users-toolbar">
          <div>
            <h2>{accountType === "laboratory" ? "Laboratorios" : accountType === "admin" ? "Administradores" : "Veterinarios"}</h2>
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
          <span>Contacto</span>
          <span>Tipo</span>
          <span>Plan / servicio</span>
          <span>Estado</span>
          <span>Acciones</span>
        </div>
        {loading ? (
          <div className="admin-users-empty">Cargando usuarios…</div>
        ) : visibleUsers.length ? (
          visibleUsers.map((user) => (
            <article className="admin-user-row subscription-admin-grid" key={user.uid}>
              <div>
                <b>{user.name}</b>
                <small>
                  {user.username ? `Usuario: ${user.username}` : user.email}
                  {user.role === "admin"
                    ? " · Administrador"
                    : user.role === "laboratory"
                      ? " · Laboratorio"
                      : " · Veterinario"}
                </small>
                {user.contactEmail && <small>Contacto: {user.contactEmail}</small>}
                {user.request?.status === "pending" && (
                  <em>Solicitó: {PLAN_DEFINITIONS[user.request.plan].name}</em>
                )}
                {user.role === "laboratory" && <div className="admin-logo-actions">
                  <small>{user.hasLabLogo ? "Logo asignado" : "Sin logo para informes"}</small>
                  <label className="admin-logo-upload">{user.hasLabLogo ? "Cambiar logo" : "Asignar logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving === user.uid} onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void assignLaboratoryLogo(user, file);
                      event.target.value = "";
                    }} />
                  </label>
                  {user.hasLabLogo && <button type="button" disabled={saving === user.uid} onClick={() => removeLaboratoryLogo(user)}>Quitar</button>}
                </div>}
              </div>
              <div className="admin-contact-cell">
                <b>{user.adminBilling.contactName || "Sin responsable"}</b>
                <small>{user.contactEmail || "Sin correo de contacto"}</small>
                <small>{user.adminBilling.phone || "Sin teléfono"}</small>
              </div>
              <select
                value={user.role}
                disabled={user.uid === currentUid}
                onChange={(event) => {
                  const role = event.target.value;
                  updateLocal(user.uid, { role, ...(role === "laboratory" ? { plan: "laboratory", subscriptionStatus: "pending" } : {}) });
                }}
              >
                <option value="veterinarian">Veterinario</option>
                <option value="laboratory">Laboratorio</option>
                {user.role === "admin" && <option value="admin">Administrador</option>}
              </select>
              <select disabled={user.role === "admin"} value={plans.includes(user.plan) ? user.plan : "unassigned"} onChange={(event) => updateLocal(user.uid, { plan: event.target.value as PlanId })}>
                {plans.map((plan) => <option key={plan} value={plan}>{PLAN_DEFINITIONS[plan].name}</option>)}
              </select>
              <select
                className={`subscription-${user.subscriptionStatus}`}
                value={user.subscriptionStatus}
                disabled={user.role === "admin"}
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
              ) : (
                <div className="admin-row-actions">
                  {user.role !== "admin" && <button type="button" onClick={() => saveAccess(user)} disabled={saving === user.uid}>{saving === user.uid ? "Guardando…" : "Guardar acceso"}</button>}
                  <button className="secondary" type="button" onClick={() => openManagement(user)}>Gestionar</button>
                  {user.paymentMethod === "mercadopago" && user.mercadoPagoPreapprovalId && !user.subscriptionCancelAtPeriodEnd && ["active", "payment_retry"].includes(user.subscriptionStatus) && <button className="danger-link" type="button" onClick={() => cancelMercadoPago(user)} disabled={saving === user.uid}>Cancelar MP</button>}
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="admin-users-empty">
            No encontramos usuarios con esos filtros.
          </div>
        )}
      </section>

      {managedUser && <div className="admin-detail-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setManagedUser(null);
      }}>
        <section className="admin-detail-panel" role="dialog" aria-modal="true" aria-label={`Gestionar ${managedUser.name}`}>
          <header>
            <div><span className="eyebrow">FICHA ADMINISTRATIVA</span><h2>{managedUser.name}</h2><p>{managedUser.username ? `Usuario: ${managedUser.username}` : managedUser.email}</p></div>
            <button className="admin-detail-close" type="button" onClick={() => setManagedUser(null)} aria-label="Cerrar">×</button>
          </header>

          <div className="admin-detail-grid">
            <label>Responsable<input value={managedUser.adminBilling.contactName} onChange={(event) => changeBilling("contactName", event.target.value)} /></label>
            <label>Teléfono / WhatsApp<input value={managedUser.adminBilling.phone} onChange={(event) => changeBilling("phone", event.target.value)} /></label>
            <label>CUIT<input value={managedUser.adminBilling.taxId} onChange={(event) => changeBilling("taxId", event.target.value)} placeholder="00-00000000-0" /></label>
            <label>Localidad / provincia<input value={managedUser.adminBilling.location} onChange={(event) => changeBilling("location", event.target.value)} /></label>
          </div>
          <button className="admin-primary-action" type="button" disabled={saving === managedUser.uid} onClick={saveAdministrativeDetails}>{saving === managedUser.uid ? "Guardando…" : "Guardar datos"}</button>

          {managedUser.uid !== currentUid && managedUser.role !== "admin" && <footer className="admin-danger-zone"><div><b>Eliminar usuario</b><small>Elimina la cuenta, su perfil y sus datos asociados. Esta acción no se puede deshacer.</small></div><button type="button" disabled={saving === managedUser.uid} onClick={() => deleteUser(managedUser)}>Eliminar definitivamente</button></footer>}
        </section>
      </div>}
    </>
  );
}
