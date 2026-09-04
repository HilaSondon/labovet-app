"use client";

import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { auth, db } from "../lib/firebase";
import AdminUsersPanel from "../components/AdminUsersPanel";
import { AccountAccess, useSingleSession } from "../components/AccountAccess";
import Brand from "../components/Brand";

type Profile = {
  name?: string;
  email?: string;
  role?: "veterinarian" | "laboratory" | "admin";
  subscriptionStatus?: "pending" | "trial" | "active" | "expired" | "suspended";
};

type AuthMode = "login" | "register";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"sigatm" | "admin">("sigatm");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (current) => {
        setUser(current);
        setProfile(null);
        if (current) {
          try {
            const snapshot = await getDoc(doc(db, "users", current.uid));
            setProfile(snapshot.exists() ? (snapshot.data() as Profile) : {});
          } catch (error) {
            console.error("No pudimos cargar el perfil", error);
            setProfile({});
          }
        }
        setLoading(false);
      }),
    [],
  );

  const sessionAllowed = useSingleSession(
    user,
    Boolean(
      user &&
      profile &&
      profile.role !== "admin" &&
      (!profile.subscriptionStatus ||
        ["active", "trial"].includes(profile.subscriptionStatus)),
    ),
  );

  if (loading) return <LoadingScreen />;
  if (!user) return <PublicHome />;
  if (!profile) return <LoadingScreen />;

  const isAdmin = profile.role === "admin";
  const enabled =
    isAdmin ||
    !profile.subscriptionStatus ||
    ["active", "trial"].includes(profile.subscriptionStatus);

  if (profile.role === "laboratory") {
    return <ArchivedAccount onExit={() => signOut(auth)} />;
  }

  if (!enabled) {
    return (
      <AccountAccess
        user={user}
        status={profile.subscriptionStatus || "pending"}
        onExit={() => signOut(auth)}
      />
    );
  }
  if (sessionAllowed === null) return <LoadingScreen />;
  if (!sessionAllowed)
    return (
      <main className="access-status">
        <Brand />
        <span>SEGURIDAD DE LA CUENTA</span>
        <h1>Esta sesión ya no está activa</h1>
        <p>
          VetConver permite hasta dos dispositivos registrados y un uso
          simultáneo. Si ingresaste desde otro equipo, esta sesión se cerró
          automáticamente.
        </p>
        <a href="https://wa.me/5492244429316" target="_blank" rel="noreferrer">
          Administrar dispositivos
        </a>
        <button onClick={() => signOut(auth)}>Cerrar sesión</button>
      </main>
    );

  return (
    <main className="workspace">
      <header className="workspace-bar">
        <div className="workspace-brand">
          <Brand compact />
          <span>Planillas SIGATM</span>
        </div>
        <nav>
          <button
            className={view === "sigatm" ? "active" : ""}
            onClick={() => setView("sigatm")}
          >
            Planillas SIGATM
          </button>
          {isAdmin && (
            <button
              className={view === "admin" ? "active" : ""}
              onClick={() => setView("admin")}
            >
              Usuarios
            </button>
          )}
        </nav>
        <div className="user-menu">
          <span>
            <b>{profile.name || user.displayName || "Usuario"}</b>
            <small>{isAdmin ? "Administrador" : "Veterinario"}</small>
          </span>
          <button onClick={() => signOut(auth)}>Salir</button>
        </div>
      </header>
      {view === "admin" && isAdmin ? (
        <section className="admin-page">
          <AdminUsersPanel currentUid={user.uid} />
        </section>
      ) : (
        <iframe
          className="sigatm-frame"
          src="/sigatm/index.html?embedded=1"
          title="VetConver Planillas SIGATM"
        />
      )}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <Brand />
      <span>Cargando…</span>
    </main>
  );
}

