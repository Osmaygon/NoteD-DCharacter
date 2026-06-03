"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { parseImportedCharacter } from "@/lib/character-import";
import { getCurrentAppUser } from "@/lib/custom-auth";
import {
  CharacterDetail,
  deleteCharacter,
  getCharacterDetail,
  updateCharacterAmmunition,
  updateCharacterDetail,
  updateCharacterInventory,
  updateCharacterSourcePayload,
  updateCharacterSpellSlots,
} from "@/lib/home-entities";

type FormState = {
  name: string;
  class_name: string;
  level: string;
  race: string;
  background: string;
  hp: string;
  current_hp: string;
  temp_hp: string;
  shields: string;
  ac: string;
  speed: string;
  notes: string;
};

type CheckEntry = {
  name: string;
  bonus: string;
  proficient: boolean;
};

type AttackEntry = {
  name: string;
  bonus: string;
  damage: string;
  damageType: string;
};

type EquipmentEntry = {
  name: string;
  detail?: string;
  kind?: string;
  quick_use?: string;
};

type InventoryCategory = "arma" | "armadura" | "escudo" | "municion" | "herramienta" | "objeto";

type InventoryItem = {
  id: string;
  name: string;
  category: InventoryCategory;
  detail: string;
  quantity: number;
  equipped: boolean;
  armorBase?: number | null;
  maxDex?: number | null;
  acBonus?: number | null;
  damage?: string;
  notes?: string;
};

type InventoryState = {
  initialized?: boolean;
  entries: InventoryItem[];
};

type TraitEntry = {
  name: string;
  pdf_description?: string;
  kind?: string;
};

type SpellEntry = {
  id: number;
  level: number;
  name: string;
  prepared: boolean;
  included: boolean;
  always_prepared?: boolean;
  label?: string[];
  summary?: string;
  description?: string;
  range?: string;
  casting_time?: string;
  duration?: string;
  components?: string;
  school?: string;
};

type TraitDetail = {
  status: "loading" | "ready";
  text: string;
  source: "manual" | "api" | "pdf" | "none";
};

type StorySection = {
  title: string;
  text: string;
};

type AmmunitionEntry = {
  id: string;
  name: string;
  description: string;
  current: number;
  max: number;
};

type AmmunitionState = {
  visible: boolean;
  entries: AmmunitionEntry[];
};

type RestKind = "short" | "long";

type RestRules = {
  shortNotes: string[];
  longNotes: string[];
  shortResetsSpellSlots: boolean;
};

type RestTraitSource = {
  name: string;
  description: string;
};

type DndApiEntry = {
  desc?: string[];
};

const traitApiPaths: Record<string, string[]> = {
  "linaje draconico": ["/api/traits/draconic-ancestry"],
  "ataque de aliento": ["/api/traits/breath-weapon"],
  "resistencia al dano": ["/api/traits/damage-resistance"],
  "ataque adicional": ["/api/features/extra-attack"],
  "aura de proteccion": ["/api/features/aura-of-protection"],
  "canalizar divinidad": ["/api/features/channel-divinity"],
  "castigo divino": ["/api/features/divine-smite"],
  "defensa": ["/api/features/fighting-style-defense"],
  "imponer las manos": ["/api/features/lay-on-hands"],
  "lanzamiento de conjuros": ["/api/features/spellcasting-paladin"],
  "mejora de caracteristica": ["/api/features/ability-score-improvement"],
  "salud divina": ["/api/features/divine-health"],
  "sentidos divinos": ["/api/features/divine-sense"],
};

function normalizeTraitKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function looksSpanish(value: string): boolean {
  return /\b(el|la|los|las|una|unos|puedes|tienes|daño|acción|tirada|salvación|conjuro)\b/i.test(value);
}

function shortText(value: string, max = 120): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function spellDescription(spell: SpellEntry): string {
  return spell.summary || spell.description || "Sin descripción";
}

function shortSpellDescription(spell: SpellEntry): string {
  return shortText(spellDescription(spell), 160);
}

function spellComponentSiglas(spell: SpellEntry): string {
  return (spell.components ?? "")
    .replace(/\bverbal\b/gi, "V")
    .replace(/\bsom[aá]tico\b/gi, "S")
    .replace(/\bmaterial\b/gi, "M")
    .replace(/\s+/g, " ")
    .trim();
}

function spellCastSummary(spell: SpellEntry): string {
  return [spell.casting_time || "-", spell.range || "-", spell.duration || "-", spellComponentSiglas(spell)]
    .filter(Boolean)
    .join(" · ");
}

function isAlwaysPreparedSpell(spell: SpellEntry): boolean {
  return Boolean(spell.always_prepared) || Boolean(spell.label?.some((label) => /conjuros? de (juramento|dominio|artillero)/i.test(normalizeTraitKey(label))));
}

function isSpellReady(spell: SpellEntry, preparedSpellSet: Set<number>): boolean {
  return isAlwaysPreparedSpell(spell) || preparedSpellSet.has(spell.id);
}

function alwaysPreparedSource(spell: SpellEntry): string {
  const label = normalizeTraitKey(spell.label?.join(" ") ?? "");
  if (label.includes("juramento")) return "Por juramento";
  if (label.includes("dominio")) return "Por dominio";
  if (label.includes("artillero")) return "Por artillero";
  return "Automático";
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function slotCount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function slotMetaLabel(key: string): string {
  if (key === "cantrips") return "Trucos";
  if (key === "known_spells") return "Conocidos";
  return key;
}

function textValue(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function storyText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

function addStorySection(sections: StorySection[], title: string, value: string) {
  const text = storyText(value);
  if (text) sections.push({ title, text });
}

function splitFeatureDescription(value: string): StorySection | null {
  const text = storyText(value);
  if (!text) return null;
  const [firstLine = "", ...rest] = text.split("\n");
  if (/^RASGO\s*:/i.test(firstLine)) {
    return {
      title: firstLine.replace(/^RASGO\s*:/i, "Rasgo:"),
      text: rest.join("\n").trim() || text,
    };
  }
  return { title: "Rasgo de trasfondo", text };
}

function normalizeAmmunition(value: unknown): AmmunitionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { visible: false, entries: [] };
  }
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record.entries) ? record.entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const max = Math.max(0, Math.floor(numberFromUnknown(item.max) ?? 0));
    const current = Math.max(0, Math.min(max || Number.POSITIVE_INFINITY, Math.floor(numberFromUnknown(item.current) ?? max)));
    return [{
      id: typeof item.id === "string" && item.id ? item.id : `ammo-${index}`,
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Munición",
      description: typeof item.description === "string" ? item.description : "",
      current,
      max,
    }];
  }) : [];
  return { visible: Boolean(record.visible), entries };
}

function normalizeInventoryCategory(value: unknown): InventoryCategory {
  const key = normalizeTraitKey(String(value ?? ""));
  if (key.includes("escudo")) return "escudo";
  if (key.includes("armadura")) return "armadura";
  if (key.includes("municion")) return "municion";
  if (key.includes("herramienta")) return "herramienta";
  if (key.includes("arma")) return "arma";
  return "objeto";
}

function inferCategoryFromText(name: string, detail: string, kind = ""): InventoryCategory {
  const normalizedKind = normalizeTraitKey(kind);
  const text = normalizeTraitKey(`${name} ${detail}`);
  if (text.includes("escudo")) return "escudo";
  if (normalizedKind.includes("armadura") || /cuero|cota|coraza|armadura|placas|malla|escamas|anillas|peto|guanteletes/.test(text)) return "armadura";
  if (normalizedKind.includes("herramienta") || text.includes("kit") || text.includes("utiles") || text.includes("herramientas")) return "herramienta";
  if (normalizedKind.includes("arma")) return "arma";
  return "objeto";
}

type ArmorStats = { armorBase: number | null; maxDex: number | null };

function inferArmorStats(name: string, detail: string): ArmorStats {
  const text = normalizeTraitKey(`${name} ${detail}`);
  if (text.includes("protecsao")) return { armorBase: 17, maxDex: 0 };
  if (text.includes("cuero tachonado")) return { armorBase: 12, maxDex: null };
  if (text.includes("cuero") || text.includes("acolchada")) return { armorBase: 11, maxDex: null };
  if (text.includes("pieles")) return { armorBase: 12, maxDex: 2 };
  if (text.includes("camisote")) return { armorBase: 13, maxDex: 2 };
  if (text.includes("escamas")) return { armorBase: 14, maxDex: 2 };
  if (text.includes("coraza")) return { armorBase: 14, maxDex: 2 };
  if (text.includes("media armadura")) return { armorBase: 15, maxDex: 2 };
  if (text.includes("anillas")) return { armorBase: 14, maxDex: 0 };
  if (text.includes("cota de malla") || text.includes("malla") || text.includes("guanteletes")) return { armorBase: 16, maxDex: 0 };
  if (text.includes("bandas")) return { armorBase: 17, maxDex: 0 };
  if (text.includes("placas")) return { armorBase: 18, maxDex: 0 };
  return { armorBase: null, maxDex: null };
}

function inferShieldBonus(name: string, detail: string): number {
  const text = normalizeTraitKey(`${name} ${detail}`);
  if (text.includes("juramento")) return 1;
  return 2;
}

function inferInventoryItem(entry: EquipmentEntry, index: number): InventoryItem {
  const name = entry.name.trim() || "Objeto";
  const detail = entry.detail?.trim() ?? "";
  const category = inferCategoryFromText(name, detail, entry.kind ?? "");
  const { armorBase, maxDex } = category === "armadura" ? inferArmorStats(name, detail) : { armorBase: null, maxDex: null };
  const acBonus = category === "escudo" ? inferShieldBonus(name, detail) : null;

  return {
    id: `import-${normalizeTraitKey(name).replace(/[^a-z0-9]+/g, "-") || "objeto"}-${index}`,
    name,
    category,
    detail,
    quantity: 1,
    equipped: false,
    armorBase,
    maxDex,
    acBonus,
    damage: category === "arma" ? detail : "",
    notes: entry.quick_use ?? "",
  };
}

function itemArmorClass(item: InventoryItem, dexMod: number): number | null {
  if (item.category !== "armadura" || !item.armorBase) return null;
  const dex = item.maxDex === null || item.maxDex === undefined ? dexMod : Math.min(dexMod, item.maxDex);
  return item.armorBase + dex;
}

