"use client";

import "./pricing.css";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import SubscriptionPanel from "../components/SubscriptionPanel";
import GuidePanel from "../components/GuidePanel";
import VisitAnalyticsPanel from "../components/VisitAnalyticsPanel";
import LaboratoryWorkspace from "../components/LaboratoryWorkspace";
import Brand from "../components/Brand";
import { trackEvent } from "../lib/analytics-client";

type Profile = {
  name?: string;
  email?: string;
  role?: "veterinarian" | "laboratory" | "admin";
  subscriptionStatus?: "pending" | "trial" | "active" | "payment_retry" | "expired" | "suspended";
  trialStartedAtIso?: string;
  subscriptionEndsAt?: string;
  subscriptionEndsAtIso?: string | null;
  subscriptionCancelAtPeriodEnd?: boolean;
  paymentMethod?: "mercadopago" | "transfer";
  mercadoPagoPreapprovalId?: string;
  paymentGraceEndsAtIso?: string | null;
};

type AuthMode = "login" | "register";

export default function Home({ publicPage = "general" }: { publicPage?: "general" | "veterinarians" | "laboratories" | "about" }) {
  const sigatmFrame = useRef<HTMLIFrameElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [view, setView] = useState<"sigatm" | "sigatm-guide" | "vetconver-guide" | "subscription" | "admin" | "analytics" | "laboratory">("sigatm");
  const [laboratorySection, setLaboratorySection] = useState<"protocol" | "anemiaBatch" | "profile" | "vets" | "merge">("protocol");

  useEffect(
    () =>
      onAuthStateChanged(auth, async (current) => {
        setUser(current);
        setProfile(null);
        if (!current) sessionStorage.removeItem("vetconverSigatmAuthorized");
        if (current) {
          try {
            const snapshot = await getDoc(doc(db, "users", current.uid));
            let loaded = snapshot.exists() ? (snapshot.data() as Profile) : {};
            if (current.emailVerified && loaded.role !== "laboratory" && loaded.subscriptionStatus === "pending" && !loaded.trialStartedAtIso) {
              const response = await fetch("/api/subscriptions/start-trial", {
                method: "POST",
                headers: { Authorization: `Bearer ${await current.getIdToken(true)}` },
              });
              if (response.ok) loaded = { ...loaded, ...(await response.json()).profile };
            }
            if (current.emailVerified || loaded.role === "admin") {
              const accessResponse = await fetch("/api/access/status", {
                headers: { Authorization: `Bearer ${await current.getIdToken()}` },
              });
              const access = await accessResponse.json().catch(() => ({}));
              const validAccessStatuses = ["pending", "trial", "active", "payment_retry", "expired", "suspended"];
              if (validAccessStatuses.includes(access.status)) loaded = { ...loaded, subscriptionStatus: access.status };
            }
            if (loaded.role === "laboratory") setView("laboratory");
            setProfile(loaded);
          } catch (error) {
            console.error("No pudimos cargar el perfil", error);
            setProfile({});
          }
        }
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    const initial = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (profile?.role === "admin") localStorage.setItem("vetconverAdminBrowser", "1");
  }, [profile?.role]);

  const authorizeSigatm = async () => {
    if (!user || !sigatmFrame.current?.contentWindow) return;
    const token = await user.getIdToken();
    sigatmFrame.current.contentWindow.postMessage(
      { type: "vetconver-access-token", token },
      window.location.origin,
    );
  };

  const cancellationExpired = Boolean(
    profile?.subscriptionCancelAtPeriodEnd &&
      profile.subscriptionEndsAtIso &&
      currentTime > 0 &&
      new Date(profile.subscriptionEndsAtIso).getTime() <= currentTime,
  );
  const trialExpired = Boolean(
    profile?.subscriptionStatus === "trial" &&
      profile.subscriptionEndsAtIso &&
      currentTime > 0 &&
      new Date(profile.subscriptionEndsAtIso).getTime() <= currentTime,
  );
  const transferEnd = profile?.subscriptionEndsAt && /^\d{2}\/\d{2}\/\d{4}$/.test(profile.subscriptionEndsAt)
    ? new Date(profile.subscriptionEndsAt.split("/").reverse().join("-") + "T23:59:59").getTime()
    : 0;
  const transferExpired = Boolean(
    profile?.subscriptionStatus === "active" &&
      profile.paymentMethod === "transfer" &&
      transferEnd > 0 &&
      currentTime > 0 &&
      transferEnd <= currentTime,
  );
  const accessExpired = cancellationExpired || trialExpired || transferExpired;
  const retryExpired = Boolean(
    profile?.subscriptionStatus === "payment_retry" &&
      profile.paymentGraceEndsAtIso &&
      currentTime > 0 &&
      new Date(profile.paymentGraceEndsAtIso).getTime() <= currentTime,
  );

  const sessionAllowed = useSingleSession(
    user,
    Boolean(
      user &&
      profile &&
      profile.role !== "admin" &&
      !accessExpired && !retryExpired &&
      ["active", "trial", "payment_retry"].includes(profile.subscriptionStatus || "pending"),
    ),
  );

  if (loading) return <LoadingScreen />;
  if (!user) return publicPage === "veterinarians" ? <PublicHome /> : <MarketingHome page={publicPage} />;
  if (!profile) return <LoadingScreen />;

  const isAdmin = profile.role === "admin";
  const isLaboratory = profile.role === "laboratory";
  const enabled = isAdmin || (!accessExpired && !retryExpired &&
    ["active", "trial", "payment_retry"].includes(profile.subscriptionStatus || "pending"));

  if (isLaboratory && (!user.emailVerified || profile.subscriptionStatus !== "active")) {
    return <LaboratoryPending user={user} verified={user.emailVerified} status={profile.subscriptionStatus || "pending"} onExit={() => signOut(auth)} />;
  }

  if (!enabled) {
    return (
      <AccountAccess
        user={user}
        status={accessExpired || retryExpired ? "expired" : profile.subscriptionStatus || "pending"}
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
        </div>
        <nav>
          {!isLaboratory && <button
            className={view === "sigatm" ? "active" : ""}
            onClick={() => setView("sigatm")}
          >
            Planillas SIGATM
          </button>}
          {!isLaboratory && <button className={view === "sigatm-guide" ? "active" : ""} onClick={() => setView("sigatm-guide")}>Cómo cargar en SIGATM</button>}
          {!isLaboratory && <button className={view === "vetconver-guide" ? "active" : ""} onClick={() => setView("vetconver-guide")}>Cómo usar VetConver</button>}
          {isLaboratory ? ([
            ["protocol", "Nuevo protocolo"],
            ["anemiaBatch", "Anemias masivas"],
            ["profile", "Mis datos"],
            ["vets", "Veterinarios"],
            ["merge", "Unir JSON"],
          ] as const).map(([section, label]) => <button key={section} className={laboratorySection === section ? "active" : ""} onClick={() => setLaboratorySection(section)}>{label}</button>) : isAdmin && <button className={view === "laboratory" ? "active" : ""} onClick={() => setView("laboratory")}>Laboratorios</button>}
          {!isAdmin && !isLaboratory && (
            <>
              <button className={view === "subscription" ? "active" : ""} onClick={() => setView("subscription")}>Mi suscripción</button>
            </>
          )}
          {isAdmin && (
            <>
              <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>Usuarios</button>
              <button className={view === "analytics" ? "active" : ""} onClick={() => setView("analytics")}>Visitas</button>
            </>
          )}
        </nav>
        <div className="user-menu">
          <span>
            <b>{profile.name || user.displayName || "Usuario"}</b>
            <small>{isAdmin ? "Administrador" : isLaboratory ? "Laboratorio" : "Veterinario"}</small>
          </span>
          <button onClick={() => signOut(auth)}>Salir</button>
        </div>
      </header>
      <iframe
        ref={sigatmFrame}
        className="sigatm-frame"
        src="/sigatm/index.html?embedded=1"
        title="VetConver Planillas SIGATM"
        onLoad={authorizeSigatm}
        style={{ display: view === "sigatm" && !isLaboratory ? "block" : "none" }}
      />
      {view === "laboratory" && (isLaboratory || isAdmin) ? (
        <LaboratoryWorkspace user={user} isAdmin={isAdmin} section={laboratorySection} />
      ) : view === "admin" && isAdmin ? (
        <section className="admin-page">
          <AdminUsersPanel currentUid={user.uid} />
        </section>
      ) : view === "analytics" && isAdmin ? (
        <VisitAnalyticsPanel user={user} />
      ) : view === "subscription" && !isAdmin ? (
        <SubscriptionPanel
          user={user}
          profile={profile}
          onCancelled={(updates) => setProfile((current) => current ? ({ ...current, ...updates }) : current)}
        />
      ) : view === "sigatm-guide" ? (
        <GuidePanel key="sigatm-guide" guide="sigatm" />
      ) : view === "vetconver-guide" ? (
        <GuidePanel key="vetconver-guide" guide="vetconver" />
      ) : null}
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

function LandingHeader({ page, onLogin }: { page: "general" | "veterinarians" | "laboratories" | "about"; onLogin: () => void }) {
  return <header className="landing-nav">
    <Link href="/" aria-label="VetConver, ir al inicio"><Brand /></Link>
    <nav aria-label="Navegación principal">
      <Link className={page === "general" ? "selected" : ""} href="/">Inicio</Link>
      <Link className={page === "veterinarians" ? "selected" : ""} href="/veterinarios">Veterinarios</Link>
      <Link className={page === "laboratories" ? "selected" : ""} href="/laboratorios">Laboratorios</Link>
      <Link className={page === "about" ? "selected" : ""} href="/sobre-vetconver">Sobre mí</Link>
      {(page === "veterinarians" || page === "laboratories") && <><a href="#como-funciona">Cómo funciona</a><a href="#rubros">Rubros</a></>}
      {page === "veterinarians" && <a href="#servicio">Servicio administrativo</a>}
    </nav>
    <button className="landing-login" onClick={onLogin}>Ingresar</button>
  </header>;
}

function MarketingHome({ page }: { page: "general" | "laboratories" | "about" }) {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const initialAccountType = page === "laboratories" ? "laboratory" : "veterinarian";
  const cards = [
    {
      kind: "veterinarians", href: "/veterinarios", eyebrow: "PARA VETERINARIOS", title: "Simplificá la carga en SIGATM.",
      description: "Convertí tus listados en planillas listas para SIGATM en segundos o delegá directamente la generación de tus actas.",
      benefits: ["Planillas SIGATM listas en segundos.", "Validación y estandarización automática de los datos.", "Servicio opcional de generación completa de actas."],
      action: "Conocer la herramienta",
    },
    {
      kind: "laboratories", href: "/laboratorios", eyebrow: "PARA LABORATORIOS", title: "Del acta PDF a GRECERT en pocos pasos.",
      description: "Cargá el acta, completá el protocolo y descargá un JSON listo para adjuntar en GRECERT, junto con informes detallados en PDF y Excel.",
      benefits: ["JSON para carga rápida en GRECERT.", "Informes detallados en PDF y Excel.", "Atajos para completar muestras y reactivos.", "Herramienta complementaria para el laboratorio."],
      action: "Conocer la herramienta",
    },
    {
      kind: "about", href: "/sobre-vetconver", eyebrow: "QUIÉN ESTÁ DETRÁS", title: "Una herramienta creada desde la experiencia real.",
      description: "Soy Hilario Sondón. Desarrollé VetConver a partir de más de 4 años de experiencia trabajando en la administración de un laboratorio veterinario, buscando simplificar tareas que conozco de primera mano.",
      benefits: ["Más de 4 años de experiencia en laboratorio veterinario.", "Conocimiento práctico de SIGATM y GRECERT.", "Atención y asesoramiento directo."],
      action: "Conocé mi historia",
    },
  ] as const;
  return <main className="landing-site">
    <LandingHeader page={page} onLogin={() => setAuthMode("login")} />

    {page === "general" ? <>
      <div className="landing-intro"><span>UN MISMO OBJETIVO</span><h1>Simplificamos tu <em>trabajo diario.</em></h1><p>Herramientas y servicios que acompañan a veterinarios y laboratorios en sus gestiones digitales.</p></div>
      <div className="landing-cards">{cards.map(card => <Link className={`landing-card ${card.kind}`} key={card.kind} href={card.href}>
        <span className="landing-card-art" aria-hidden="true" />
        <span className="landing-card-copy"><small>{card.eyebrow}</small><strong>{card.title}</strong><span className="landing-description">{card.description}</span><span className="landing-benefits">{card.benefits.map(benefit => <span key={benefit}>✓ {benefit}</span>)}</span><span className="landing-card-action">{card.action} <span aria-hidden="true">→</span></span></span>
      </Link>)}</div>
      <div className="landing-trust"><span>◇ Información segura</span><span>✦ En constante mejora</span><span>◉ Atención directa</span></div>
    </> : page === "laboratories" ? <>
      <section className="landing-detail-hero laboratory-detail"><div><span>VETCONVER PARA LABORATORIOS</span><h1>Del acta PDF a GRECERT en pocos pasos.</h1><p>Transformá el acta recibida en un JSON listo para adjuntar en GRECERT y en informes detallados en PDF y Excel, sin volver a cargar cada dato desde cero.</p><div className="landing-actions"><button onClick={() => setAuthMode("register")}>Solicitar acceso <span>→</span></button><a href="https://wa.me/5492244429316" target="_blank" rel="noreferrer">Consultar por WhatsApp</a></div></div></section>
      <section className="landing-detail-body landing-section" id="como-funciona"><span>CÓMO FUNCIONA</span><h2>Menos carga manual, más agilidad para tu laboratorio.</h2><p>VetConver convierte un acta PDF recibida en un protocolo editable. Completás y verificás los resultados con herramientas rápidas, y descargás los archivos que necesitás.</p><div className="landing-feature-grid"><article><b>01 · CARGÁ</b><h3>Adjuntá el acta PDF</h3><p>El sistema interpreta los datos del acta y las muestras para preparar el protocolo, sin transcribirlo desde cero.</p></article><article><b>02 · COMPLETÁ</b><h3>Usá atajos para el lote</h3><p>Marcá todas las muestras como negativas con un botón cuando corresponda. Configurá los antígenos una sola vez en «Mis datos» para que se completen automáticamente según el diagnóstico.</p></article><article><b>03 · EXPORTÁ</b><h3>Adjuntá el JSON en GRECERT</h3><p>Descargá el JSON y cargá el informe en GRECERT simplemente adjuntándolo. También obtené informes detallados en PDF y Excel.</p></article></div><p className="landing-note">Revisá los datos y resultados antes de descargarlos: la validación profesional del laboratorio sigue siendo indispensable.</p></section>
      <section className="landing-detail-body"><span>UNA HERRAMIENTA COMPLEMENTARIA</span><h2>Una carga, tres archivos útiles.</h2><div className="landing-feature-grid"><article><b>01 · JSON</b><h3>Para adjuntar en GRECERT</h3><p>Evitá volver a cargar muestra por muestra: descargá el JSON del protocolo revisado y adjuntalo para la carga rápida.</p></article><article><b>02 · PDF</b><h3>Informe detallado para entregar</h3><p>Generá un informe ordenado con datos del protocolo, muestras, resultados, resumen y conclusión.</p></article><article><b>03 · EXCEL</b><h3>Detalle editable para tu archivo</h3><p>Obtené también una planilla detallada para control interno y archivo del laboratorio.</p></article></div><p className="landing-note">Compatible con los distintos rubros contemplados. VetConver complementa tu trabajo: no reemplaza el sistema de gestión del laboratorio. El acceso se habilita personalmente después de revisar cada solicitud.</p></section>
      <section className="landing-detail-body landing-section" id="rubros"><span>RUBROS CONTEMPLADOS</span><h2>Los mismos rubros, del lado del laboratorio.</h2><p>Preparado para los análisis de las especies que ya se trabajan en VetConver.</p><div className="landing-rubro-grid"><article><span aria-hidden="true">🐴</span><div><b>Equinos</b><p>Anemia infecciosa equina</p></div></article><article><span aria-hidden="true">🐄</span><div><b>Bovinos</b><p>Brucelosis y leucosis</p></div></article><article><span aria-hidden="true">🐑</span><div><b>Ovinos</b><p>Brucella ovis</p></div></article><article><span aria-hidden="true">🐖</span><div><b>Porcinos</b><p>Aujeszky y triquina</p></div></article><article><span aria-hidden="true">🐔</span><div><b>Aves</b><p>Categorías e identificación opcional</p></div></article></div></section>
    </> : <>
      <section className="landing-detail-hero about-detail"><div><span>QUIÉN ESTÁ DETRÁS DE VETCONVER</span><h1>Una herramienta creada desde la experiencia real.</h1><p>Soy Hilario Sondón. Desarrollé VetConver a partir de más de 4 años de experiencia trabajando en la administración de un laboratorio veterinario, buscando simplificar tareas que conozco de primera mano.</p><a className="landing-about-link" href="https://wa.me/5492244429316" target="_blank" rel="noreferrer">Hablemos por WhatsApp <span>→</span></a></div></section>
      <section className="landing-detail-body"><span>DE LA EXPERIENCIA AL PRODUCTO</span><h2>Conozco estas tareas porque trabajé con ellas.</h2><p>El trabajo con actas, planillas, códigos y resultados me mostró cuánto tiempo se pierde al volver a cargar los mismos datos. VetConver nació para simplificar ese recorrido y acompañar a quienes lo hacen todos los días.</p><div className="landing-feature-grid"><article><b>EXPERIENCIA</b><p>Más de 4 años en laboratorio veterinario.</p></article><article><b>CONOCIMIENTO</b><p>Trabajo práctico con SIGATM y GRECERT.</p></article><article><b>ACOMPAÑAMIENTO</b><p>Atención directa y mejoras continuas según las necesidades de veterinarios y laboratorios.</p></article></div><p className="landing-note">VetConver es una iniciativa independiente; no representa a SENASA, SIGATM ni GRECERT. La fotografía personal se incorporará más adelante.</p></section>
    </>}
    <footer className="landing-footer"><span>© {new Date().getFullYear()} VetConver</span><span>Simplificamos tu trabajo diario.</span><a href="https://www.instagram.com/vetconver/" target="_blank" rel="noreferrer">Instagram · @vetconver</a></footer>
    {authMode && <AuthModal mode={authMode} onMode={setAuthMode} onClose={() => setAuthMode(null)} initialAccountType={initialAccountType} />}
  </main>;
}

function PublicHome() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  return (
    <main className="public-site">
      <LandingHeader page="veterinarians" onLogin={() => setAuthMode("login")} />

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

      <section className="pricing" id="plan">
        <div>
          <span className="kicker">UN PLAN SIMPLE</span>
          <h2>Probalo 7 días sin cargo.</h2>
          <p>
            Acceso completo al generador de planillas SIGATM, las validaciones
            y el instructivo visual. Además, te acompañamos durante todo el
            proceso para que puedas trabajar con seguridad. Cancelás cuando
            quieras.
          </p>
          <ul className="pricing-benefits">
            <li>Asesoramiento para generar tus actas</li>
            <li>Resolución de dudas durante la carga</li>
            <li>Acompañamiento ante cambios en SIGATM</li>
          </ul>
        </div>
        <article>
          <span>Plan VetConver</span>
          <strong>$25.000 <small>ARS / mes</small></strong>
          <p>El primer cobro se realiza al finalizar los 7 días de prueba.</p>
          <button onClick={() => setAuthMode("register")}>
            Comenzar prueba gratis
          </button>
        </article>
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

      <section className="founder" id="quien-esta-detras">
        <div>
          <span className="kicker">QUIÉN ESTÁ DETRÁS DE VETCONVER</span>
          <h2>Una herramienta creada desde la experiencia administrativa.</h2>
          <p>
            Soy Hilario Sondon. Durante más de cinco años trabajé en el área
            administrativa de un laboratorio veterinario. Allí conocí de
            primera mano el tiempo que requiere transcribir protocolos, ordenar
            identificaciones y preparar correctamente la información para
            cargarla en los distintos sistemas.
          </p>
          <p>
            Durante el último año acompañé a más de diez laboratorios
            veterinarios en su adaptación al sistema GRECERT. Esa experiencia me
            permitió observar algo que se repetía: buena parte del trabajo
            administrativo depende de tareas manuales, códigos y formatos que
            consumen tiempo y pueden generar errores.
          </p>
          <p>
            Creé VetConver para aplicar lo aprendido y facilitarles ese proceso
            a los veterinarios. La propuesta no es solamente ofrecer una
            herramienta: también brindar acompañamiento para preparar las
            planillas, resolver dudas y adaptarnos a los cambios que puedan
            aparecer.
          </p>
          <small>
            No soy veterinario ni represento a SENASA, SIGATM o GRECERT.
            VetConver es una iniciativa independiente, desarrollada desde la
            experiencia administrativa y el trabajo cotidiano con laboratorios
            veterinarios.
          </small>
          <a
            className="founder-contact"
            href="https://wa.me/5492244429316?text=Hola%2C%20Hilario.%20Quiero%20hacerte%20una%20consulta%20sobre%20VetConver."
            target="_blank"
            rel="noreferrer"
          >
            Hablar conmigo por WhatsApp <span>→</span>
          </a>
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
        <a
          href="https://www.instagram.com/vetconver/"
          target="_blank"
          rel="noreferrer"
        >
          Instagram · @vetconver
        </a>
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
  initialAccountType = "veterinarian",
}: {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  onClose: () => void;
  initialAccountType?: "veterinarian" | "laboratory";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<"veterinarian" | "laboratory">(initialAccountType);
  useEffect(() => {
    if (mode === "register") trackEvent("register_open");
  }, [mode]);
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
        const role = accountType;
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        await updateProfile(credential.user, { displayName: name });
        await setDoc(doc(db, "users", credential.user.uid), {
          name,
          email,
          role,
          plan: role === "laboratory" ? "laboratory" : "unassigned",
          subscriptionStatus: "pending",
          createdAt: serverTimestamp(),
        });
        const verificationResponse = await fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { Authorization: `Bearer ${await credential.user.getIdToken()}` },
        });
        if (!verificationResponse.ok) await sendEmailVerification(credential.user);
        trackEvent("registration_completed");
        await signOut(auth);
        window.location.assign(
          `/registro-enviado?email=${encodeURIComponent(email)}`,
        );
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
            : accountType === "laboratory"
              ? "Solicitá el acceso para tu laboratorio. La habilitación y facturación son administradas personalmente."
              : "7 días gratis. Después, $25.000 ARS por mes. Cancelás cuando quieras."}
        </p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                Tipo de cuenta
                <select value={accountType} onChange={(event) => setAccountType(event.target.value as "veterinarian" | "laboratory")}>
                  <option value="veterinarian">Veterinario/a</option>
                  <option value="laboratory">Laboratorio</option>
                </select>
              </label>
              <label>
                {accountType === "laboratory" ? "Nombre del laboratorio" : "Nombre y apellido"}
                <input name="name" autoComplete="name" required />
              </label>
              {accountType === "laboratory" && <div className="laboratory-registration-note">El acceso para laboratorios queda pendiente hasta que el administrador verifique y habilite la cuenta.</div>}
            </>
          )}
          <label>
            Correo electrónico
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Contraseña
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                minLength={6}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                required
              />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"}>
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
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

