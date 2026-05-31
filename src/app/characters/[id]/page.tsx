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

type TraitEntry = {
  name: string;
  pdf_description?: string;
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
  const [activeTab, setActiveTab] = useState<"informacion" | "combate">("informacion");
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
  const traits = Array.isArray(summary.traits) ? summary.traits as TraitEntry[] : [];
  const manualTraitDescriptions = (
    rawPayload.manual_trait_descriptions &&
    typeof rawPayload.manual_trait_descriptions === "object" &&
    !Array.isArray(rawPayload.manual_trait_descriptions)
  ) ? rawPayload.manual_trait_descriptions as Record<string, string> : {};
  const [openTraits, setOpenTraits] = useState<Record<string, boolean>>({});
  const [traitDetails, setTraitDetails] = useState<Record<string, TraitDetail>>({});
  const [traitDrafts, setTraitDrafts] = useState<Record<string, string>>({});

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
      source_payload?: {
        raw_text?: string;
        summary?: Record<string, unknown>;
        sections?: Record<string, string>;
      };
      [key: string]: unknown;
    };

    const normalizedPayload = payload.source_payload
      ? {
          ...payload,
          raw_text: payload.raw_text ?? payload.source_payload.raw_text,
          summary: payload.summary ?? payload.source_payload.summary,
          sections: payload.sections ?? payload.source_payload.sections,
        }
      : payload;

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

  function renderCheckCards(entries: CheckEntry[], fallback: string, gridClassName = "grid-cols-1 sm:grid-cols-2") {
    if (!entries.length) {
      return <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{fallback || "-"}</p>;
    }

    return (
      <div className={`mt-2 grid gap-2 ${gridClassName}`}>
        {entries.map((entry) => (
          <div key={entry.name} className="rounded-lg border border-[#d3a84a44] bg-black/25 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-[#d9c89e]">{entry.name}</p>
              <p className="text-lg font-semibold text-[#f3dfac]">{entry.bonus}</p>
            </div>
            <p className={entry.proficient ? "mt-1 text-xs text-[#f3dfac]" : "mt-1 text-xs text-[#8d846c]"}>
              {entry.proficient ? "Competente" : "Sin competencia"}
            </p>
          </div>
        ))}
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

    const pdfDescription = trait.pdf_description?.trim() ?? "";
    if (pdfDescription) {
      setTraitDetails((current) => ({
        ...current,
        [key]: {
          status: "ready",
          text: pdfDescription,
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
    setMessage(nextText ? "Descripción manual guardada." : "Descripción manual eliminada.");
  }

  function renderTraitList(entries: TraitEntry[], fallback: string) {
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
          return (
            <div key={trait.name} className="rounded-lg border border-[#d3a84a44] bg-black/25">
              <button
                className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm font-semibold text-[#f3dfac]"
                type="button"
                onClick={() => void toggleTrait(trait)}
              >
                <span>{trait.name}</span>
                <span className="text-[#b9ae8d]">{isOpen ? "-" : "+"}</span>
              </button>
              {isOpen ? (
                <div className="border-t border-[#d3a84a33] p-3 text-sm text-[#d9c89e]">
                  {detail?.status === "loading" ? (
                    <p>Buscando información...</p>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{detail?.text || trait.pdf_description || "Sin descripción disponible en español."}</p>
                      <p className="mt-2 text-xs text-[#9f9578]">
                        Fuente: {detail?.source === "manual" ? "Manual" : detail?.source === "api" ? "API" : detail?.source === "pdf" ? "PDF" : "sin fuente"}
                      </p>
                      <label className="mt-3 block text-xs uppercase tracking-wide text-[#b9ae8d]" htmlFor={inputId}>Descripción manual</label>
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
        </div>

        {activeTab === "informacion" ? (
          <div className="mt-4 grid gap-4">
            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Info útil</p>
              <div className="mt-3">
                <p className="mb-3 text-xs uppercase tracking-wide text-[#b9ae8d]">Caracteristicas</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
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
                  <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3 text-center">
                    <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">PP</p>
                    <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{String(summary.passive_perception ?? "-")}</p>
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
                  {renderCheckCards(skills, sections.skills, "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Historia</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
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
        ) : (
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

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Ataques</p>
                {renderAttackCards(attacks, sections.attacks)}
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Equipo</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-[#d9c89e]">{sections.equipment || "Sin equipo importado todavía."}</p>
              </div>
              <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4 lg:col-span-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Rasgos, conjuros y trucos</p>
                {renderTraitList(traits, sections.traits)}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