function armorFormulaLabel(item: InventoryItem): string {
  if (!item.armorBase) return "Sin CA base";
  if (item.maxDex === 0) return `CA ${item.armorBase} sin DES`;
  if (item.maxDex === null || item.maxDex === undefined) return `CA ${item.armorBase} + DES`;
  return `CA ${item.armorBase} + DES máx ${item.maxDex}`;
}

function inventoryItemStatsLabel(item: InventoryItem): string {
  if (item.category === "armadura") return armorFormulaLabel(item);
  if (item.category === "escudo") return `CA +${item.acBonus ?? 2}`;
  if (item.category === "arma" && item.damage) return item.damage;
  return "";
}

function hasDefenseStyle(raw: Record<string, unknown>, traits: TraitEntry[]): boolean {
  const text = normalizeTraitKey(collectRestTraitSources(raw, traits).map((source) => `${source.name} ${source.description}`).join("\n"));
  return /\bdefensa\b/.test(text) && /estilo de combate|armadura|ca/.test(text);
}

function calculateInventoryAc(input: {
  inventory: InventoryState;
  dexMod: number;
  wisMod: number;
  conMod: number;
  className: string;
  raw: Record<string, unknown>;
  traits: TraitEntry[];
}): { total: number; detail: string } {
  const classKey = normalizeTraitKey(input.className);
  const equippedArmor = input.inventory.entries
    .filter((item) => item.equipped && item.category === "armadura" && item.armorBase)
    .sort((a, b) => (itemArmorClass(b, input.dexMod) ?? 0) - (itemArmorClass(a, input.dexMod) ?? 0))[0];
  const armorAc = equippedArmor ? itemArmorClass(equippedArmor, input.dexMod) : null;
  const unarmoredBase = classKey.includes("monje") && !equippedArmor
    ? 10 + input.dexMod + input.wisMod
    : classKey.includes("barbaro") && !equippedArmor
      ? 10 + input.dexMod + input.conMod
      : 10 + input.dexMod;
  const base = armorAc ?? unarmoredBase;
  const shield = input.inventory.entries.find((item) => item.equipped && item.category === "escudo");
  const shieldBonus = shield ? (shield.acBonus ?? 2) : 0;
  const defenseBonus = equippedArmor && hasDefenseStyle(input.raw, input.traits) ? 1 : 0;
  const total = base + shieldBonus + defenseBonus;
  const detail = [
    equippedArmor ? `${equippedArmor.name} ${base}` : `Base ${base}`,
    shieldBonus ? `escudo +${shieldBonus}` : "",
    defenseBonus ? "Defensa +1" : "",
  ].filter(Boolean).join(" · ");
  return { total, detail };
}

function autoEquipInventory(entries: InventoryItem[], targetAc: number, dexMod: number, className: string, raw: Record<string, unknown>, traits: TraitEntry[]): InventoryItem[] {
  const baseEntries = entries.map((item) => ({ ...item, equipped: false }));
  const armorOptions = [undefined, ...baseEntries.filter((item) => item.category === "armadura" && item.armorBase)];
  const shieldOptions = [undefined, ...baseEntries.filter((item) => item.category === "escudo")];
  let best = baseEntries;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const armor of armorOptions) {
    for (const shield of shieldOptions) {
      const candidate = baseEntries.map((item) => ({ ...item, equipped: item.id === armor?.id || item.id === shield?.id }));
      const ac = calculateInventoryAc({ inventory: { entries: candidate }, dexMod, wisMod: 0, conMod: 0, className, raw, traits }).total;
      const diff = Math.abs(ac - targetAc);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
  }

  return best;
}

