import { NextResponse } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { authenticatedUser } from "../../../../lib/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await authenticatedUser(request);
    const { getAdminDb } = await import("../../../../lib/firebase-admin");
    const profile = (await getAdminDb().collection("users").doc(identity.uid).get()).data();
    if (!profile || !["laboratory", "admin"].includes(String(profile.role)) || (profile.role === "laboratory" && profile.subscriptionStatus !== "active")) {
      return NextResponse.json({ error: "Acceso de laboratorio no habilitado." }, { status: 403 });
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length || bytes.length > 15_000_000) return NextResponse.json({ error: "El PDF está vacío o supera 15 MB." }, { status: 400 });
    const pdf = await getDocument({ data: bytes, useSystemFonts: true }).promise;
    const pages: Array<{ number: number; lines: string[]; text: string; sampleCells: Record<string, string>[] }> = [];
    let columns: number[] | null = null;
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        const items = content.items.filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item && Boolean(item.str?.trim()) && "transform" in item)
          .map((item) => ({ text: item.str, x: item.transform[4], y: Math.round(item.transform[5]) }));
        const grouped = new Map<number, typeof items>();
        for (const item of items) { if (!grouped.has(item.y)) grouped.set(item.y, []); grouped.get(item.y)!.push(item); }
        const lines = [...grouped.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());
        const header = items.find((item) => /^Nro\. Tubo/.test(item.text));
        if (header) {
          const labels = ["Nro. Tubo", "Identificación", "Animal", "Categoría/edad", "Fec.vacuna", "Observaciones"];
          const found = labels.map((label) => items.find((item) => Math.abs(item.y - header.y) < 2 && item.text === label)?.x);
          columns = found.some((value) => value === undefined) ? null : found as number[];
        }
        const sampleCells: Record<string, string>[] = [];
        if (columns) {
          const top = header ? header.y - 10 : items.find((item) => /^Observaciones:/.test(item.text))?.y;
          const bottom = items.find((item) => /^Número de acta/.test(item.text))?.y ?? 65;
          const body = items.filter((item) => top !== undefined && item.y < top && item.y > bottom);
          const anchors = body.filter((item) => item.x >= columns![2] - 2 && item.x < columns![3] - 2 && /^(Animal sano|Animal enfermo|Animal caído|Animal muerto|No aplica|N\/A)$/i.test(item.text.trim())).sort((a, b) => b.y - a.y);
          for (let index = 0; index < anchors.length; index++) {
            const row = body.filter((item) => item.y <= anchors[index].y + 1 && item.y > (anchors[index + 1]?.y ?? bottom) + 1);
            const cells = columns.map((left, column) => row.filter((item) => item.x >= left - 2 && item.x < (columns![column + 1] ?? Infinity) - 2).sort((a, b) => b.y - a.y || a.x - b.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim());
            sampleCells.push({ tube: cells[0], identifier: cells[1], animalStatus: cells[2], categoryAge: cells[3], vaccinationDate: cells[4], observation: cells[5] });
          }
        }
        pages.push({ number, lines, text: lines.join("\n"), sampleCells });
      }
      return NextResponse.json({ pages, text: pages.map((page) => page.text).join("\n") });
    } finally { await pdf.destroy(); }
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
    if (!unauthenticated) console.error("No se pudo interpretar el acta PDF", error);
    return NextResponse.json({ error: unauthenticated ? "Sesión no válida." : "No se pudo interpretar el acta PDF." }, { status: unauthenticated ? 401 : 400 });
  }
}
