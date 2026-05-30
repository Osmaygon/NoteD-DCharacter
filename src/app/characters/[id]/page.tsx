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

export default function CharacterDetailPage() {
  const params = useParams<{ id: string }>();
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [rawPayload, setRawPayload] = useState<Record<string, unknown>>({});
  const [selectedPage, setSelectedPage] = useState(0);
  const [showJson, setShowJson] = useState(false);
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

  const pdfPages = useMemo(() => {
    const pages = rawPayload.pages;
    if (Array.isArray(pages) && pages.every((p) => typeof p === "string")) {
      return pages as string[];
    }
    const rawText = typeof rawPayload.raw_text === "string" ? rawPayload.raw_text : "";
    return rawText ? rawText.split(/\n\s*\n+/).filter(Boolean) : [];
  }, [rawPayload]);

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

    hydrate(detail);

    const payload = (detail.source_payload ?? {}) as {
      raw_text?: string;
      [key: string]: unknown;
    };

    const hasStructuredData =
      Object.prototype.hasOwnProperty.call(payload, "summary") ||
      Object.prototype.hasOwnProperty.call(payload, "sections") ||
      Object.prototype.hasOwnProperty.call(payload, "spells_detected") ||
      Object.prototype.hasOwnProperty.call(payload, "pages");

    const rebuilt = !hasStructuredData && payload.raw_text
      ? parseImportedCharacter(payload.raw_text).source_payload
      : payload;

    setRawPayload(rebuilt);
    setSelectedPage(0);
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 p-5">
        <h1 className="mb-4 text-2xl">Ficha de personaje</h1>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3 md:col-span-2">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Nombre</p>
            <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Nivel</p>
            <input className="field" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
          </div>

          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Clase</p>
            <input className="field" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
          </div>
          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Especie</p>
            <input className="field" value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} />
          </div>
          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Trasfondo</p>
            <input className="field" value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} />
          </div>

          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">HP</p>
            <input className="field" value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })} />
          </div>
          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">CA</p>
            <input className="field" value={form.ac} onChange={(e) => setForm({ ...form, ac: e.target.value })} />
          </div>
          <div className="rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Velocidad</p>
            <input className="field" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} />
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-[#d3a84a55] bg-black/25 p-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Notas</p>
          <textarea className="field min-h-28" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" type="button" onClick={() => void onSave()}>Guardar cambios</button>
          <button className="rounded-md border border-red-400 px-4 py-2 text-red-300" type="button" onClick={() => void onDelete()}>Borrar personaje</button>
        </div>
        {message ? <p className="mt-2 text-sm text-[#b9ae8d]">{message}</p> : null}
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-xl">PDF importado</h2>
        {pdfPages.length ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {pdfPages.map((_p, idx) => (
                <button
                  key={`tab-${idx + 1}`}
                  className={selectedPage === idx ? "btn-primary" : "btn-secondary"}
                  type="button"
                  onClick={() => setSelectedPage(idx)}
                >
                  Página {idx + 1}
                </button>
              ))}
            </div>
            <div className="rounded border border-[#d3a84a44] bg-black/20 p-3">
              <p className="text-sm whitespace-pre-wrap">{pdfPages[selectedPage] ?? ""}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#b9ae8d]">No hay contenido de PDF guardado para este personaje.</p>
        )}

        <button className="btn-secondary mt-3" type="button" onClick={() => setShowJson((v) => !v)}>
          {showJson ? "Ocultar JSON" : "Ver JSON técnico"}
        </button>
        {showJson ? (
          <pre className="mt-3 overflow-auto rounded border border-[#d3a84a44] bg-black/30 p-3 text-xs text-[#d9c89e]">
            {JSON.stringify(rawPayload, null, 2)}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