function LaboratoryPending({ user, verified, status, onExit }: { user: User; verified: boolean; status: string; onExit: () => void }) {
  const pending = status === "pending";
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const verifyLocally = async () => {
    setLocalBusy(true);setLocalError("");
    try {
      const response = await fetch("/api/auth/dev-verify", { method: "POST", headers: { Authorization: `Bearer ${await user.getIdToken(true)}` } });
      if (!response.ok) throw new Error();
      window.location.reload();
    } catch { setLocalError("No se pudo verificar la cuenta local.");setLocalBusy(false); }
  };
  return (
    <main className="access-status">
      <Brand />
      <span>ACCESO PARA LABORATORIOS</span>
      <h1>{!verified ? "Verificá tu correo electrónico" : pending ? "Tu solicitud está pendiente de aprobación" : "El acceso del laboratorio está deshabilitado"}</h1>
      <p>
        {!verified
          ? "Enviamos un enlace a tu correo. Después de verificarlo, la solicitud quedará disponible para que el administrador la revise."
          : pending
          ? "El administrador verificará los datos del laboratorio y habilitará personalmente el acceso. No se realizará ningún cobro automático."
          : "La cuenta se conserva, pero el módulo no puede utilizarse hasta que el administrador vuelva a habilitarla."}
      </p>
      {!verified && typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && <>
        <button className="access-status-local-button" onClick={verifyLocally} disabled={localBusy}>{localBusy ? "Verificando…" : "Verificar cuenta local"}</button>
        {localError && <small className="laboratory-load-error">{localError}</small>}
      </>}
      <button onClick={onExit}>Cerrar sesión</button>
    </main>
  );
}
