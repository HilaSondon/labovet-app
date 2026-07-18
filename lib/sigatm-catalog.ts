export type SigatmCodeMap = Record<string, number>;

export type SigatmCatalog = {
  species: string[];
  animals: SigatmCodeMap;
  idTypes: SigatmCodeMap;
  categories: Record<string, SigatmCodeMap>;
  ages: Record<string, SigatmCodeMap>;
  disabled: string[];
};

export const DEFAULT_SIGATM_CATALOG: SigatmCatalog = {
  species: ["BOVINO", "BUBALINO", "CAPRINO", "EQUINO", "OVINO", "PORCINO"],
  animals: {
    "No aplica": 1,
    "Animal sano": 2,
    "Animal enfermo": 3,
    "Animal caído": 4,
    "Animal muerto": 5,
  },
  idTypes: {
    Caravana: 1,
    Nombre: 2,
    "Nro de Certificado": 3,
    "Nro de Libreta": 4,
    "Nro Pasaporte": 5,
    "Nro Chip": 6,
    "Nro de Registro RRI": 7,
    "Marcas y Señales": 8,
    "Lote/Lance": 9,
    Tanque: 10,
    Colmena: 11,
    "No aplica": 12,
    Sexo: 13,
  },
  categories: {
    BOVINO: { BUEYES: 101, NOVILLITO: 8, NOVILLO: 50, "SIN ESPECIFICAR": 11410, TERNERA: 351, TERNERO: 350, TORITO: 470, MEJ: 470, TORO: 100, VACA: 7, VAQUILLONA: 200 },
    BUBALINO: { BUEYES: 408, NOVILLITO: 404, NOVILLO: 403, "SIN ESPECIFICAR": 11417, TERNERA: 406, TERNERO: 405, TORITO: 471, MEJ: 471, TORO: 407, VACA: 401, VAQUILLONA: 402 },
    CAPRINO: { CABRA: 20, "CABRILLAS/CHIVITOS": 418, CABRITO: 21, CAPON: 417, CHIVO: 19, "SIN ESPECIFICAR": 11402 },
    EQUINO: { ASNO: 28, BURRO: 27, CABALLO: 23, MULA: 26, PADRILLO: 22, "POTRILLO/A": 25, POTRILLO: 25, POTRILLA: 25, "SIN ESPECIFICAR": 11406, YEGUA: 24 },
    OVINO: { "BORREGO/A": 11, CAPON: 12, CARNERO: 9, "CORDERO/A": 13, OVEJA: 10, "SIN ESPECIFICAR": 11401 },
    PORCINO: { CACHORRA: 476, CACHORRO: 18, "CAPON/ HEMBRA SIN SERVICIO": 17, CERDA: 15, LECHON: 16, MEI: 437, PADRILLO: 14, "SIN ESPECIFICAR": 11399 },
  },
  ages: {
    BOVINO: { "< A 1 AÑO": 2, "< A 6 MESES": 1, "< DE 2 AÑOS": 3, ADULTO: 5, CRIA: 6, "DE 1 A 2 AÑOS": 4, JUVENIL: 7, MAYORES: 8, MENORES: 9, "N/A": 10, ">=2 Y <4 AÑOS": 41, ">=4 Y <7 AÑOS": 42, "6 A 18 MESES": 21, ">=7 Y <9 AÑOS": 61, ">=9 AÑOS": 62 },
    BUBALINO: { "< A 1 AÑO": 2, ADULTO: 5, CRIA: 6, JUVENIL: 7, "N/A": 10 },
    CAPRINO: { "N/A": 10 },
    EQUINO: { "N/A": 10 },
    OVINO: { "BOCA LLENA (> DE 4 AÑOS)": 181, "2 DIENTES (1 AÑO)": 161, "4 DIENTES (2 AÑOS)": 162, "N/A": 10 },
    PORCINO: { "N/A": 10 },
  },
  disabled: [],
};

export const catalogEntryKey = (group: string, species: string, label: string) =>
  [group, species, label].join("|");

export const activeCodeMap = (
  catalog: SigatmCatalog,
  group: "animals" | "idTypes" | "categories" | "ages",
  species = "",
) => {
  const source =
    group === "categories" || group === "ages"
      ? catalog[group][species] || {}
      : catalog[group];
  return Object.fromEntries(
    Object.entries(source).filter(
      ([label]) =>
        !catalog.disabled.includes(catalogEntryKey(group, species, label)),
    ),
  );
};

export const normalizeSigatmCatalog = (value: unknown): SigatmCatalog => {
  if (!value || typeof value !== "object") return DEFAULT_SIGATM_CATALOG;
  const data = value as Partial<SigatmCatalog>;
  return {
    species: Array.isArray(data.species) ? data.species.map(String) : DEFAULT_SIGATM_CATALOG.species,
    animals: data.animals && typeof data.animals === "object" ? data.animals : DEFAULT_SIGATM_CATALOG.animals,
    idTypes: data.idTypes && typeof data.idTypes === "object" ? data.idTypes : DEFAULT_SIGATM_CATALOG.idTypes,
    categories: data.categories && typeof data.categories === "object" ? data.categories : DEFAULT_SIGATM_CATALOG.categories,
    ages: data.ages && typeof data.ages === "object" ? data.ages : DEFAULT_SIGATM_CATALOG.ages,
    disabled: Array.isArray(data.disabled) ? data.disabled.map(String) : [],
  };
};
