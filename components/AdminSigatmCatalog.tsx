"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { db } from "../lib/firebase";
import {
  catalogEntryKey,
  DEFAULT_SIGATM_CATALOG,
  normalizeSigatmCatalog,
  SigatmCatalog,
} from "../lib/sigatm-catalog";

type CatalogGroup = "animals" | "idTypes" | "categories" | "ages";
type CatalogRow = { original: string; label: string; code: string; active: boolean };

const groups: { value: CatalogGroup; label: string; description: string }[] = [
  { value: "animals", label: "Estado del animal", description: "Animal sano, enfermo, caído u otras condiciones." },
  { value: "idTypes", label: "Tipos de identificación", description: "Caravana, chip, nombre y demás identificadores." },
  { value: "categories", label: "Categorías", description: "Categorías oficiales disponibles para cada especie." },
  { value: "ages", label: "Edades", description: "Rangos de edad admitidos por especie." },
];

const cloneCatalog = (catalog: SigatmCatalog): SigatmCatalog =>
  JSON.parse(JSON.stringify(catalog)) as SigatmCatalog;

export default function AdminSigatmCatalog({ currentUid }: { currentUid: string }) {
  const [catalog, setCatalog] = useState<SigatmCatalog>(cloneCatalog(DEFAULT_SIGATM_CATALOG));
  const [group, setGroup] = useState<CatalogGroup>("categories");
  const [species, setSpecies] = useState("BOVINO");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [newSpecies, setNewSpecies] = useState("");

  const loadCatalog = async () => {
    setLoading(true);
    setFeedback("");
    try {
      const snapshot = await getDoc(doc(db, "systemConfig", "sigatm"));
      const loaded = snapshot.exists()
        ? normalizeSigatmCatalog(snapshot.data())
        : cloneCatalog(DEFAULT_SIGATM_CATALOG);
      setCatalog(loaded);
      setSpecies(loaded.species[0] || "BOVINO");
      if (!snapshot.exists())
        setFeedback("Se muestran los códigos iniciales. Guardá para publicar el primer catálogo en Firebase.");
    } catch (error) {
      console.error("No pudimos cargar el catálogo SIGATM", error);
      setFeedback("No pudimos abrir el catálogo. Revisá las reglas de Firestore.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    const nested = group === "categories" || group === "ages";
    const source = nested ? catalog[group][species] || {} : catalog[group];
    setRows(
      Object.entries(source).map(([label, code]) => ({
        original: label,
        label,
        code: String(code),
        active: !catalog.disabled.includes(catalogEntryKey(group, nested ? species : "", label)),
      })),
    );
  }, [catalog, group, species]);

  const currentGroup = groups.find((item) => item.value === group)!;
  const needsSpecies = group === "categories" || group === "ages";
  const activeCount = rows.filter((row) => row.active).length;
  const totalCodes = useMemo(
    () =>
      Object.keys(catalog.animals).length +
      Object.keys(catalog.idTypes).length +
      Object.values(catalog.categories).reduce((total, map) => total + Object.keys(map).length, 0) +
      Object.values(catalog.ages).reduce((total, map) => total + Object.keys(map).length, 0),
    [catalog],
  );

  const updateRow = (index: number, changes: Partial<CatalogRow>) =>
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row));

  const addRow = () =>
    setRows((current) => [...current, { original: "", label: "", code: "", active: true }]);

  const addSpecies = () => {
    const value = newSpecies.trim().toUpperCase();
    if (!value || catalog.species.includes(value)) return;
    setCatalog((current) => ({
      ...current,
      species: [...current.species, value],
      categories: { ...current.categories, [value]: {} },
      ages: { ...current.ages, [value]: { "N/A": 10 } },
    }));
    setSpecies(value);
    setNewSpecies("");
  };

  const saveCatalog = async () => {
    const validRows = rows.filter(
      (row) => row.label.trim() && /^\d+$/.test(row.code.trim()),
    );
    if (validRows.length !== rows.length) {
      setFeedback("Revisá las filas: cada opción necesita un nombre y un código numérico.");
      return;
    }
    const labels = validRows.map((row) => row.label.trim().toUpperCase());
    if (new Set(labels).size !== labels.length) {
      setFeedback("Hay nombres repetidos dentro de esta sección.");
      return;
    }

    const nested = group === "categories" || group === "ages";
    const next = cloneCatalog(catalog);
    const map = Object.fromEntries(validRows.map((row) => [row.label.trim(), Number(row.code)]));
    if (nested) next[group][species] = map;
    else next[group] = map;

    const prefix = `${group}|${nested ? species : ""}|`;
    next.disabled = next.disabled.filter((key) => !key.startsWith(prefix));
    validRows.forEach((row) => {
      if (!row.active)
        next.disabled.push(catalogEntryKey(group, nested ? species : "", row.label.trim()));
    });

    setSaving(true);
    setFeedback("");
    try {
      await setDoc(doc(db, "systemConfig", "sigatm"), {
        ...next,
        updatedAt: serverTimestamp(),
        updatedBy: currentUid,
      });
      setCatalog(next);
      setFeedback("Catálogo SIGATM publicado correctamente.");
    } catch (error) {
      console.error("No pudimos guardar el catálogo", error);
      setFeedback("No pudimos publicar los cambios. Revisá los permisos administrativos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="topbar module-topbar admin-header">
        <div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Catálogo SIGATM</h1><p>Actualizá códigos oficiales sin modificar el código de LabOVet.</p></div>
        <button className="outline-btn" type="button" onClick={loadCatalog}>Recargar catálogo</button>
      </header>

      <section className="module-stats admin-catalog-stats">
        <article className="panel stat-card"><span>Especies</span><strong>{catalog.species.length}</strong><small>configuradas</small></article>
        <article className="panel stat-card"><span>Códigos totales</span><strong>{totalCodes}</strong><small>conservados en catálogo</small></article>
        <article className="panel stat-card"><span>Sección actual</span><strong>{rows.length}</strong><small>{activeCount} activos</small></article>
      </section>

      {feedback && <div className="stock-notice"><span>{feedback}</span><button type="button" onClick={() => setFeedback("")}>×</button></div>}

      <section className="panel admin-catalog-panel">
        <aside className="catalog-groups">
          <b>CONFIGURACIÓN</b>
          {groups.map((item) => <button type="button" key={item.value} className={group === item.value ? "selected" : ""} onClick={() => setGroup(item.value)}>{item.label}</button>)}
          <div className="catalog-species-create"><span>Nueva especie</span><input value={newSpecies} onChange={(event) => setNewSpecies(event.target.value)} placeholder="Ej. CANINO" /><button type="button" onClick={addSpecies}>＋ Agregar</button></div>
        </aside>

        <div className="catalog-editor">
          <div className="catalog-editor-head">
            <div><h2>{currentGroup.label}</h2><p>{currentGroup.description}</p></div>
            {needsSpecies && <label>Especie<select value={species} onChange={(event) => setSpecies(event.target.value)}>{catalog.species.map((item) => <option key={item}>{item}</option>)}</select></label>}
          </div>
          <div className="catalog-table-head"><span>Nombre de la opción</span><span>Código SIGATM</span><span>Vigencia</span><span></span></div>
          {loading ? <div className="admin-users-empty">Cargando catálogo…</div> : rows.map((row, index) => (
            <div className={`catalog-row ${row.active ? "" : "inactive"}`} key={`${row.original}-${index}`}>
              <input value={row.label} onChange={(event) => updateRow(index, { label: event.target.value })} placeholder="Nombre" />
              <input value={row.code} onChange={(event) => updateRow(index, { code: event.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Código" />
              <button type="button" className={row.active ? "active" : ""} onClick={() => updateRow(index, { active: !row.active })}>{row.active ? "Activo" : "Inactivo"}</button>
              {!row.original ? <button type="button" className="remove" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</button> : <span className="catalog-preserved" title="Los códigos utilizados se conservan en el historial">Conservado</span>}
            </div>
          ))}
          <div className="catalog-actions"><button type="button" className="outline-btn" onClick={addRow}>＋ Agregar opción</button><button type="button" className="primary" onClick={saveCatalog} disabled={saving}>{saving ? "Publicando…" : "Guardar y publicar"}</button></div>
        </div>
      </section>
    </>
  );
}
