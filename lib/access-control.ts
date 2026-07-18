export type PlanId =
  | "unassigned"
  | "small_animals"
  | "large_animals"
  | "administrative_service";

export type SubscriptionStatus =
  | "pending"
  | "trial"
  | "active"
  | "expired"
  | "suspended";

export type PlanPermissions = {
  smallAnimals: boolean;
  largeAnimals: boolean;
  stock: boolean;
  sigatm: boolean;
  managedService: boolean;
};

export type UserAccess = {
  role: "veterinarian" | "admin";
  plan: PlanId;
  status: SubscriptionStatus;
  planName: string;
  permissions: PlanPermissions;
  endsAt?: string;
  legacyAccess?: boolean;
};

export const PLAN_DEFINITIONS: Record<
  PlanId,
  { name: string; permissions: PlanPermissions }
> = {
  unassigned: {
    name: "Sin plan asignado",
    permissions: {
      smallAnimals: false,
      largeAnimals: false,
      stock: false,
      sigatm: false,
      managedService: false,
    },
  },
  small_animals: {
    name: "Pequeños animales",
    permissions: {
      smallAnimals: true,
      largeAnimals: false,
      stock: true,
      sigatm: false,
      managedService: false,
    },
  },
  large_animals: {
    name: "Grandes animales",
    permissions: {
      smallAnimals: true,
      largeAnimals: true,
      stock: true,
      sigatm: true,
      managedService: false,
    },
  },
  administrative_service: {
    name: "Servicio administrativo",
    permissions: {
      smallAnimals: true,
      largeAnimals: true,
      stock: true,
      sigatm: true,
      managedService: true,
    },
  },
};

const isPlanId = (value: unknown): value is PlanId =>
  typeof value === "string" && value in PLAN_DEFINITIONS;

const isSubscriptionStatus = (value: unknown): value is SubscriptionStatus =>
  ["pending", "trial", "active", "expired", "suspended"].includes(
    String(value),
  );

export function resolveUserAccess(data?: Record<string, unknown>): UserAccess {
  const role = data?.role === "admin" ? "admin" : "veterinarian";
  const hasSubscriptionModel = isSubscriptionStatus(data?.subscriptionStatus);

  // Compatibilidad: las cuentas creadas antes de incorporar suscripciones
  // conservan acceso completo hasta que el administrador les asigne un plan.
  const legacyAccess = Boolean(data) && !hasSubscriptionModel;
  const plan: PlanId = legacyAccess
    ? "large_animals"
    : isPlanId(data?.plan)
      ? data.plan
      : "unassigned";
  let status: SubscriptionStatus = legacyAccess
    ? "active"
    : isSubscriptionStatus(data?.subscriptionStatus)
      ? data.subscriptionStatus
      : "pending";
  const endsAt = typeof data?.subscriptionEndsAt === "string"
    ? data.subscriptionEndsAt
    : undefined;
  if (
    !legacyAccess &&
    endsAt &&
    (status === "active" || status === "trial") &&
    /^\d{2}\/\d{2}\/\d{4}$/.test(endsAt)
  ) {
    const [day, month, year] = endsAt.split("/").map(Number);
    const expiration = new Date(year, month - 1, day, 23, 59, 59);
    if (expiration.getTime() < Date.now()) status = "expired";
  }
  const enabled = role === "admin" || status === "active" || status === "trial";
  const permissions = role === "admin"
    ? PLAN_DEFINITIONS.administrative_service.permissions
    : enabled
      ? PLAN_DEFINITIONS[plan].permissions
      : PLAN_DEFINITIONS.unassigned.permissions;

  return {
    role,
    plan,
    status,
    planName: PLAN_DEFINITIONS[plan].name,
    permissions,
    endsAt,
    legacyAccess,
  };
}