function PublicHome() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  return (
    <main className="public-site">
      <header className="public-nav">
        <a href="#inicio" className="public-logo">
          <Brand />
          <span>Planillas SIGATM</span>
        </a>
        <nav>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#rubros">Rubros</a>
          <a href="#servicio">Servicio administrativo</a>
        </nav>
        <div>
          <button className="nav-login" onClick={() => setAuthMode("login")}>
            Ingresar
          </button>
          <button
            className="nav-register"
            onClick={() => setAuthMode("register")}
          >
            Registrarse
          </button>
        </div>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-copy">
          <span className="kicker">PLANILLAS LISTAS PARA SIGATM</span>
          <h1>
            De Excel a SIGATM <em>en segundos.</em>
          </h1>
          <p>
            Transformá listados de Excel, mensajes de WhatsApp o datos escritos
            a mano en una planilla compatible con SIGATM, sin acomodar columnas
            ni memorizar códigos.
          </p>
          <div className="hero-actions">
            <button onClick={() => setAuthMode("register")}>
              Preparar una planilla <span>→</span>
            </button>
            <a href="#como-funciona">Ver cómo funciona</a>
          </div>
          <div className="trust-row">
            <span>✓ Validación previa</span>
            <span>✓ Carga inteligente</span>
            <span>✓ Información privada</span>
          </div>
        </div>
        <div className="hero-preview">
          <div className="preview-top">
            <span>VETCONVER · PLANILLAS SIGATM</span>
            <i>Archivo listo</i>
          </div>
          <div className="preview-title">
            <small>NUEVA PLANILLA</small>
            <h2>Pegá, revisá y descargá.</h2>
          </div>
          <div className="preview-jobs">
            <article>
              <span>🐴</span>
              <b>Anemia equina</b>
              <small>Identificación variable</small>
            </article>
            <article className="selected">
              <span>🐄</span>
              <b>Brucelosis bovina</b>
              <small>Caravana · bovinos</small>
            </article>
            <article>
              <span>🐔</span>
              <b>Aves</b>
              <small>Identificación opcional</small>
            </article>
          </div>
          <div className="preview-data">
            <span>032105465213</span>
            <b>VACA</b>
            <i>✓</i>
          </div>
          <div className="preview-data">
            <span>70264-2</span>
            <b>VAQUILLONA</b>
            <i>✓</i>
          </div>
          <button onClick={() => setAuthMode("register")}>
            Descargar Excel SIGATM ↓
          </button>
        </div>
      </section>

      <section className="how" id="como-funciona">
        <div className="section-heading">
          <span className="kicker">CÓMO FUNCIONA</span>
          <h2>Una carga simple, aunque los datos lleguen desordenados.</h2>
          <p>
            Elegís el trabajo y VetConver configura los valores habituales. Solo
            corregís lo que la validación marque y descargás el archivo con los
            códigos requeridos.
          </p>
        </div>
        <div className="step-grid">
          <article>
            <b>1</b>
            <h3>Pegá o escribí</h3>
            <p>
              Copiá columnas de Excel, pegá el detalle recibido por WhatsApp o
              cargá unas pocas muestras manualmente.
            </p>
          </article>
          <article>
            <b>2</b>
            <h3>Revisá antes de cargar</h3>
            <p>
              Aplicá categoría, edad o estado a todo el lote y detectá datos
              faltantes, repetidos o inválidos.
            </p>
          </article>
          <article>
            <b>3</b>
            <h3>Descargá y subí</h3>
            <p>
              Elegí el nombre del archivo y seguí el instructivo visual para
              incorporarlo correctamente a SIGATM.
            </p>
          </article>
        </div>
      </section>

      <section className="scope" id="rubros">
        <div className="scope-copy">
          <span className="kicker">RUBROS CONTEMPLADOS</span>
          <h2>Preparado para el trabajo veterinario habitual.</h2>
          <p>
            La herramienta adapta especie, identificación, categoría y edad
            según el análisis. Después podés cambiar cualquier dato si el caso
            lo requiere.
          </p>
        </div>
        <div className="scope-list">
          <article>
            <span>🐴</span>
            <div>
              <b>Equinos</b>
              <p>Anemia infecciosa equina</p>
            </div>
          </article>
          <article>
            <span>🐄</span>
            <div>
              <b>Bovinos</b>
              <p>Brucelosis y leucosis</p>
            </div>
          </article>
          <article>
            <span>🐑</span>
            <div>
              <b>Ovinos</b>
              <p>Brucella ovis</p>
            </div>
          </article>
          <article>
            <span>🐖</span>
            <div>
              <b>Porcinos</b>
              <p>Aujeszky y triquina</p>
            </div>
          </article>
          <article>
            <span>🐔</span>
            <div>
              <b>Aves</b>
              <p>Categorías e identificación opcional</p>
            </div>
          </article>
        </div>
      </section>

      <section className="support">
        <div className="support-icon">↻</div>
        <div>
          <span>ACOMPAÑAMIENTO</span>
          <h2>La herramienta evoluciona junto con SIGATM.</h2>
          <p>
            Nos mantenemos en constante asesoramiento sobre los cambios que
            pueda incorporar SIGATM para actualizar el estandarizador y ayudarte
            ante cualquier duda.
          </p>
        </div>
        <aside>
          <small>LÍNEA DIRECTA</small>
          <a href="tel:2244429316">2244-429316</a>
          <span>Correo de consultas: próximamente</span>
        </aside>
      </section>

      <section className="service" id="servicio">
        <span className="service-tag">SERVICIO ADMINISTRATIVO COMPLETO</span>
        <div className="service-grid">
          <div>
            <h2>¿Preferís no ocuparte de la carga? Lo hacemos por vos.</h2>
            <p>
              Nos enviás por WhatsApp las fotos de los protocolos y generamos
              correctamente el acta completa en SIGATM, habitualmente en menos
              de 24 horas.
            </p>
            <a
              href="https://wa.me/5492244429316"
              target="_blank"
              rel="noreferrer"
            >
              Consultar por WhatsApp <span>→</span>
            </a>
          </div>
          <div className="service-promises">
            <article>
              <b>Sin clave fiscal</b>
              <p>No solicitamos tu contraseña ni acceso a tu cuenta.</p>
            </article>
            <article>
              <b>Sin pedir tu CUIT</b>
              <p>Realizamos el trámite con nuestro propio CUIT.</p>
            </article>
            <article>
              <b>Confidencialidad y responsabilidad</b>
              <p>
                Tu información se utiliza únicamente para gestionar el acta.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <Brand />
        <h2>
          Menos tiempo preparando planillas.
          <br />
          Más tiempo ejerciendo.
        </h2>
        <button onClick={() => setAuthMode("register")}>Crear mi cuenta</button>
      </section>
      <footer className="public-footer">
        <span>© {new Date().getFullYear()} VetConver</span>
        <b>Planillas SIGATM para veterinarios</b>
        <a href="tel:2244429316">2244-429316</a>
      </footer>
      {authMode && (
        <AuthModal
          mode={authMode}
          onMode={setAuthMode}
          onClose={() => setAuthMode(null)}
        />
      )}
    </main>
  );
}

