"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  LaboratoryManagementRecord,
  deleteLaboratoryRecord,
  loadLaboratoryModule,
  saveLaboratoryRecord,
} from "../lib/laboratory-management-data";

type Line = {
  id: string;
  analysisId: string;
  query: string;
  quantity: number;
  manual: boolean;
  ranges: string;
};
const makeId = () => Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const money = (v: unknown) => `$ ${Number(v || 0).toLocaleString("es-AR")}`;
const parseTubeRanges = (value: string) => {
  const tubes = new Set<number>();
  value.split(",").map((part) => part.trim()).filter(Boolean).forEach((part) => {
    const match = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error(`Rango inválido: ${part}`);
    const start = Number(match[1]), end = Number(match[2] || match[1]);
    if (start < 1 || end < start || end - start > 5000) throw new Error(`Rango inválido: ${part}`);
    for (let tube = start; tube <= end; tube += 1) tubes.add(tube);
  });
  return [...tubes].sort((a, b) => a - b);
};

function Picker({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string, id: string) => void;
  options: { id: string; label: string; detail: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const found = options
    .filter((x) =>
      `${x.label} ${x.detail}`.toLowerCase().includes(value.toLowerCase()),
    )
    .slice(0, 20);
  return (
    <div className="lab-search-picker">
      <input
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value, "");
          setOpen(true);
        }}
        placeholder={placeholder}
      />
      {open && value && (
        <div className="lab-search-results">
          {found.map((x) => (
            <button
              type="button"
              key={x.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(x.label, x.id);
                setOpen(false);
              }}
            >
              <span>{x.label}</span>
              <small>{x.detail}</small>
            </button>
          ))}
          {!found.length && <p>Sin coincidencias</p>}
        </div>
      )}
    </div>
  );
}