function normalizeInventory(value: unknown, importedEquipment: EquipmentEntry[], targetAc: number, dexMod: number, className: string, raw: Record<string, unknown>, traits: TraitEntry[]): InventoryState {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.entries) && (record.initialized || record.entries.length > 0)) {
      return {
        initialized: Boolean(record.initialized),
        entries: record.entries.flatMap((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const item = entry as Record<string, unknown>;
          const id = typeof item.id === "string" && item.id ? item.id : `inv-${index}`;
          const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "Objeto";
          const detail = typeof item.detail === "string" ? item.detail : "";
          const category = normalizeInventoryCategory(item.category);
          const inferredArmor = category === "armadura" ? inferArmorStats(name, detail) : { armorBase: null, maxDex: null };
          const storedArmorBase = numberFromUnknown(item.armorBase);
          const storedMaxDex = item.maxDex === null ? null : numberFromUnknown(item.maxDex);
          const storedAcBonus = numberFromUnknown(item.acBonus);
          const normalizedName = normalizeTraitKey(name);
          const normalizedText = normalizeTraitKey(`${name} ${detail}`);
          const legacyProtecsaoArmorBase = id.startsWith("import-") && normalizedName.includes("protecsao") && storedArmorBase === 16;
          const legacyJuramentoShieldBonus = id.startsWith("import-") && normalizedText.includes("juramento") && storedAcBonus === 2;
          return [{
            id,
            name,
            category,
            detail,
            quantity: Math.max(1, Math.floor(numberFromUnknown(item.quantity) ?? 1)),
            equipped: Boolean(item.equipped),
            armorBase: category === "armadura" ? (legacyProtecsaoArmorBase ? 17 : storedArmorBase ?? inferredArmor.armorBase) : storedArmorBase,
            maxDex: category === "armadura" ? (legacyProtecsaoArmorBase ? 0 : storedMaxDex ?? inferredArmor.maxDex) : storedMaxDex,
            acBonus: category === "escudo" ? (legacyJuramentoShieldBonus ? 1 : storedAcBonus ?? inferShieldBonus(name, detail)) : storedAcBonus,
            damage: typeof item.damage === "string" ? item.damage : "",
            notes: typeof item.notes === "string" ? item.notes : "",
          }];
        }),
      };
    }
  }

  const inferred = importedEquipment.map((entry, index) => inferInventoryItem(entry, index));
  return { initialized: false, entries: autoEquipInventory(inferred, targetAc, dexMod, className, raw, traits) };
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function pushTraitSources(list: RestTraitSource[], value: unknown) {
  if (!Array.isArray(value)) return;
  for (const entry of value) {
    if (typeof entry === "string") {
      list.push({ name: entry, description: "" });
      continue;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    list.push({
      name: typeof record.name === "string" ? record.name : typeof record.title === "string" ? record.title : "",
      description: typeof record.description === "string"
        ? record.description
        : typeof record.pdf_description === "string"
          ? record.pdf_description
          : "",
    });
  }
}

function collectRestTraitSources(raw: Record<string, unknown>, traits: TraitEntry[]): RestTraitSource[] {
  const sources: RestTraitSource[] = traits.map((trait) => ({ name: trait.name, description: trait.pdf_description ?? "" }));
  pushTraitSources(sources, raw.custom_feats);
  pushTraitSources(sources, raw.race_feats);
  if (Array.isArray(raw.professions)) {
    for (const profession of raw.professions) {
      if (!profession || typeof profession !== "object" || Array.isArray(profession)) continue;
      pushTraitSources(sources, (profession as Record<string, unknown>).feats);
    }
  }
  return sources;
}

function buildRestRules(input: {
  className: string;
  level: number;
  hasSpellSlots: boolean;
  raw: Record<string, unknown>;
  traits: TraitEntry[];
}): RestRules {
  const classKey = normalizeTraitKey(input.className);
  const sources = collectRestTraitSources(input.raw, input.traits);
  const combined = normalizeTraitKey(sources.map((source) => `${source.name} ${source.description}`).join("\n"));
  const has = (value: string | RegExp) => typeof value === "string" ? combined.includes(value) : value.test(combined);
  const shortNotes = ["Puedes gastar dados de golpe para curarte; ajusta el HP manualmente si lo haces."];
  const longNotes = ["HP actual al máximo y vida temporal a 0."];
  const longRestCaster = input.hasSpellSlots || /mago|bardo|paladin|paladin|druida|explorador|clerigo|artifice|brujo/.test(classKey);
  let shortResetsSpellSlots = false;

  if (longRestCaster) pushUnique(longNotes, "Recuperas todos los espacios de conjuro gastados.");
  if (has("recuperacion arcana") || classKey.includes("mago")) {
    const recoverLevels = Math.max(1, Math.ceil(input.level / 2));
    pushUnique(shortNotes, `Recuperación arcana: una vez al día puedes recuperar espacios con niveles combinados hasta ${recoverLevels} (máx. nivel 5); desmarca los espacios elegidos manualmente.`);
    pushUnique(longNotes, "Recuperas el uso diario de Recuperación arcana.");
  }
  if (has("cancion de descanso")) pushUnique(shortNotes, "Canción de descanso: si alguien gasta dados de golpe, suma el dado extra de bardo.");
  if (has("fuente de inspiracion")) {
    pushUnique(shortNotes, "Recuperas todos los usos de Inspiración bárdica.");
    pushUnique(longNotes, "Recuperas todos los usos de Inspiración bárdica.");
  }
  if (has("canalizar divinidad") || /paladin|clerigo/.test(classKey)) {
    pushUnique(shortNotes, "Recuperas Canalizar Divinidad.");
    pushUnique(longNotes, "Recuperas Canalizar Divinidad.");
  }
  if (has("imponer las manos") || classKey.includes("paladin")) pushUnique(longNotes, "Imponer las manos vuelve a su reserva completa.");
  if (has("forma salvaje") || classKey.includes("druida")) {
    pushUnique(shortNotes, "Recuperas los usos de Forma salvaje.");
    pushUnique(longNotes, "Recuperas los usos de Forma salvaje.");
  }
  if (has(/\bki\b/) || classKey.includes("monje")) {
    pushUnique(shortNotes, "Recuperas todos los puntos de ki.");
    pushUnique(longNotes, "Recuperas todos los puntos de ki.");
  }
  if (has("magia del pacto") || classKey.includes("brujo")) {
    shortResetsSpellSlots = true;
    pushUnique(shortNotes, "Magia del pacto: recuperas todos tus espacios de brujo.");
    pushUnique(longNotes, "Magia del pacto: recuperas todos tus espacios de brujo.");
  }
  if (has("maldicion del filo malefico")) {
    pushUnique(shortNotes, "Recuperas Maldición del Filo Maléfico.");
    pushUnique(longNotes, "Recuperas Maldición del Filo Maléfico.");
  }
  if (has("ataque de aliento")) {
    pushUnique(shortNotes, "Recuperas Ataque de aliento.");
    pushUnique(longNotes, "Recuperas Ataque de aliento.");
  }
  if (has("linaje celestial") || has("legado infernal") || has("magia drow")) {
    pushUnique(longNotes, "Recuperas los conjuros raciales de uso diario.");
  }
  if (has("guerrero malefico")) pushUnique(longNotes, "Puedes reasignar el arma vinculada de Guerrero Maléfico.");
  if (has("destello de genio")) pushUnique(longNotes, "Recuperas todos los usos de Destello de Genio.");
  if (has("canon sobrenatural")) pushUnique(longNotes, "Recuperas la creación gratuita del Cañón Sobrenatural.");
  if (has("arma de fuego arcana")) pushUnique(longNotes, "Puedes rehacer o cambiar tu Arma de Fuego Arcana tras el descanso largo.");
  if (has("la herramienta adecuada para la tarea")) {
    pushUnique(shortNotes, "Puedes crear la herramienta adecuada durante 1 hora que puede coincidir con este descanso.");
    pushUnique(longNotes, "Puedes crear la herramienta adecuada durante 1 hora que puede coincidir con este descanso.");
  }

  return { shortNotes, longNotes, shortResetsSpellSlots };
}

async function fetchTraitFromApi(name: string): Promise<string> {
  const paths = traitApiPaths[normalizeTraitKey(name)] ?? [];
  for (const path of paths) {
    try {
      const response = await fetch(`https://www.dnd5eapi.co${path}`);
      if (!response.ok) continue;
      const data = await response.json() as DndApiEntry;
      const description = Array.isArray(data.desc) ? data.desc.join("\n\n").trim() : "";
      if (description && looksSpanish(description)) return description;
    } catch {
      continue;
    }
  }
  return "";
}

const abilityOrder = [
  { key: "fuerza", label: "FUE" },
  { key: "destreza", label: "DES" },
  { key: "constitucion", label: "CON" },
  { key: "inteligencia", label: "INT" },
  { key: "sabiduria", label: "SAB" },
  { key: "carisma", label: "CAR" },
] as const;

export default function CharacterDetailPage() {
  const params = useParams<{ id: string }>();
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [rawPayload, setRawPayload] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState<"informacion" | "combate" | "rasgos" | "conjuros">("informacion");
  const [form, setForm] = useState<FormState>({
    name: "",
    class_name: "",
    level: "",
    race: "",
    background: "",
    hp: "",
    current_hp: "",
    temp_hp: "0",
    shields: "0",
    ac: "",
    speed: "",
    notes: "",
  });

  const ammunition = normalizeAmmunition(rawPayload.ammunition);
  const summary = (rawPayload.summary as Record<string, unknown> | undefined) ?? {};
  const sections = (rawPayload.sections as Record<string, string> | undefined) ?? {};
  const abilities = (summary.abilities as Record<string, { score?: number; modifier?: number }> | undefined) ?? {};
  const savingThrows = Array.isArray(summary.saving_throws) ? summary.saving_throws as CheckEntry[] : [];
  const skills = Array.isArray(summary.skills) ? summary.skills as CheckEntry[] : [];
  const attacks = Array.isArray(summary.attacks) ? summary.attacks as AttackEntry[] : [];
  const equipment = Array.isArray(summary.equipment) ? summary.equipment as EquipmentEntry[] : [];
  const traits = Array.isArray(summary.traits) ? summary.traits as TraitEntry[] : [];
  const spells = Array.isArray(summary.spells) ? summary.spells as SpellEntry[] : [];
  const raw = (rawPayload.raw as Record<string, unknown> | undefined) ?? {};
  const dexModifier = abilities.destreza?.modifier ?? 0;
  const wisModifier = abilities.sabiduria?.modifier ?? 0;
  const conModifier = abilities.constitucion?.modifier ?? 0;
  const inventory = normalizeInventory(rawPayload.inventory, equipment, Number(form.ac || 0), dexModifier, form.class_name, raw, traits);
  const calculatedAc = calculateInventoryAc({ inventory, dexMod: dexModifier, wisMod: wisModifier, conMod: conModifier, className: form.class_name, raw, traits });
  const backgroundStory = (raw.background && typeof raw.background === "object" && !Array.isArray(raw.background))
    ? raw.background as Record<string, unknown>
    : {};
  const fieldStory = (raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields))
    ? raw.fields as Record<string, unknown>
    : {};
  const storySections: StorySection[] = [];
  addStorySection(storySections, "Trasfondo", textValue(backgroundStory, "name") || form.background);
  addStorySection(storySections, "Rasgos de personalidad", textValue(backgroundStory, "traits"));
  addStorySection(storySections, "Ideales", textValue(backgroundStory, "ideals"));
  addStorySection(storySections, "Vínculos", textValue(backgroundStory, "bonds"));
  addStorySection(storySections, "Defectos", textValue(backgroundStory, "flaws"));
  const featureSection = splitFeatureDescription(textValue(backgroundStory, "feat_description"));
  if (featureSection) storySections.push(featureSection);
  addStorySection(storySections, "Historia del personaje", textValue(fieldStory, "historia"));
  addStorySection(storySections, "Apariencia", textValue(fieldStory, "apariencia"));
  addStorySection(storySections, "Idiomas", textValue(fieldStory, "idiomas"));
  addStorySection(storySections, "Alineamiento", textValue(fieldStory, "alineamiento"));
  addStorySection(storySections, "Edad", textValue(fieldStory, "edad"));
  addStorySection(storySections, "Notas adicionales", textValue(fieldStory, "notas"));
  const perceptionSkill = skills.find((entry) => normalizeTraitKey(entry.name) === "percepcion");
  const rawPassivePerception = numberFromUnknown(summary.passive_perception);
  const perceptionBonus = numberFromUnknown(perceptionSkill?.bonus);
  const passivePerception = rawPassivePerception !== null && rawPassivePerception > 0
    ? rawPassivePerception
    : perceptionBonus !== null
      ? 10 + perceptionBonus
      : rawPassivePerception;
  const spellMeta = (summary.spell_meta as {
    ability?: string | null;
    save_dc?: number | null;
    attack_bonus?: number | null;
    prepared_limit?: number | null;
    slots?: Record<string, string>;
  } | undefined) ?? {};
  const preparedSpellIds = Array.isArray(rawPayload.prepared_spell_ids)
    ? rawPayload.prepared_spell_ids.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
    : [];
  const combatFavorites = Array.isArray(rawPayload.combat_favorites)
    ? rawPayload.combat_favorites.map((entry) => String(entry))
    : [];
  const manualTraitDescriptions = (
    rawPayload.manual_trait_descriptions &&
    typeof rawPayload.manual_trait_descriptions === "object" &&
    !Array.isArray(rawPayload.manual_trait_descriptions)
  ) ? rawPayload.manual_trait_descriptions as Record<string, string> : {};
  const [openTraits, setOpenTraits] = useState<Record<string, boolean>>({});
  const [openTraitEditors, setOpenTraitEditors] = useState<Record<string, boolean>>({});
  const [openEquipment, setOpenEquipment] = useState<Record<string, boolean>>({});
  const [openSpells, setOpenSpells] = useState<Record<number, boolean>>({});
  const [openStorySections, setOpenStorySections] = useState<Record<string, boolean>>({});
  const [openRestBlock, setOpenRestBlock] = useState(false);
  const [openInventoryForm, setOpenInventoryForm] = useState(false);
  const [editingInventory, setEditingInventory] = useState<Record<string, boolean>>({});
  const [inventoryDraft, setInventoryDraft] = useState<InventoryItem>({
    id: "",
    name: "",
    category: "objeto",
    detail: "",
    quantity: 1,
    equipped: false,
    armorBase: null,
    maxDex: null,
    acBonus: null,
    damage: "",
    notes: "",
  });
  const [editingAmmunition, setEditingAmmunition] = useState<Record<string, boolean>>({});
  const [traitDetails, setTraitDetails] = useState<Record<string, TraitDetail>>({});
  const [traitDrafts, setTraitDrafts] = useState<Record<string, string>>({});

  const numericSpellSlots = Object.entries(spellMeta.slots ?? {})
    .filter(([level]) => /^\d+$/.test(level))
    .map(([level, count]) => ({ level, count: slotCount(count) }))
    .filter((slot) => slot.count > 0)
    .sort((a, b) => Number(a.level) - Number(b.level));
  const otherSpellSlotInfo = Object.entries(spellMeta.slots ?? {})
    .filter(([level]) => !/^\d+$/.test(level));
  const spellSlotsSpent = (
    rawPayload.spell_slots_spent &&
    typeof rawPayload.spell_slots_spent === "object" &&
    !Array.isArray(rawPayload.spell_slots_spent)
  ) ? Object.fromEntries(
      Object.entries(rawPayload.spell_slots_spent as Record<string, unknown>)
        .map(([level, count]) => [level, Math.max(0, Math.floor(numberFromUnknown(count) ?? 0))]),
    ) as Record<string, number> : {};

  const restRules = buildRestRules({
    className: form.class_name,
    level: Number(form.level || 0),
    hasSpellSlots: numericSpellSlots.length > 0,
    raw,
    traits,
  });
  const preparedLimit = typeof spellMeta.prepared_limit === "number" ? spellMeta.prepared_limit : 0;
  const preparedSpellSet = new Set(preparedSpellIds);
  const preparedCount = spells.filter((spell) => preparedSpellSet.has(spell.id) && !isAlwaysPreparedSpell(spell)).length;
  const preparedCombatSpells = spells.filter((spell) => isSpellReady(spell, preparedSpellSet));
  const combatTraits = traits.filter((trait) => combatFavorites.includes(normalizeTraitKey(trait.name)));

  function hydrate(detail: CharacterDetail) {
    setForm({
      name: detail.name ?? "",
      class_name: detail.class_name ?? "",
      level: detail.level?.toString() ?? "",
      race: detail.race ?? "",
      background: detail.background ?? "",
      hp: detail.hp?.toString() ?? "",
      current_hp: (detail.current_hp ?? detail.hp ?? 0).toString(),
      temp_hp: (detail.temp_hp ?? 0).toString(),
      shields: (detail.shields ?? 0).toString(),
      ac: detail.ac?.toString() ?? "",
      speed: detail.speed?.toString() ?? "",
      notes: detail.notes ?? "",
    });
  }

  const loadData = useCallback(async (uid: string, characterId: string) => {
    const detail = await getCharacterDetail(uid, characterId);
    if (!detail) {
      setMessage("Personaje no encontrado o sin acceso.");
      return;
    }

    const payload = (detail.source_payload ?? {}) as {
      raw_text?: string;
      raw?: Record<string, unknown>;
      nivel20?: Record<string, unknown>;
      prepared_spell_ids?: unknown[];
      combat_favorites?: unknown[];
      source_payload?: {
        raw_text?: string;
        raw?: Record<string, unknown>;
        nivel20?: Record<string, unknown>;
        prepared_spell_ids?: unknown[];
        combat_favorites?: unknown[];
        spell_slots_spent?: Record<string, number>;
        ammunition?: Record<string, unknown>;
        inventory?: Record<string, unknown>;
        summary?: Record<string, unknown>;
        sections?: Record<string, string>;
      };
      [key: string]: unknown;
    };

    const normalizedPayload = payload.source_payload
      ? {
          ...payload,
          raw_text: payload.raw_text ?? payload.source_payload.raw_text,
          raw: payload.raw ?? payload.source_payload.raw,
          nivel20: payload.nivel20 ?? payload.source_payload.nivel20,
          prepared_spell_ids: payload.prepared_spell_ids ?? payload.source_payload.prepared_spell_ids,
          combat_favorites: payload.combat_favorites ?? payload.source_payload.combat_favorites,
          spell_slots_spent: detail.spell_slots_spent ?? payload.spell_slots_spent ?? payload.source_payload.spell_slots_spent,
          ammunition: detail.ammunition ?? payload.ammunition ?? payload.source_payload.ammunition,
          inventory: detail.inventory ?? payload.inventory ?? payload.source_payload.inventory,
          summary: payload.summary ?? payload.source_payload.summary,
          sections: payload.sections ?? payload.source_payload.sections,
        }
      : {
          ...payload,
          spell_slots_spent: detail.spell_slots_spent ?? payload.spell_slots_spent,
          ammunition: detail.ammunition ?? payload.ammunition,
          inventory: detail.inventory ?? payload.inventory,
        };

    const reparsed = normalizedPayload.raw_text ? parseImportedCharacter(normalizedPayload.raw_text) : null;
    const rebuilt = reparsed?.source_payload
      ? {
          ...normalizedPayload,
          ...reparsed.source_payload,
        }
      : normalizedPayload;

    if (reparsed) {
      setForm({
        name: reparsed.name || detail.name || "",
        class_name: reparsed.class_name || detail.class_name || "",
        level: (reparsed.level ?? detail.level)?.toString() ?? "",
        race: reparsed.race || detail.race || "",
        background: reparsed.background || detail.background || "",
        hp: (reparsed.hp ?? detail.hp)?.toString() ?? "",
        current_hp: (detail.current_hp ?? reparsed.hp ?? detail.hp ?? 0).toString(),
        temp_hp: (detail.temp_hp ?? 0).toString(),
        shields: (detail.shields ?? 0).toString(),
        ac: (reparsed.ac ?? detail.ac)?.toString() ?? "",
        speed: (reparsed.speed ?? detail.speed)?.toString() ?? "",
        notes: reparsed.notes || detail.notes || "",
      });
    } else {
      hydrate(detail);
    }

    setRawPayload(rebuilt);
  }, []);

  useEffect(() => {
    void (async () => {
      const user = await getCurrentAppUser();
      if (!user) {
        window.location.href = "/";
        return;
      }
      setUserId(user.user_id);
      await loadData(user.user_id, params.id);
    })();
  }, [loadData, params.id]);

  async function onSave() {
    if (!userId) return;
    try {
      setMessage("");
      await updateCharacterDetail(userId, params.id, {
        name: form.name,
        class_name: form.class_name,
        level: form.level ? Number(form.level) : null,
        race: form.race,
        background: form.background,
        hp: form.hp ? Number(form.hp) : null,
        current_hp: form.current_hp ? Number(form.current_hp) : 0,
        temp_hp: form.temp_hp ? Number(form.temp_hp) : 0,
        shields: form.shields ? Number(form.shields) : 0,
        ac: form.ac ? Number(form.ac) : null,
        speed: form.speed ? Number(form.speed) : null,
        notes: form.notes,
      });
      await loadData(userId, params.id);
      setMessage("Guardado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar");
    }
  }

  async function applyRest(kind: RestKind) {
    if (!userId) return;
    const resetSpellSlots = kind === "long" || (kind === "short" && restRules.shortResetsSpellSlots);
    const nextForm = kind === "long"
      ? { ...form, current_hp: String(hpMax || 0), temp_hp: "0" }
      : form;

    try {
      setMessage("");
      if (kind === "long") {
        await updateCharacterDetail(userId, params.id, {
          name: nextForm.name,
          class_name: nextForm.class_name,
          level: nextForm.level ? Number(nextForm.level) : null,
          race: nextForm.race,
          background: nextForm.background,
          hp: nextForm.hp ? Number(nextForm.hp) : null,
          current_hp: nextForm.current_hp ? Number(nextForm.current_hp) : 0,
          temp_hp: nextForm.temp_hp ? Number(nextForm.temp_hp) : 0,
          shields: nextForm.shields ? Number(nextForm.shields) : 0,
          ac: nextForm.ac ? Number(nextForm.ac) : null,
          speed: nextForm.speed ? Number(nextForm.speed) : null,
          notes: nextForm.notes,
        });
        setForm(nextForm);
      }
      if (resetSpellSlots) {
        await updateCharacterSpellSlots(userId, params.id, {});
        setRawPayload((current) => ({ ...current, spell_slots_spent: {} }));
      }
      setMessage(kind === "long"
        ? "Descanso largo aplicado. Revisa los recordatorios específicos."
        : "Descanso corto aplicado. Revisa los recordatorios específicos.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo aplicar el descanso");
    }
  }

  async function onDelete() {
    if (!userId) return;
    const ok = window.confirm("Esto borrara el personaje definitivamente. Quieres continuar?");
    if (!ok) return;
    try {
      await deleteCharacter(userId, params.id);
      window.location.href = "/characters";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo borrar el personaje");
    }
  }

  const subtitle = useMemo(() => {
    const classPart = form.class_name || "Sin clase";
    const levelPart = form.level ? `Nivel ${form.level}` : "Nivel -";
    return `${classPart} - ${levelPart}`;
  }, [form.class_name, form.level]);

  function updateCounter(field: "current_hp" | "temp_hp" | "shields", delta: number, max?: number) {
    setForm((current) => {
      const value = Number(current[field] || 0);
      const next = Math.max(0, Math.min(max ?? Number.POSITIVE_INFINITY, value + delta));
      return { ...current, [field]: String(next) };
    });
  }

  function setCounter(field: "current_hp" | "temp_hp" | "shields", value: string, max?: number) {
    const parsed = Number(value);
    const normalized = Number.isFinite(parsed) ? Math.max(0, Math.min(max ?? Number.POSITIVE_INFINITY, parsed)) : 0;
    setForm((current) => ({ ...current, [field]: String(normalized) }));
  }

  const hpMax = Number(form.hp || 0);
  const speedFeet = Number(form.speed || 0);
  const speedSquares = speedFeet > 0 ? Math.floor(speedFeet / 5) : null;

  function renderCheckCards(
    entries: CheckEntry[],
    fallback: string,
    gridClassName = "grid-cols-1 sm:grid-cols-2",
    centerLastPair = false,
  ) {
    if (!entries.length) {
      return <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{fallback || "-"}</p>;
    }

    return (
      <div className={`mt-2 grid gap-2 ${gridClassName}`}>
        {entries.map((entry, index) => {
          const shouldCenterPair = centerLastPair && entries.length % 4 === 2 && index === entries.length - 2;
          return (
          <div
            key={entry.name}
            className={`rounded-lg border p-2 ${entry.proficient ? "border-[#d3a84a66] bg-[#d3a84a12]" : "border-[#d3a84a44] bg-black/25"} ${shouldCenterPair ? "xl:col-start-2" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 text-sm text-[#d9c89e]">{entry.name}</p>
              <p className="text-lg font-semibold text-[#f3dfac]">{entry.bonus}</p>
            </div>
          </div>
          );
        })}
      </div>
    );
  }

  function renderAttackCards(entries: AttackEntry[], fallback: string) {
    if (!entries.length) {
      return <p className="mt-3 whitespace-pre-wrap text-sm text-[#d9c89e]">{fallback || "Sin ataques detectados todavía."}</p>;
    }

    return (
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {entries.map((entry) => (
          <div key={`${entry.name}-${entry.bonus}-${entry.damage}`} className="rounded-lg border border-[#d3a84a44] bg-black/25 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-[#f3dfac]">{entry.name}</p>
              <p className="text-lg font-semibold text-[#f3dfac]">{entry.bonus}</p>
            </div>
            <p className="mt-1 text-sm text-[#d9c89e]">{entry.damage} {entry.damageType}</p>
          </div>
        ))}
      </div>
    );
  }

  async function persistInventory(next: InventoryState) {
    if (!userId) return;
    const normalizedNext = { ...next, initialized: true };
    setRawPayload((current) => ({ ...current, inventory: normalizedNext }));
    await updateCharacterInventory(userId, params.id, normalizedNext);
  }

  async function updateInventoryItem(itemId: string, patch: Partial<InventoryItem>) {
    const currentItem = inventory.entries.find((item) => item.id === itemId);
    const draftItem = currentItem ? { ...currentItem, ...patch } : null;
    const inferredArmor = draftItem && draftItem.category === "armadura" ? inferArmorStats(draftItem.name, draftItem.detail) : { armorBase: null, maxDex: null };
    const normalizedPatch: Partial<InventoryItem> = { ...patch };
    if (draftItem && (patch.category || patch.name !== undefined || patch.detail !== undefined)) {
      if (draftItem.category === "armadura") {
        normalizedPatch.armorBase = patch.armorBase ?? (patch.category ? inferredArmor.armorBase : currentItem?.armorBase ?? inferredArmor.armorBase);
        normalizedPatch.maxDex = patch.maxDex ?? (patch.category ? inferredArmor.maxDex : currentItem?.maxDex ?? inferredArmor.maxDex);
        normalizedPatch.acBonus = null;
      }
      if (draftItem.category === "escudo") {
        normalizedPatch.acBonus = patch.acBonus ?? (patch.category ? inferShieldBonus(draftItem.name, draftItem.detail) : currentItem?.acBonus ?? inferShieldBonus(draftItem.name, draftItem.detail));
        normalizedPatch.armorBase = null;
        normalizedPatch.maxDex = null;
      }
      if (draftItem.category !== "armadura" && draftItem.category !== "escudo") {
        normalizedPatch.armorBase = null;
        normalizedPatch.maxDex = null;
        normalizedPatch.acBonus = patch.acBonus ?? null;
      }
    }

    const nextEquipped = normalizedPatch.equipped ?? currentItem?.equipped;
    const nextCategory = normalizedPatch.category ?? currentItem?.category;
    const nextEntries = inventory.entries.map((item) => {
      if (item.id === itemId) {
        return { ...item, ...normalizedPatch };
      }
      if (nextEquipped && (nextCategory === "armadura" || nextCategory === "escudo") && item.category === nextCategory) {
        return { ...item, equipped: false };
      }
      return item;
    });
    await persistInventory({ entries: nextEntries });
    setMessage("Inventario actualizado.");
  }

  async function removeInventoryItem(itemId: string) {
    await persistInventory({ entries: inventory.entries.filter((item) => item.id !== itemId) });
    setMessage("Objeto eliminado del inventario.");
  }

  async function addInventoryItem() {
    const name = inventoryDraft.name.trim();
    if (!name) {
      setMessage("Pon un nombre al objeto.");
      return;
    }
    const nextIdBase = `manual-${normalizeTraitKey(name).replace(/[^a-z0-9]+/g, "-") || "objeto"}`;
    const nextId = `${nextIdBase}-${inventory.entries.filter((item) => item.id.startsWith(nextIdBase)).length + 1}`;
    const nextItem: InventoryItem = {
      ...inventoryDraft,
      id: nextId,
      name,
      detail: inventoryDraft.detail.trim(),
      quantity: Math.max(1, Math.floor(inventoryDraft.quantity || 1)),
      armorBase: inventoryDraft.category === "armadura" ? inventoryDraft.armorBase : null,
      maxDex: inventoryDraft.category === "armadura" ? inventoryDraft.maxDex : null,
      acBonus: inventoryDraft.category === "escudo" ? (inventoryDraft.acBonus ?? inferShieldBonus(name, inventoryDraft.detail)) : inventoryDraft.acBonus,
    };
    await persistInventory({ entries: [...inventory.entries, nextItem] });
    setInventoryDraft({ id: "", name: "", category: "objeto", detail: "", quantity: 1, equipped: false, armorBase: null, maxDex: null, acBonus: null, damage: "", notes: "" });
    setOpenInventoryForm(false);
    setMessage("Objeto añadido al inventario.");
  }

  function renderInventoryItemEditor(item: InventoryItem) {
    return (
      <div className="mt-3 grid gap-2 border-t border-[#d3a84a33] pt-3 text-xs text-[#b9ae8d] md:grid-cols-2">
        <label>
          Nombre
          <input className="field mt-1" value={item.name} onChange={(event) => void updateInventoryItem(item.id, { name: event.target.value })} />
        </label>
        <label>
          Tipo
          <select className="field mt-1" value={item.category} onChange={(event) => void updateInventoryItem(item.id, { category: event.target.value as InventoryCategory })}>
            <option value="arma">Arma</option>
            <option value="armadura">Armadura</option>
            <option value="escudo">Escudo</option>
            <option value="herramienta">Herramienta</option>
            <option value="objeto">Objeto</option>
          </select>
        </label>
        <label>
          Cantidad
          <input className="field mt-1" inputMode="numeric" value={item.quantity} onChange={(event) => void updateInventoryItem(item.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
        </label>
        <label>
          Daño / uso de arma
          <input className="field mt-1" value={item.damage ?? ""} onChange={(event) => void updateInventoryItem(item.id, { damage: event.target.value })} />
        </label>
        <label>
          CA base armadura
          <input className="field mt-1" inputMode="numeric" value={item.armorBase ?? ""} onChange={(event) => void updateInventoryItem(item.id, { armorBase: event.target.value ? Number(event.target.value) : null })} />
        </label>
        <label>
          Máx. DES
          <input className="field mt-1" inputMode="numeric" placeholder="Vacío = sin límite, 0 = sin DES" value={item.maxDex ?? ""} onChange={(event) => void updateInventoryItem(item.id, { maxDex: event.target.value ? Number(event.target.value) : null })} />
        </label>
        <label>
          Bonus CA
          <input className="field mt-1" inputMode="numeric" value={item.acBonus ?? ""} onChange={(event) => void updateInventoryItem(item.id, { acBonus: event.target.value ? Number(event.target.value) : null })} />
        </label>
        <label className="md:col-span-2">
          Detalle / notas
          <textarea className="field mt-1 min-h-20" value={item.detail} onChange={(event) => void updateInventoryItem(item.id, { detail: event.target.value })} />
        </label>
        <button className="rounded border border-red-400/60 px-2 py-2 text-xs text-red-300 hover:bg-red-900/30 md:w-fit" type="button" onClick={() => void removeInventoryItem(item.id)}>Eliminar objeto</button>
      </div>
    );
  }

  function renderInventoryBlock() {
    return (
      <div>
        <div className="mt-3 rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">CA por equipo</p>
              <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{calculatedAc.total}</p>
              <p className="text-xs text-[#b9ae8d]">{calculatedAc.detail}</p>
            </div>
            <button className="btn-secondary px-3 py-2 text-xs" type="button" onClick={() => setOpenInventoryForm((current) => !current)}>
              {openInventoryForm ? "Cerrar" : "Añadir equipo"}
            </button>
          </div>
          {openInventoryForm ? (
            <div className="mt-3 grid gap-2 border-t border-[#d3a84a33] pt-3 text-xs text-[#b9ae8d] md:grid-cols-2">
              <input className="field" placeholder="Nombre" value={inventoryDraft.name} onChange={(event) => setInventoryDraft((current) => ({ ...current, name: event.target.value }))} />
              <select className="field" value={inventoryDraft.category} onChange={(event) => setInventoryDraft((current) => {
                const category = event.target.value as InventoryCategory;
                const armor = category === "armadura" ? inferArmorStats(current.name, current.detail) : { armorBase: null, maxDex: null };
                return {
                  ...current,
                  category,
                  armorBase: category === "armadura" ? (current.armorBase ?? armor.armorBase) : null,
                  maxDex: category === "armadura" ? (current.maxDex ?? armor.maxDex) : null,
                  acBonus: category === "escudo" ? (current.acBonus ?? inferShieldBonus(current.name, current.detail)) : null,
                };
              })}>
                <option value="arma">Arma</option>
                <option value="armadura">Armadura</option>
                <option value="escudo">Escudo</option>
                <option value="herramienta">Herramienta</option>
                <option value="objeto">Objeto</option>
              </select>
              <input className="field" inputMode="numeric" placeholder="Cantidad" value={inventoryDraft.quantity} onChange={(event) => setInventoryDraft((current) => ({ ...current, quantity: Math.max(1, Number(event.target.value) || 1) }))} />
              <input className="field" placeholder="Daño / uso" value={inventoryDraft.damage ?? ""} onChange={(event) => setInventoryDraft((current) => ({ ...current, damage: event.target.value }))} />
              <input className="field" inputMode="numeric" placeholder="CA base armadura" value={inventoryDraft.armorBase ?? ""} onChange={(event) => setInventoryDraft((current) => ({ ...current, armorBase: event.target.value ? Number(event.target.value) : null }))} />
              <input className="field" inputMode="numeric" placeholder="Máx. DES, 0 = sin DES" value={inventoryDraft.maxDex ?? ""} onChange={(event) => setInventoryDraft((current) => ({ ...current, maxDex: event.target.value ? Number(event.target.value) : null }))} />
              <input className="field" inputMode="numeric" placeholder="Bonus CA" value={inventoryDraft.acBonus ?? ""} onChange={(event) => setInventoryDraft((current) => ({ ...current, acBonus: event.target.value ? Number(event.target.value) : null }))} />
              <textarea className="field min-h-20 md:col-span-2" placeholder="Detalle o notas" value={inventoryDraft.detail} onChange={(event) => setInventoryDraft((current) => ({ ...current, detail: event.target.value }))} />
              <button className="btn-primary md:w-fit" type="button" onClick={() => void addInventoryItem()}>Guardar objeto</button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {inventory.entries.map((item) => {
            const isOpen = openEquipment[item.id] ?? false;
            const isEditing = editingInventory[item.id] ?? false;
            const preview = item.detail ? shortText(item.detail, 90) : item.damage ? shortText(item.damage, 90) : "";
            const equippedClass = item.equipped ? "border-[#d3a84aaa] bg-[#d3a84a18]" : "border-[#d3a84a44] bg-black/25";
            return (
              <div key={item.id} className={`rounded-lg border ${equippedClass}`}>
                <div className="p-3">
                  <button className="flex w-full items-start justify-between gap-3 text-left" type="button" onClick={() => setOpenEquipment((current) => ({ ...current, [item.id]: !isOpen }))}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#f3dfac]">{item.name}</span>
                      <span className="text-xs text-[#b9ae8d]">{item.category} · x{item.quantity}{item.equipped ? " · equipado" : ""}</span>
                      {inventoryItemStatsLabel(item) ? <span className="block text-xs text-[#d9c89e]">{inventoryItemStatsLabel(item)}</span> : null}
                      {preview ? <span className="mobile-detail block text-xs text-[#b9ae8d]">{preview}</span> : null}
                    </span>
                    <span className="shrink-0 text-[#b9ae8d]">{isOpen ? "-" : "+"}</span>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(item.category === "arma" || item.category === "armadura" || item.category === "escudo") ? (
                      <button className={item.equipped ? "btn-primary px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"} type="button" onClick={() => void updateInventoryItem(item.id, { equipped: !item.equipped })}>
                        {item.equipped ? "Desequipar" : "Equipar"}
                      </button>
                    ) : null}
                    <button className="btn-secondary px-3 py-2 text-xs" type="button" onClick={() => setEditingInventory((current) => ({ ...current, [item.id]: !isEditing }))}>{isEditing ? "Listo" : "Editar"}</button>
                  </div>
                  {isOpen ? (
                    <div className="mt-3 border-t border-[#d3a84a33] pt-3 text-sm text-[#d9c89e]">
                      {item.damage ? <p><span className="text-[#b9ae8d]">Daño/uso:</span> {item.damage}</p> : null}
                      {item.category === "armadura" ? <p><span className="text-[#b9ae8d]">Armadura:</span> {armorFormulaLabel(item)}</p> : null}
                      {item.acBonus ? <p><span className="text-[#b9ae8d]">Bonus CA:</span> +{item.acBonus}</p> : null}
                      <p className="mt-2 whitespace-pre-wrap"><span className="text-[#b9ae8d]">Detalle:</span> {item.detail || "Sin detalle"}</p>
                    </div>
                  ) : null}
                  {isEditing ? renderInventoryItemEditor(item) : null}
                </div>
              </div>
            );
          })}
          {!inventory.entries.length ? <p className="mt-3 whitespace-pre-wrap text-sm text-[#d9c89e]">Sin equipo importado todavía.</p> : null}
        </div>
      </div>
    );
  }

  async function toggleTrait(trait: TraitEntry) {
    const key = normalizeTraitKey(trait.name);
    const willOpen = !openTraits[key];
    setOpenTraits((current) => ({ ...current, [key]: willOpen }));
    setTraitDrafts((current) => ({
      ...current,
      [key]: current[key] ?? manualTraitDescriptions[key] ?? trait.pdf_description ?? "",
    }));

    if (!willOpen || traitDetails[key]) return;

    setTraitDetails((current) => ({
      ...current,
      [key]: { status: "loading", text: "", source: "none" },
    }));

    const manualDescription = manualTraitDescriptions[key]?.trim() ?? "";
    if (manualDescription) {
      setTraitDetails((current) => ({
        ...current,
        [key]: {
          status: "ready",
          text: manualDescription,
          source: "manual",
        },
      }));
      return;
    }

    const importedDescription = (trait.pdf_description?.trim() || findTraitDescriptionInRawPayload(trait.name)).trim();
    if (importedDescription) {
      setTraitDetails((current) => ({
        ...current,
        [key]: {
          status: "ready",
          text: importedDescription,
          source: "pdf",
        },
      }));
      return;
    }

    const apiDescription = await fetchTraitFromApi(trait.name);
    setTraitDetails((current) => ({
      ...current,
      [key]: {
        status: "ready",
        text: apiDescription || "Sin descripción disponible en español.",
        source: apiDescription ? "api" : "none",
      },
    }));
  }

  async function saveManualTrait(trait: TraitEntry) {
    if (!userId) return;
    const key = normalizeTraitKey(trait.name);
    const nextText = traitDrafts[key]?.trim() ?? "";
    const nextManualDescriptions = { ...manualTraitDescriptions };
    if (nextText) {
      nextManualDescriptions[key] = nextText;
    } else {
      delete nextManualDescriptions[key];
    }

    const nextPayload = {
      ...rawPayload,
      manual_trait_descriptions: nextManualDescriptions,
    };

    await updateCharacterSourcePayload(userId, params.id, nextPayload);
    setRawPayload(nextPayload);
    setTraitDetails((current) => ({
      ...current,
      [key]: {
        status: "ready",
        text: nextText || trait.pdf_description || "Sin descripción disponible en español.",
        source: nextText ? "manual" : (trait.pdf_description ? "pdf" : "none"),
      },
    }));
    setOpenTraitEditors((current) => ({ ...current, [key]: false }));
    setMessage(nextText ? "Descripción manual guardada." : "Descripción manual eliminada.");
  }

  async function persistLocalPayload(patch: Record<string, unknown>) {
    if (!userId) return;
    const nextPayload = {
      ...rawPayload,
      ...patch,
    };
    await updateCharacterSourcePayload(userId, params.id, nextPayload);
    setRawPayload(nextPayload);
  }

  async function toggleCombatTrait(trait: TraitEntry) {
    const key = normalizeTraitKey(trait.name);
    const next = combatFavorites.includes(key)
      ? combatFavorites.filter((entry) => entry !== key)
      : [...combatFavorites, key];
    await persistLocalPayload({ combat_favorites: next });
    setMessage(next.includes(key) ? "Rasgo añadido a combate." : "Rasgo quitado de combate.");
  }

  async function togglePreparedSpell(spell: SpellEntry) {
    const isAutoPrepared = isAlwaysPreparedSpell(spell);
    const isPrepared = isSpellReady(spell, preparedSpellSet);
    if (isAutoPrepared) {
      setMessage("Este conjuro siempre está preparado y no cuenta para el límite.");
      return;
    }
    if (!isPrepared && preparedLimit > 0 && preparedCount >= preparedLimit) {
      setMessage(`Solo puedes preparar ${preparedLimit} conjuros.`);
      return;
    }

    const next = isPrepared
      ? preparedSpellIds.filter((entry) => entry !== spell.id)
      : [...preparedSpellIds, spell.id];
    await persistLocalPayload({ prepared_spell_ids: next });
    setMessage(isPrepared ? "Conjuro desmarcado." : "Conjuro preparado.");
  }

  async function toggleSpentSpellSlot(level: string, index: number) {
    if (!userId) return;
    const currentSpent = spellSlotsSpent[level] ?? 0;
    const nextSpent = index < currentSpent ? index : index + 1;
    const next = { ...spellSlotsSpent, [level]: nextSpent };
    if (nextSpent <= 0) delete next[level];

    await updateCharacterSpellSlots(userId, params.id, next);
    setRawPayload((current) => ({ ...current, spell_slots_spent: next }));
    setMessage("Espacios de conjuro actualizados.");
  }

  function renderRestBlock() {
    return (
      <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-3">
        <button
          className="flex w-full items-center justify-between gap-3 text-left"
          type="button"
          onClick={() => setOpenRestBlock((current) => !current)}
        >
          <span className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Descansos</span>
          <span className="text-xs text-[#b9ae8d]">{openRestBlock ? "-" : "+"}</span>
        </button>
        {openRestBlock ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-[#d3a84a44] bg-black/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#f3dfac]">Descanso corto</p>
                <button className="btn-secondary px-3 py-2 text-xs" type="button" onClick={() => void applyRest("short")}>Corto</button>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#d9c89e]">
                {restRules.shortNotes.map((note) => <li key={`short-${note}`}>{note}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border border-[#d3a84a44] bg-black/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#f3dfac]">Descanso largo</p>
                <button className="btn-primary px-3 py-2 text-xs" type="button" onClick={() => void applyRest("long")}>Largo</button>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-[#d9c89e]">
                {restRules.longNotes.map((note) => <li key={`long-${note}`}>{note}</li>)}
              </ul>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  function renderCombatSpellSlotTracker() {
    if (!numericSpellSlots.length) {
      return <p className="mt-2 text-sm text-[#d9c89e]">Sin espacios de conjuro detectados.</p>;
    }

    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {numericSpellSlots.map((slot) => {
          const spent = Math.min(spellSlotsSpent[slot.level] ?? 0, slot.count);
          return (
            <div key={`combat-slot-${slot.level}`} className="rounded-lg border border-[#d3a84a44] bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[#f3dfac]">Nivel {slot.level}</p>
                <p className="text-xs text-[#b9ae8d]">Gastados {spent}/{slot.count}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: slot.count }, (_, index) => {
                  const isSpent = index < spent;
                  return (
                    <button
                      key={`combat-slot-${slot.level}-${index}`}
                      className={isSpent
                        ? "h-8 w-8 rounded-md border border-red-300/70 bg-red-900/40"
                        : "h-8 w-8 rounded-md border border-[#d3a84a88] bg-[#d3a84a22] hover:bg-[#d3a84a33]"}
                      type="button"
                      aria-label={`Marcar espacio ${index + 1} de nivel ${slot.level}`}
                      title={isSpent ? "Gastado" : "Disponible"}
                      onClick={() => void toggleSpentSpellSlot(slot.level, index)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  async function persistAmmunition(next: AmmunitionState) {
    if (!userId) return;
    await updateCharacterAmmunition(userId, params.id, next);
    setRawPayload((current) => ({ ...current, ammunition: next }));
  }

  async function setAmmunitionVisible(visible: boolean) {
    await persistAmmunition({ ...ammunition, visible });
    setMessage(visible ? "Munición visible en combate." : "Munición oculta en combate.");
  }

  async function addAmmunitionEntry() {
    let index = ammunition.entries.length + 1;
    let id = `ammo-${index}`;
    while (ammunition.entries.some((entry) => entry.id === id)) {
      index += 1;
      id = `ammo-${index}`;
    }
    await persistAmmunition({
      visible: true,
      entries: [
        ...ammunition.entries,
        { id, name: "Munición", description: "", current: 20, max: 20 },
      ],
    });
    setEditingAmmunition((current) => ({ ...current, [id]: true }));
  }

  async function updateAmmunitionEntry(id: string, patch: Partial<AmmunitionEntry>) {
    const entries = ammunition.entries.map((entry) => {
      if (entry.id !== id) return entry;
      const next = { ...entry, ...patch };
      const max = Math.max(0, Math.floor(numberFromUnknown(next.max) ?? 0));
      const current = Math.max(0, Math.min(max || Number.POSITIVE_INFINITY, Math.floor(numberFromUnknown(next.current) ?? 0)));
      return { ...next, max, current };
    });
    await persistAmmunition({ ...ammunition, entries });
  }

  async function removeAmmunitionEntry(id: string) {
    await persistAmmunition({
      ...ammunition,
      entries: ammunition.entries.filter((entry) => entry.id !== id),
    });
  }

  function renderAmmunitionBlock() {
    if (!ammunition.visible) {
      return (
        <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Munición</p>
              <p className="mobile-detail mt-1 text-sm text-[#d9c89e]">Oculta para este personaje.</p>
            </div>
            <button className="btn-secondary" type="button" onClick={() => void setAmmunitionVisible(true)}>Mostrar munición</button>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Munición</p>
            <p className="mobile-detail mt-1 text-sm text-[#d9c89e]">Contadores personalizables para flechas, virotes, balas u otros recursos.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" type="button" onClick={() => void addAmmunitionEntry()}>Añadir bloque</button>
            <button className="btn-secondary" type="button" onClick={() => void setAmmunitionVisible(false)}>Ocultar</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {ammunition.entries.map((entry) => {
            const isEditing = editingAmmunition[entry.id] ?? false;
            return (
            <div key={entry.id} className="rounded-lg border border-[#d3a84a44] bg-black/25 p-2.5">
              {isEditing ? (
                <>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <input
                      className="field"
                      value={entry.name}
                      placeholder="Nombre del bloque"
                      onChange={(event) => void updateAmmunitionEntry(entry.id, { name: event.target.value })}
                    />
                    <button className="btn-secondary px-3 py-2" type="button" onClick={() => setEditingAmmunition((current) => ({ ...current, [entry.id]: false }))}>Listo</button>
                    <button className="rounded border border-red-400/60 px-2 text-xs text-red-300 hover:bg-red-900/30" type="button" onClick={() => void removeAmmunitionEntry(entry.id)}>Quitar</button>
                  </div>
                  <textarea
                    className="field mt-2 min-h-20"
                    value={entry.description}
                    placeholder="Descripción o notas de uso"
                    onChange={(event) => void updateAmmunitionEntry(entry.id, { description: event.target.value })}
                  />
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="text-xs text-[#b9ae8d]">
                      Actual
                      <input className="field mt-1" inputMode="numeric" value={entry.current} onChange={(event) => void updateAmmunitionEntry(entry.id, { current: Number(event.target.value) })} />
                    </label>
                    <label className="text-xs text-[#b9ae8d]">
                      Máximo
                      <input className="field mt-1" inputMode="numeric" value={entry.max} onChange={(event) => void updateAmmunitionEntry(entry.id, { max: Number(event.target.value) })} />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#f3dfac]">{entry.name}</p>
                      {entry.description ? <p className="mobile-detail mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-[#b9ae8d]">{entry.description}</p> : null}
                    </div>
                    <button className="btn-secondary shrink-0 px-1.5 py-1 text-[11px] md:px-2 md:text-xs" type="button" onClick={() => setEditingAmmunition((current) => ({ ...current, [entry.id]: true }))}>Editar</button>
                  </div>
                  <div className="mt-2 flex min-w-0 items-center justify-center gap-1.5">
                    <button className="btn-secondary shrink-0 px-2 py-1" type="button" onClick={() => void updateAmmunitionEntry(entry.id, { current: entry.current - 1 })}>-</button>
                    <div className="min-w-0 flex-1 rounded-lg border border-[#d3a84a44] bg-black/25 px-1.5 py-1 text-center">
                      <p className="truncate text-lg font-semibold text-[#f3dfac] md:text-xl">{entry.current}</p>
                      <p className="truncate text-[10px] text-[#b9ae8d] md:text-[11px]">de {entry.max || "-"}</p>
                    </div>
                    <button className="btn-secondary shrink-0 px-2 py-1" type="button" onClick={() => void updateAmmunitionEntry(entry.id, { current: entry.current + 1 })}>+</button>
                  </div>
                </>
              )}
            </div>
            );
          })}
          {!ammunition.entries.length ? <p className="text-sm text-[#d9c89e]">Aún no hay bloques de munición. Añade uno para empezar.</p> : null}
        </div>
      </div>
    );
  }

  function findTraitDescriptionInRawPayload(traitName: string): string {
    const raw = (rawPayload.raw as Record<string, unknown> | undefined) ?? {};
    const key = normalizeTraitKey(traitName);

    const custom = Array.isArray(raw.custom_feats)
      ? raw.custom_feats as Array<{ name?: string; description?: string }>
      : [];
    const customMatch = custom.find((entry) => normalizeTraitKey(entry.name ?? "") === key)?.description?.trim();
    if (customMatch) return customMatch;

    const race = Array.isArray(raw.race_feats)
      ? raw.race_feats as Array<{ name?: string; description?: string } | string>
      : [];
    for (const entry of race) {
      if (typeof entry === "string") continue;
      if (normalizeTraitKey(entry.name ?? "") === key && entry.description?.trim()) return entry.description.trim();
    }

    const professions = Array.isArray(raw.professions)
      ? raw.professions as Array<{ feats?: Array<{ name?: string; description?: string }> }>
      : [];
    for (const profession of professions) {
      const match = (profession.feats ?? []).find((entry) => normalizeTraitKey(entry.name ?? "") === key)?.description?.trim();
      if (match) return match;
    }

    return "";
  }

  function renderTraitList(entries: TraitEntry[], fallback: string, showCombatToggle = false) {
    if (!entries.length) {
      return <p className="mt-3 whitespace-pre-wrap text-sm text-[#d9c89e]">{fallback || "Sin rasgos importados todavía."}</p>;
    }

    return (
      <div className="mt-3 grid gap-2">
        {entries.map((trait) => {
          const key = normalizeTraitKey(trait.name);
          const inputId = `trait-${key.replace(/\s+/g, "-")}`;
          const detail = traitDetails[key];
          const isOpen = openTraits[key] ?? false;
          const isEditorOpen = openTraitEditors[key] ?? false;
          const inCombat = combatFavorites.includes(key);
          const rawDescription = findTraitDescriptionInRawPayload(trait.name);
          const detailText = detail?.source === "none" ? "" : (detail?.text ?? "");
          const fullDescription = (
            detailText ||
            manualTraitDescriptions[key] ||
            trait.pdf_description ||
            rawDescription ||
            "Sin descripción todavía."
          ).trim();
          const shortDescription = shortText(fullDescription, 110);
          return (
            <div key={trait.name} className="rounded-lg border border-[#d3a84a44] bg-black/25">
              <div className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    className="min-w-0 flex-1 text-left"
                    type="button"
                    onClick={() => void toggleTrait(trait)}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#f3dfac]">
                      <span>{trait.name}</span>
                      <span className="rounded-full border border-[#d3a84a55] px-2 py-0.5 text-[11px] font-normal text-[#b9ae8d]">
                        {trait.kind || "Rasgo"}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {showCombatToggle ? (
                      <button
                        className={inCombat ? "btn-primary px-2 py-1 text-xs" : "btn-secondary px-2 py-1 text-xs"}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleCombatTrait(trait);
                        }}
                      >
                        {inCombat ? "En combate" : "Mostrar en combate"}
                      </button>
                    ) : null}
                  </div>
                </div>
                <button className="mobile-detail mt-2 block w-full text-left text-xs text-[#b9ae8d]" type="button" onClick={() => void toggleTrait(trait)}>
                  {shortDescription}
                </button>
              </div>
              {isOpen ? (
                <div className="border-t border-[#d3a84a33] p-3 text-sm text-[#d9c89e]">
                  {detail?.status === "loading" ? (
                    <p>Buscando información...</p>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{fullDescription || "Sin descripción disponible en español."}</p>
                      <p className="mt-2 text-xs text-[#9f9578]">
                        Fuente: {detail?.source === "manual" ? "Manual" : detail?.source === "api" ? "API" : detail?.source === "pdf" ? "PDF" : "sin fuente"}
                      </p>
                      <button
                        className="btn-secondary mt-3"
                        type="button"
                        onClick={() => setOpenTraitEditors((current) => ({ ...current, [key]: !isEditorOpen }))}
                      >
                        {isEditorOpen ? "Ocultar edición" : "Editar descripción"}
                      </button>
                      {isEditorOpen ? (
                        <div className="mt-3 rounded-lg border border-[#d3a84a33] bg-black/20 p-3">
                          <label className="block text-xs uppercase tracking-wide text-[#b9ae8d]" htmlFor={inputId}>Descripción manual</label>
                          <textarea
                            id={inputId}
                            className="field mt-2 min-h-28 w-full"
                            value={traitDrafts[key] ?? ""}
                            onChange={(event) => setTraitDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            placeholder="Añade o corrige la descripción de este rasgo"
                          />
                          <button className="btn-secondary mt-2" type="button" onClick={() => void saveManualTrait(trait)}>
                            Guardar descripción
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Ficha de personaje</p>
            <h1 className="mt-1 text-3xl font-semibold text-[#f3dfac]">{form.name || "Personaje"}</h1>
            <p className="mt-1 text-sm text-[#d9c89e]">{subtitle}</p>
            <p className="text-sm text-[#b9ae8d]">{form.race || "Especie -"} - {form.background || "Trasfondo -"}</p>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" type="button" onClick={() => void onSave()}>Guardar</button>
            <button className="rounded-md border border-red-400 px-3 py-2 text-sm text-red-300" type="button" onClick={() => void onDelete()}>Borrar</button>
          </div>
        </div>

        {message ? <p className="mt-3 text-sm text-[#b9ae8d]">{message}</p> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className={activeTab === "informacion" ? "btn-primary" : "btn-secondary"}
            type="button"
            onClick={() => setActiveTab("informacion")}
          >
            Información
          </button>
          <button
            className={activeTab === "combate" ? "btn-primary" : "btn-secondary"}
            type="button"
            onClick={() => setActiveTab("combate")}
          >
            Combate
          </button>
          <button
            className={activeTab === "rasgos" ? "btn-primary" : "btn-secondary"}
            type="button"
            onClick={() => setActiveTab("rasgos")}
          >
            Rasgos
          </button>
          <button
            className={activeTab === "conjuros" ? "btn-primary" : "btn-secondary"}
            type="button"
            onClick={() => setActiveTab("conjuros")}
          >
            Conjuros
          </button>
        </div>

        {activeTab === "informacion" ? (
          <div className="mt-4 grid gap-4">
            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Info útil</p>
              <div className="mt-3">
                <p className="mb-3 text-xs uppercase tracking-wide text-[#b9ae8d]">Caracteristicas</p>
                <div className="grid gap-3 lg:grid-cols-[1fr_12rem]">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {abilityOrder.map((ability) => {
                      const row = abilities[ability.key] ?? {};
                      const score = row.score ?? "-";
                      const modifier = typeof row.modifier === "number" ? (row.modifier >= 0 ? `+${row.modifier}` : `${row.modifier}`) : "-";
                      return (
                        <div key={ability.key} className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3 text-center">
                          <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">{ability.label}</p>
                          <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{modifier}</p>
                          <p className="text-sm text-[#d9c89e]">{score}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex min-h-full flex-col justify-center rounded-xl border border-[#d3a84a66] bg-black/30 p-3 text-center">
                    <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">PP</p>
                    <p className="mt-1 text-3xl font-semibold text-[#f3dfac]">{passivePerception ?? "-"}</p>
                    <p className="text-sm text-[#d9c89e]">Percepción pasiva</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Tiradas de salvación</p>
                  {renderCheckCards(savingThrows, sections.saving_throws, "grid-cols-2 md:grid-cols-3 xl:grid-cols-6")}
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Habilidades</p>
                  {renderCheckCards(skills, sections.skills, "grid-cols-2 lg:grid-cols-3")}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Historia</p>
              <div className="mt-3 grid gap-3">
                {storySections.length ? storySections.map((section) => {
                  const storyKey = normalizeTraitKey(section.title);
                  const isOpen = openStorySections[storyKey] ?? false;
                  return (
                    <div key={section.title} className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                      <button
                        className="flex w-full items-center justify-between gap-3 text-left"
                        type="button"
                        onClick={() => setOpenStorySections((current) => ({ ...current, [storyKey]: !isOpen }))}
                      >
                        <span className="text-xs uppercase tracking-wide text-[#b9ae8d]">{section.title}</span>
                        <span className="text-xs text-[#b9ae8d]">{isOpen ? "-" : "+"}</span>
                      </button>
                      {isOpen ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{section.text}</p> : null}
                    </div>
                  );
                }) : (
                  <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                    <button
                      className="flex w-full items-center justify-between gap-3 text-left"
                      type="button"
                      onClick={() => setOpenStorySections((current) => ({ ...current, notas: !current.notas }))}
                    >
                      <span className="text-xs uppercase tracking-wide text-[#b9ae8d]">Notas</span>
                      <span className="text-xs text-[#b9ae8d]">{openStorySections.notas ? "-" : "+"}</span>
                    </button>
                    {openStorySections.notas ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{form.notes || "Sin historia importada"}</p> : null}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : activeTab === "combate" ? (
          <div className="mt-4 grid gap-4">
            {renderRestBlock()}
            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Combate</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-[#b9ae8d]">Referencia rápida</p>
              <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">CA</p>
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{calculatedAc.total || form.ac || "-"}</p>
                  <p className="mobile-detail text-[11px] text-[#b9ae8d]">{calculatedAc.detail}</p>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">HP max</p>
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{form.hp || "-"}</p>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">Velocidad</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-2xl font-semibold text-[#f3dfac]">{form.speed || "-"}</p>
                      <p className="text-[11px] text-[#b9ae8d]">Pies</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-[#f3dfac]">{speedSquares ?? "-"}</p>
                      <p className="text-[11px] text-[#b9ae8d]">Casillas</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">Competencia</p>
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{String(summary.proficiency_bonus ?? "-")}</p>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">CD conjuros</p>
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{String(spellMeta.save_dc ?? "-")}</p>
                  <p className="text-sm text-[#d9c89e]">{spellMeta.ability || "-"}</p>
                </div>
              </div>

              <p className="mt-4 text-xs uppercase tracking-wide text-[#b9ae8d]">Durante la partida</p>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">HP actual</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button className="btn-secondary px-2 py-1" type="button" onClick={() => updateCounter("current_hp", -1, hpMax || undefined)}>-</button>
                    <input
                      className="field h-9 min-w-0 text-center"
                      inputMode="numeric"
                      value={form.current_hp}
                      onChange={(e) => setCounter("current_hp", e.target.value, hpMax || undefined)}
                    />
                    <button className="btn-secondary px-2 py-1" type="button" onClick={() => updateCounter("current_hp", 1, hpMax || undefined)}>+</button>
                  </div>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">Vida temporal</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button className="btn-secondary px-2 py-1" type="button" onClick={() => updateCounter("temp_hp", -1)}>-</button>
                    <input
                      className="field h-9 min-w-0 text-center"
                      inputMode="numeric"
                      value={form.temp_hp}
                      onChange={(e) => setCounter("temp_hp", e.target.value)}
                    />
                    <button className="btn-secondary px-2 py-1" type="button" onClick={() => updateCounter("temp_hp", 1)}>+</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4">
              {renderAmmunitionBlock()}
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Ataques</p>
                {renderAttackCards(attacks, sections.attacks)}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Inventario</p>
                {renderInventoryBlock()}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Rasgos utiles para combate</p>
                {!combatTraits.length ? <p className="mobile-detail mt-2 text-sm text-[#d9c89e]">Marca rasgos como &quot;Mostrar en combate&quot; desde la pestaña Rasgos.</p> : renderTraitList(combatTraits, sections.traits)}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Conjuros y trucos preparados</p>
                <p className="mt-2 text-xs text-[#9f9578]">Preparados: {preparedCount}{preparedLimit ? ` / ${preparedLimit}` : ""}</p>
                <div className="mt-4 rounded-xl border border-[#d3a84a44] bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Espacios gastados en combate</p>
                  {renderCombatSpellSlotTracker()}
                </div>
                {!preparedCombatSpells.length ? (
                  <p className="mobile-detail mt-2 text-sm text-[#d9c89e]">No hay conjuros preparados. Marca desde la pestaña Conjuros.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {preparedCombatSpells.map((spell) => {
                      const isOpen = openSpells[spell.id] ?? false;
                      return (
                        <button
                          key={spell.id}
                          className="rounded-lg border border-[#d3a84a44] bg-black/25 p-3 text-left hover:border-[#d3a84a88]"
                          type="button"
                          onClick={() => setOpenSpells((current) => ({ ...current, [spell.id]: !isOpen }))}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <p className="text-sm font-semibold text-[#f3dfac]">{spell.name}</p>
                            <p className="text-right text-xs text-[#b9ae8d]">{spellCastSummary(spell)} · Nv {spell.level} {isOpen ? "-" : "+"}</p>
                          </div>
                          <p className={isOpen ? "mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]" : "mobile-detail mt-2 text-sm text-[#d9c89e]"}>
                            {isOpen ? spellDescription(spell) : shortSpellDescription(spell)}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </div>
        ) : activeTab === "rasgos" ? (
          <div className="mt-4 rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Rasgos y dotes</p>
            {renderTraitList(traits, sections.traits, true)}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Conjuros</p>
              <p className="mt-2 text-base text-[#d9c89e] md:text-lg">Caract.: {spellMeta.ability || "-"} · CD: {String(spellMeta.save_dc ?? "-")} · Ataque: {String(spellMeta.attack_bonus ?? "-")}</p>
              <p className="mt-1 text-base text-[#b9ae8d] md:text-lg">Preparados: {preparedCount}{preparedLimit ? ` / ${preparedLimit}` : ""}</p>
              <div className="mt-4 rounded-xl border border-[#d3a84a44] bg-black/25 p-3">
                <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Espacios de conjuro</p>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {numericSpellSlots.length ? numericSpellSlots.map((slot) => (
                    <div key={`slot-${slot.level}`} className="flex min-w-28 items-center justify-between gap-3 rounded-lg border border-[#d3a84a44] bg-black/25 px-3 py-2">
                      <p className="text-sm font-semibold text-[#f3dfac]">Nivel {slot.level}</p>
                      <p className="text-xl font-semibold text-[#f3dfac]">{slot.count}</p>
                    </div>
                  )) : <p className="text-sm text-[#d9c89e]">Sin espacios detectados.</p>}
                </div>
                {otherSpellSlotInfo.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-[#b9ae8d]">
                    {otherSpellSlotInfo.map(([key, count]) => (
                      <span key={`slot-meta-${key}`} className="rounded border border-[#d3a84a44] px-2 py-1">{slotMetaLabel(key)}: {count}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {spells.map((spell) => {
                const isAutoPrepared = isAlwaysPreparedSpell(spell);
                const isPrepared = isSpellReady(spell, preparedSpellSet);
                const isFixed = Boolean(spell.label?.length);
                const isOpen = openSpells[spell.id] ?? false;
                return (
                  <div key={spell.id} className="rounded-lg border border-[#d3a84a44] bg-black/25 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-left"
                        type="button"
                        onClick={() => setOpenSpells((current) => ({ ...current, [spell.id]: !isOpen }))}
                      >
                        <p className="text-sm font-semibold text-[#f3dfac]">{spell.name}</p>
                        <p className="text-right text-xs text-[#b9ae8d]">{spellCastSummary(spell)} · {isOpen ? "Cerrar" : "Ver más"} · Nv {spell.level}</p>
                      </button>
                      <button className={isPrepared ? "btn-primary" : "btn-secondary"} type="button" onClick={() => void togglePreparedSpell(spell)}>
                        {isAutoPrepared ? alwaysPreparedSource(spell) : isPrepared ? "Preparado" : "Preparar"}
                      </button>
                    </div>
                    {isFixed ? <p className="mt-1 text-xs text-[#9f9578]">{isAutoPrepared ? alwaysPreparedSource(spell) : "Conjuro fijo"} ({spell.label?.join(", ")})</p> : null}
                    <button
                      className="mt-1 w-full text-left"
                      type="button"
                      onClick={() => setOpenSpells((current) => ({ ...current, [spell.id]: !isOpen }))}
                    >
                      <p className={isOpen ? "mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]" : "mobile-detail mt-2 text-sm text-[#d9c89e]"}>
                        {isOpen ? spellDescription(spell) : shortSpellDescription(spell)}
                      </p>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
