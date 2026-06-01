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
  updateCharacterDetail,
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

  const summary = (rawPayload.summary as Record<string, unknown> | undefined) ?? {};
  const sections = (rawPayload.sections as Record<string, string> | undefined) ?? {};
  const abilities = (summary.abilities as Record<string, { score?: number; modifier?: number }> | undefined) ?? {};
  const savingThrows = Array.isArray(summary.saving_throws) ? summary.saving_throws as CheckEntry[] : [];
  const skills = Array.isArray(summary.skills) ? summary.skills as CheckEntry[] : [];
  const attacks = Array.isArray(summary.attacks) ? summary.attacks as AttackEntry[] : [];
  const equipment = Array.isArray(summary.equipment) ? summary.equipment as EquipmentEntry[] : [];
  const traits = Array.isArray(summary.traits) ? summary.traits as TraitEntry[] : [];
  const spells = Array.isArray(summary.spells) ? summary.spells as SpellEntry[] : [];
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
          summary: payload.summary ?? payload.source_payload.summary,
          sections: payload.sections ?? payload.source_payload.sections,
        }
      : {
          ...payload,
          spell_slots_spent: detail.spell_slots_spent ?? payload.spell_slots_spent,
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

  function renderEquipmentList(entries: EquipmentEntry[], fallback: string) {
    if (!entries.length) {
      return <p className="mt-3 whitespace-pre-wrap text-sm text-[#d9c89e]">{fallback || "Sin equipo importado todavía."}</p>;
    }

    return (
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {entries.map((item) => {
          const key = normalizeTraitKey(`${item.name}-${item.detail ?? ""}`);
          const isOpen = openEquipment[key] ?? false;
          const detailPreview = item.detail ? shortText(item.detail, 90) : "";
          const hasLongDetail = Boolean(item.detail && detailPreview !== item.detail);
          return (
            <div key={key} className="rounded-lg border border-[#d3a84a44] bg-black/25">
              <button
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
                type="button"
                onClick={() => setOpenEquipment((current) => ({ ...current, [key]: !isOpen }))}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#f3dfac]">{item.name}</span>
                  {detailPreview ? (
                    <span className="block text-xs text-[#b9ae8d]">
                      {detailPreview}{hasLongDetail && !isOpen ? " Pulsa para ver más." : ""}
                    </span>
                  ) : null}
                </span>

              </button>
              {isOpen ? (
                <div className="border-t border-[#d3a84a33] p-3 text-sm text-[#d9c89e]">
                  <p><span className="text-[#b9ae8d]">Tipo:</span> {item.kind || "Objeto"}</p>
                  <p><span className="text-[#b9ae8d]">Detalle:</span> {item.detail || "Sin detalle detectado"}</p>
                  <p className="mt-2 whitespace-pre-wrap"><span className="text-[#b9ae8d]">Uso rápido:</span> {item.quick_use || "Añade notas si necesitas recordar un uso concreto."}</p>
                </div>
              ) : null}
            </div>
          );
        })}
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
                <button className="mt-2 block w-full text-left text-xs text-[#b9ae8d]" type="button" onClick={() => void toggleTrait(trait)}>
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
                  {renderCheckCards(skills, sections.skills, "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Historia</p>
              <div className="mt-3 grid gap-3">
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Trasfondo narrativo</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{form.background || "-"}</p>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Notas</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{form.notes || "Sin notas"}</p>
                </div>
              </div>
            </section>
          </div>
        ) : activeTab === "combate" ? (
          <div className="mt-4 grid gap-4">
            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Combate</p>
              <p className="mt-3 text-xs uppercase tracking-wide text-[#b9ae8d]">Referencia rápida</p>
              <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">CA</p>
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{form.ac || "-"}</p>
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
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Ataques</p>
                {renderAttackCards(attacks, sections.attacks)}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Equipo</p>
                {renderEquipmentList(equipment, sections.equipment)}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Rasgos utiles para combate</p>
                {!combatTraits.length ? <p className="mt-2 text-sm text-[#d9c89e]">Marca rasgos como &quot;Mostrar en combate&quot; desde la pestaña Rasgos.</p> : renderTraitList(combatTraits, sections.traits)}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Conjuros y trucos preparados</p>
                <p className="mt-2 text-xs text-[#9f9578]">Preparados: {preparedCount}{preparedLimit ? ` / ${preparedLimit}` : ""}</p>
                <div className="mt-4 rounded-xl border border-[#d3a84a44] bg-black/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">Espacios gastados en combate</p>
                  {renderCombatSpellSlotTracker()}
                </div>
                {!preparedCombatSpells.length ? (
                  <p className="mt-2 text-sm text-[#d9c89e]">No hay conjuros preparados. Marca desde la pestaña Conjuros.</p>
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
                            <p className="text-right text-xs text-[#b9ae8d]">{spellCastSummary(spell)} · Nv {spell.level}</p>
                          </div>
                          <p className={isOpen ? "mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]" : "mt-2 text-sm text-[#d9c89e]"}>
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
                      <p className={isOpen ? "mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]" : "mt-2 text-sm text-[#d9c89e]"}>
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