export default function LaboratorySampleIntakePanel({ uid }: { uid: string }) {
  const [samples, setSamples] = useState<LaboratoryManagementRecord[]>([]),
    [prices, setPrices] = useState<LaboratoryManagementRecord[]>([]),
    [vets, setVets] = useState<LaboratoryManagementRecord[]>([]),
    [clients, setClients] = useState<LaboratoryManagementRecord[]>([]),
    [accesses, setAccesses] = useState<LaboratoryManagementRecord[]>([]);
  const [lines, setLines] = useState<Line[]>([
      { id: makeId(), analysisId: "", query: "", quantity: 1, manual: false, ranges: "1" },
    ]),
    [totalSamples, setTotalSamples] = useState(1),
    [vetName, setVetName] = useState(""),
    [clientName, setClientName] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false),
    [accessOpen, setAccessOpen] = useState(false),
    [accessQuery, setAccessQuery] = useState("");
  const load = () =>
    Promise.all([
      loadLaboratoryModule(uid, "samples"),
      loadLaboratoryModule(uid, "prices"),
      loadLaboratoryModule(uid, "veterinarians"),
      loadLaboratoryModule(uid, "clients"),
      loadLaboratoryModule(uid, "quickAccess"),
    ]).then(([a, b, c, d, e]) => {
      setSamples(a);
      setPrices(b.filter((x) => x.status === "Activo"));
      setVets(c);
      setClients(d);
      setAccesses(e);
    });
  useEffect(() => {
    load();
  }, [uid]);
  const protocol = `LAB-${new Date().getFullYear()}-${String(samples.length + 1).padStart(5, "0")}`;
  const detail = lines.map((line) => {
    const item = prices.find((x) => x.id === line.analysisId);
    return {
      ...line,
      item,
      subtotal: Number(item?.price || 0) * line.quantity,
    };
  });
  const total = detail.reduce((s, x) => s + x.subtotal, 0);
  const client = clients.find(
    (x) =>
      String(x.name).toLowerCase() === clientName.toLowerCase() ||
      String(x.renspa || "").toLowerCase() === clientName.toLowerCase(),
  );
  const priceOptions = prices.map((x) => ({
    id: x.id,
    label: String(x.name),
    detail: `${x.technique || ""} · ${money(x.price)}`,
  }));
  const vetOptions = vets.map((x) => ({
    id: x.id,
    label: String(x.name),
    detail: [x.cuit, x.locality].filter(Boolean).join(" · "),
  }));
  const clientOptions = clients.map((x) => ({
    id: x.id,
    label: String(x.name),
    detail: [x.renspa, x.establishment].filter(Boolean).join(" · "),
  }));
  function changeTotal(value: number) {
    const next = Math.max(1, value || 1);
    setTotalSamples(next);
    setLines((cur) =>
      cur.map((x) => (x.manual ? x : { ...x, quantity: next, ranges: `1-${next}` })),
    );
  }
  function chooseQuick(id: string) {
    const item = prices.find((x) => x.id === id);
    if (item)
      setLines([
        {
          id: makeId(),
          analysisId: id,
          query: String(item.name),
          quantity: totalSamples,
          manual: false,
          ranges: `1-${totalSamples}`,
        },
      ]);
  }
  async function addAccess() {
    const item = prices.find(
      (x) => x.id === priceOptions.find((o) => o.label === accessQuery)?.id,
    );
    if (!item) return;
    const stamp = new Date().toISOString();
    await saveLaboratoryRecord(uid, "quickAccess", {
      id: `access-${item.id}`,
      analysisId: item.id,
      name: item.name,
      technique: item.technique || "",
      createdAt: stamp,
      updatedAt: stamp,
    });
    setAccessOpen(false);
    setAccessQuery("");
    load();
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!vetName || !clientName || detail.some((x) => !x.item)) {
      setMessage("Completá veterinario, productor y todos los análisis.");
      return;
    }
    let tubeRows: Array<Record<string, unknown>>;
    try {
      const configured = detail.map((line) => {
        const tubes = parseTubeRanges(line.ranges);
        if (tubes.length !== line.quantity) throw new Error(`${line.item?.name}: indicá ${line.quantity} tubos; el rango contiene ${tubes.length}.`);
        return { line, tubes };
      });
      const allTubes = [...new Set(configured.flatMap((entry) => entry.tubes))].sort((a, b) => a - b);
      if (allTubes.length !== totalSamples) throw new Error(`Los rangos abarcan ${allTubes.length} tubos distintos, pero el ingreso indica ${totalSamples} muestras.`);
      tubeRows = allTubes.map((tube) => ({
        tube,
        identification: "",
        category: "",
        assignments: configured.filter((entry) => entry.tubes.includes(tube)).map(({ line }) => ({
          analysisId: line.item?.id || "",
          analysisName: line.item?.name || "",
          result: "",
          confirmatoryTechnique: "",
          confirmatoryResult: "",
          antigen: "",
          brand: "",
          lot: "",
          expiration: "",
          stamp: "",
        })),
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revisá los rangos de tubos.");
      return;
    }
    setSaving(true);
    const f = Object.fromEntries(new FormData(form).entries()),
      stamp = new Date().toISOString();
    const record = {
      id: `sample-${Date.now()}`,
      protocol,
      date: f.date || today(),
      veterinarian: vetName,
      client: client?.name || clientName,
      species: f.species,
      renspa: client?.renspa || "",
      establishment: f.establishment || client?.establishment || "",
      quantity: totalSamples,
      analyses: JSON.stringify(
        detail.map((x) => ({
          id: x.item?.id,
          name: x.item?.name,
          quantity: x.quantity,
          unitPrice: x.item?.price,
          subtotal: x.subtotal,
          ranges: x.ranges,
        })),
      ),
      estimatedTotal: total,
      observations: f.observations,
      tubeRows: JSON.stringify(tubeRows),
      status: "Recibida",
      createdAt: stamp,
      updatedAt: stamp,
    } as LaboratoryManagementRecord;
    try {
      await saveLaboratoryRecord(uid, "samples", record);
      setSamples((cur) => [record, ...cur]);
      setLines([
        { id: makeId(), analysisId: "", query: "", quantity: 1, manual: false, ranges: "1" },
      ]);
      setTotalSamples(1);
      setVetName("");
      setClientName("");
      form.reset();
      setMessage(`${protocol} guardado con ${totalSamples} muestras.`);
    } catch {
      setMessage("No pudimos guardar el ingreso. Los datos permanecen en pantalla para que puedas reintentar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <header className="topbar module-topbar laboratory-management-header">
        <div>
          <span className="eyebrow">OPERACIÓN</span>
          <h1>Ingreso de muestras</h1>
          <p>
            Recepción rápida vinculada con veterinarios, productores y precios.
          </p>
        </div>
      </header>
      {message && (
        <div className="laboratory-message success">
          {message}
          <button onClick={() => setMessage("")}>×</button>
        </div>
      )}
      <section className="lab-quick-section">
        <div>
          <h2>Accesos rápidos</h2>
          <span>Configurá solamente los que usás todos los días</span>
        </div>
        <div className="lab-quick-grid">
          {accesses.map((a) => (
            <div className="lab-quick-card" key={a.id}>
              <button
                className={lines.length === 1 && lines[0]?.analysisId === String(a.analysisId) ? "selected" : ""}
                onClick={() => chooseQuick(String(a.analysisId))}
              >
                <b>{String(a.name)}</b>
                <small>{String(a.technique || "")}</small>
              </button>
              <button
                className="remove"
                onClick={async () => {
                  await deleteLaboratoryRecord(uid, "quickAccess", a.id);
                  load();
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button onClick={() => setAccessOpen(true)}>
            <b>＋ Crear acceso</b>
            <small>Elegir de la lista de precios</small>
          </button>
        </div>
      </section>
      <form className="panel lab-intake-form" onSubmit={submit}>
        <div className="lab-intake-title">
          <h2>Nuevo ingreso</h2>
          <span>Protocolo automático: #{protocol}</span>
        </div>
        <div className="lab-intake-grid four">
          <label>
            Veterinario
            <Picker
              value={vetName}
              onChange={(v) => setVetName(v)}
              options={vetOptions}
              placeholder="Escribí para buscar veterinario"
            />
          </label>
          <label>
            Especie
            <select name="species" defaultValue="Bovino">
              <option>Bovino</option>
              <option>Equino</option>
              <option>Ovino</option>
              <option>Porcino</option>
              <option>Canino</option>
              <option>Felino</option>
              <option>Otra</option>
            </select>
          </label>
          <label>
            Cantidad total de muestras
            <input
              type="number"
              min="1"
              value={totalSamples}
              onChange={(e) => changeTotal(Number(e.target.value))}
            />
          </label>
          <label>
            Fecha de ingreso
            <input name="date" type="date" defaultValue={today()} />
          </label>
          <label className="wide">
            RENSPA / Cliente / Productor
            <Picker
              value={clientName}
              onChange={(v) => setClientName(v)}
              options={clientOptions}
              placeholder="Escribí RENSPA o nombre del productor"
            />
          </label>
          <label>
            Productor
            <input
              value={String(client?.name || "")}
              readOnly
              placeholder="Se completa al seleccionar"
            />
          </label>
          <label>
            Establecimiento
            <input
              name="establishment"
              defaultValue={String(client?.establishment || "")}
              placeholder="Nombre del establecimiento"
            />
          </label>
        </div>
        <section className="lab-requested-analyses">
          <div>
            <h2>Análisis solicitados</h2>
            <span>Vinculados con lista de precios</span>
          </div>
          {lines.map((line) => {
            const item = prices.find((x) => x.id === line.analysisId);
            return (
              <div className="lab-analysis-line" key={line.id}>
                <label>
                  Análisis
                  <Picker
                    value={line.query}
                    options={priceOptions}
                    placeholder="Escribí para buscar análisis"
                    onChange={(v, id) =>
                      setLines((cur) =>
                        cur.map((x) =>
                          x.id === line.id
                            ? { ...x, query: v, analysisId: id }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Cantidad
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((cur) =>
                        cur.map((x) =>
                          x.id === line.id
                            ? {
                                ...x,
                                quantity: Number(e.target.value),
                                manual: true,
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Precio unitario
                  <input value={money(item?.price)} readOnly />
                </label>
                <label>
                  Tubos asignados
                  <input
                    value={line.ranges}
                    onChange={(e) => setLines((cur) => cur.map((x) => x.id === line.id ? { ...x, ranges: e.target.value } : x))}
                    placeholder="Ej. 1-500, 700-763"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setLines((cur) =>
                      cur.length === 1
                        ? cur
                        : cur.filter((x) => x.id !== line.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setLines((cur) => [
                ...cur,
                {
                  id: makeId(),
                  analysisId: "",
                  query: "",
                  quantity: totalSamples,
                  manual: false,
                  ranges: `1-${totalSamples}`,
                },
              ])
            }
          >
            ＋ Agregar análisis
          </button>
          <div className="lab-intake-summary">
            <div>
              <b>Resumen estimado</b>
              <small>Según la lista vigente</small>
            </div>
            <section>
              {detail
                .filter((x) => x.item)
                .map((x) => (
                  <article key={x.id}>
                    <span>
                      {String(x.item?.name)} × {x.quantity}
                    </span>
                    <strong>{money(x.subtotal)}</strong>
                  </article>
                ))}
              <article>
                <span>Total de muestras</span>
                <strong>{totalSamples}</strong>
              </article>
              <article className="total">
                <span>Total estimado</span>
                <strong>{money(total)}</strong>
              </article>
            </section>
          </div>
        </section>
        <label className="lab-observations">
          Observaciones internas
          <textarea name="observations" />
        </label>
        <footer>
          <button type="reset">Cancelar</button>
          <button className="primary" disabled={saving}>
            {saving ? "Guardando…" : "Guardar ingreso"}
          </button>
        </footer>
      </form>
      {accessOpen && (
        <div className="modal-backdrop">
          <section className="modal-card laboratory-record-modal">
            <div className="modal-heading">
              <div>
                <span className="eyebrow">ACCESO RÁPIDO</span>
                <h2>Elegir análisis</h2>
              </div>
              <button onClick={() => setAccessOpen(false)}>×</button>
            </div>
            <Picker
              value={accessQuery}
              onChange={(v) => setAccessQuery(v)}
              options={priceOptions}
              placeholder="Buscar por nombre…"
            />
            <footer>
              <button onClick={() => setAccessOpen(false)}>Cancelar</button>
              <button className="primary" onClick={addAccess}>
                Crear acceso
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
