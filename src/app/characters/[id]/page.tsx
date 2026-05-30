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
} from "@/lib/home-entities";

type FormState = {
  name: string;
  class_name: string;
  level: string;
  race: string;
  background: string;
  hp: string;
  ac: string;
  speed: string;
  notes: string;
};

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
  const [form, setForm] = useState<FormState>({
    name: "",
    class_name: "",
    level: "",
    race: "",
    background: "",
    hp: "",
    ac: "",
    speed: "",
    notes: "",
  });

  const summary = (rawPayload.summary as Record<string, unknown> | undefined) ?? {};
  const abilities = (summary.abilities as Record<string, { score?: number; modifier?: number }> | undefined) ?? {};

  function hydrate(detail: CharacterDetail) {
    setForm({
      name: detail.name ?? "",
      class_name: detail.class_name ?? "",
      level: detail.level?.toString() ?? "",
      race: detail.race ?? "",
      background: detail.background ?? "",
      hp: detail.hp?.toString() ?? "",
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
      };
      [key: string]: unknown;
    };

    const normalizedPayload = payload.source_payload
      ? {
          ...payload,
          raw_text: payload.raw_text ?? payload.source_payload.raw_text,
          summary: payload.summary ?? payload.source_payload.summary,
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

        <div className="mt-5 grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Caracteristicas</p>
            <div className="grid grid-cols-2 gap-3">
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
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Combate</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
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
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{form.speed || "-"}</p>
                </div>
                <div className="rounded-xl border border-[#d3a84a66] bg-black/30 p-3">
                  <p className="text-xs text-[#b9ae8d]">Competencia</p>
                  <p className="mt-1 text-2xl font-semibold text-[#f3dfac]">{String(summary.proficiency_bonus ?? "-")}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Informacion</p>
              <div className="mt-3 space-y-2 text-sm text-[#d9c89e]">
                <p><span className="text-[#b9ae8d]">Clase:</span> {form.class_name || "-"}</p>
                <p><span className="text-[#b9ae8d]">Nivel:</span> {form.level || "-"}</p>
                <p><span className="text-[#b9ae8d]">Especie:</span> {form.race || "-"}</p>
                <p><span className="text-[#b9ae8d]">Trasfondo:</span> {form.background || "-"}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d3a84a66] bg-black/25 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Notas (temporal)</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#d9c89e]">{form.notes || "Sin notas"}</p>
              <p className="mt-2 text-xs text-[#9f9578]">Texto temporal: este bloque lo retocaremos luego.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
