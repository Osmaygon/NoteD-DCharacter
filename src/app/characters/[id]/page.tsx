"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser } from "@/lib/custom-auth";
import { CharacterDetail, getCharacterDetail, updateCharacterDetail } from "@/lib/home-entities";

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
  const [rawPayload, setRawPayload] = useState("{}");
  const [allSections, setAllSections] = useState<Record<string, string>>({});
  const [spellsDetected, setSpellsDetected] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"resumen" | "rasgos" | "conjuros" | "historia" | "json">("resumen");
  const [message, setMessage] = useState("");
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

  useEffect(() => {
    void (async () => {
      const user = await getCurrentAppUser();
      if (!user) {
        window.location.href = "/";
        return;
      }
      setUserId(user.user_id);
      const detail = await getCharacterDetail(user.user_id, params.id);
      if (!detail) {
        setMessage("Personaje no encontrado o sin acceso.");
        return;
      }
      hydrate(detail);
      const payload = (detail.source_payload ?? {}) as {
        sections?: Record<string, string>;
        spells_detected?: string[];
      };
      setRawPayload(JSON.stringify(detail.source_payload ?? {}, null, 2));
      setAllSections(payload.sections ?? {});
      setSpellsDetected(payload.spells_detected ?? []);
    })();
  }, [params.id]);

  async function loadData(uid: string, characterId: string) {
    const detail = await getCharacterDetail(uid, characterId);
    if (!detail) {
      setMessage("Personaje no encontrado o sin acceso.");
      return;
    }
    hydrate(detail);
    setRawPayload(JSON.stringify(detail.source_payload ?? {}, null, 2));
  }

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

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 p-4">
        <h1 className="mb-3 text-2xl">Ficha de personaje</h1>
        <div className="grid gap-2 md:grid-cols-2">
          <input className="field" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="field" placeholder="Clase" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} />
          <input className="field" placeholder="Nivel" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
          <input className="field" placeholder="Especie" value={form.race} onChange={(e) => setForm({ ...form, race: e.target.value })} />
          <input className="field" placeholder="Trasfondo" value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} />
          <input className="field" placeholder="HP" value={form.hp} onChange={(e) => setForm({ ...form, hp: e.target.value })} />
          <input className="field" placeholder="CA" value={form.ac} onChange={(e) => setForm({ ...form, ac: e.target.value })} />
          <input className="field" placeholder="Velocidad" value={form.speed} onChange={(e) => setForm({ ...form, speed: e.target.value })} />
        </div>
        <textarea className="field mt-2 min-h-24" placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="btn-primary mt-3" type="button" onClick={() => void onSave()}>
          Guardar cambios
        </button>
        {message ? <p className="mt-2 text-sm text-[#b9ae8d]">{message}</p> : null}
      </section>

      <section className="panel p-4">
        <h2 className="mb-3 text-xl">Informacion extraida del PDF</h2>

        <div className="mb-3 flex flex-wrap gap-2">
          <button className={activeTab === "resumen" ? "btn-primary" : "btn-secondary"} type="button" onClick={() => setActiveTab("resumen")}>Resumen</button>
          <button className={activeTab === "rasgos" ? "btn-primary" : "btn-secondary"} type="button" onClick={() => setActiveTab("rasgos")}>Rasgos</button>
          <button className={activeTab === "conjuros" ? "btn-primary" : "btn-secondary"} type="button" onClick={() => setActiveTab("conjuros")}>Conjuros</button>
          <button className={activeTab === "historia" ? "btn-primary" : "btn-secondary"} type="button" onClick={() => setActiveTab("historia")}>Historia</button>
          <button className={activeTab === "json" ? "btn-primary" : "btn-secondary"} type="button" onClick={() => setActiveTab("json")}>JSON</button>
        </div>

        {activeTab === "resumen" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {[
              ["competencies", allSections.competencies],
              ["attacks", allSections.attacks],
              ["appearance", allSections.appearance],
              ["additional notes", allSections.additional_notes],
            ].map(([key, value]) => (
              <div key={key} className="rounded border border-[#d3a84a44] bg-black/20 p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">{key}</p>
                <p className="text-sm whitespace-pre-wrap">{value || "-"}</p>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "rasgos" ? (
          <div className="grid gap-2 md:grid-cols-2">
            {[
              ["traits", allSections.traits],
              ["personality", allSections.personality],
              ["ideals", allSections.ideals],
              ["bonds", allSections.bonds],
              ["defects", allSections.defects],
            ].map(([key, value]) => (
              <div key={key} className="rounded border border-[#d3a84a44] bg-black/20 p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">{key}</p>
                <p className="text-sm whitespace-pre-wrap">{value || "-"}</p>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "conjuros" ? (
          <div className="space-y-3">
            <div className="rounded border border-[#d3a84a44] bg-black/20 p-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Conjuros detectados</p>
              <p className="text-sm whitespace-pre-wrap">{spellsDetected.length ? spellsDetected.join(", ") : "-"}</p>
            </div>
            <div className="rounded border border-[#d3a84a44] bg-black/20 p-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Bloque completo de conjuros</p>
              <p className="text-sm whitespace-pre-wrap">{allSections.spell_chunk || "-"}</p>
            </div>
          </div>
        ) : null}

        {activeTab === "historia" ? (
          <div className="rounded border border-[#d3a84a44] bg-black/20 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-[#b9ae8d]">Historia del personaje</p>
            <p className="text-sm whitespace-pre-wrap">{allSections.story || "-"}</p>
          </div>
        ) : null}

        {activeTab === "json" ? (
          <pre className="overflow-auto rounded border border-[#d3a84a44] bg-black/30 p-3 text-xs text-[#d9c89e]">{rawPayload}</pre>
        ) : null}
      </section>
    </main>
  );
}