function AuthModal({
  mode,
  onMode,
  onClose,
}: {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    try {
      if (mode === "register") {
        const name = String(data.get("name") || "").trim();
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await updateProfile(credential.user, { displayName: name });
        await setDoc(doc(db, "users", credential.user.uid), {
          name,
          email,
          role: "veterinarian",
          plan: "unassigned",
          subscriptionStatus: "pending",
          createdAt: serverTimestamp(),
        });
        await sendEmailVerification(credential.user);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (caught) {
      const code = String((caught as { code?: string }).code || "");
      setError(
        code.includes("email-already-in-use")
          ? "Ese correo ya está registrado."
          : code.includes("invalid-credential")
            ? "Correo o contraseña incorrectos."
            : code.includes("weak-password")
              ? "La contraseña debe tener al menos 6 caracteres."
              : code.includes("invalid-email")
                ? "Ingresá un correo válido."
                : "No pudimos completar el acceso. Intentá nuevamente.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        <Brand />
        <div className="modal-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => onMode("login")}
          >
            Iniciar sesión
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => onMode("register")}
          >
            Registrarse
          </button>
        </div>
        <h2 id="auth-title">
          {mode === "login" ? "Bienvenido" : "Creá tu cuenta"}
        </h2>
        <p>
          {mode === "login"
            ? "Ingresá para preparar tus planillas."
            : "Registro exclusivo para profesionales veterinarios."}
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Nombre y apellido
              <input name="name" autoComplete="name" required />
            </label>
          )}
          <label>
            Correo electrónico
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Contraseña
            <input
              name="password"
              type="password"
              minLength={6}
              autoComplete={
                mode === "register" ? "new-password" : "current-password"
              }
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="submit-auth" disabled={loading}>
            {loading
              ? "Procesando…"
              : mode === "login"
                ? "Ingresar"
                : "Crear cuenta"}
            <span>→</span>
          </button>
        </form>
      </section>
    </div>
  );
}

function ArchivedAccount({ onExit }: { onExit: () => void }) {
  return (
    <main className="access-status">
      <Brand />
      <span>CUENTA CONSERVADA</span>
      <h1>El módulo para laboratorios no está disponible.</h1>
      <p>
        La información anterior permanece guardada, pero esta etapa de VetConver
        está destinada exclusivamente a profesionales veterinarios.
      </p>
      <button onClick={onExit}>Cerrar sesión</button>
    </main>
  );
}
