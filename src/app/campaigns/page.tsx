"use client";

import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser, getStoredSessionToken } from "@/lib/custom-auth";
import {
  CampaignJournalEntry,
  CampaignMember,
  HomeEntity,
  JournalBlock,
  createCampaign,
  deleteCampaignJournalEntry,
  joinCampaign,
  listCampaignJournalEntries,
  listCampaignMembers,
  listCampaigns,
  setCampaignMemberRole,
  updateCampaignStory,
  upsertCampaignJournalEntry,
} from "@/lib/home-entities";

type EntryDraft = {
  id?: string | null;
  title: string;
  session_date: string;
  blocks: JournalBlock[];
  source_payload?: Record<string, unknown>;
};

function blockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createEmptyEntryDraft(): EntryDraft {
  return {
    id: null,
    title: "",
    session_date: new Date().toISOString().slice(0, 10),
    blocks: [{ id: blockId(), title: "Resumen", content: "" }],
    source_payload: {},
  };
}

function roleLabel(role?: string): string {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Admin";
  if (role === "editor") return "Editor";
  return "Lector";
}

function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function normalizeBlocks(value: unknown): JournalBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    return [{
      id: typeof record.id === "string" ? record.id : `block-${index}`,
      title: typeof record.title === "string" && record.title.trim() ? record.title : `Bloque ${index + 1}`,
      content: typeof record.content === "string" ? record.content : "",
    }];
  });
}

export default function CampaignsPage() {
  const [userId, setUserId] = useState("");
  const [campaigns, setCampaigns] = useState<HomeEntity[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [entries, setEntries] = useState<CampaignJournalEntry[]>([]);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [storyDraft, setStoryDraft] = useState("");
  const [editingStory, setEditingStory] = useState(false);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [importingNivel20, setImportingNivel20] = useState(false);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0] ?? null,
    [campaigns, selectedCampaignId],
  );
  const canEdit = Boolean(selectedCampaign?.can_edit);
  const canManageRoles = selectedCampaign?.role === "owner" || selectedCampaign?.role === "admin";

  async function refresh(uid: string, nextCampaignId = selectedCampaignId) {
    const rows = await listCampaigns(uid);
    setCampaigns(rows);
    const targetId = nextCampaignId || rows[0]?.id || "";
    setSelectedCampaignId(targetId);
    const target = rows.find((row) => row.id === targetId) ?? rows[0];
    setStoryDraft(target?.description ?? "");
    if (target?.id) {
      const [journalRows, memberRows] = await Promise.all([
        listCampaignJournalEntries(uid, target.id),
        listCampaignMembers(uid, target.id),
      ]);
      setEntries(journalRows.map((entry) => ({ ...entry, blocks: normalizeBlocks(entry.blocks) })));
      setMembers(memberRows);
    } else {
      setEntries([]);
      setMembers([]);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        const user = await getCurrentAppUser();
        if (!user) {
          window.location.href = "/";
          return;
        }
        setUserId(user.user_id);
        await refresh(user.user_id, "");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudieron cargar campañas");
      }
    })();
    // Se ejecuta solo al montar: refresh se reutiliza para acciones manuales y no debe relanzar la carga inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function selectCampaign(campaignId: string) {
    if (!userId) return;
    setSelectedCampaignId(campaignId);
    await refresh(userId, campaignId);
    setEntryDraft(null);
    setEditingStory(false);
  }

  async function onCreate() {
    if (!userId || !newName.trim()) return;
    try {
      setMessage("");
      await createCampaign(userId, newName.trim());
      setNewName("");
      await refresh(userId, "");
      setMessage("Campaña creada. Tú eres propietario/admin del diario.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear la campaña");
    }
  }

  async function onJoin() {
    if (!userId || !joinCode.trim()) return;
    try {
      setMessage("");
      await joinCampaign(userId, joinCode.trim());
      setJoinCode("");
      await refresh(userId, "");
      setMessage("Te has unido como lector. Un admin puede darte permiso de edición.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No te pudiste unir");
    }
  }

  async function saveStory() {
    if (!userId || !selectedCampaign) return;
    try {
      setLoading(true);
      await updateCampaignStory(userId, selectedCampaign.id, storyDraft, selectedCampaign.source_payload ?? {});
      await refresh(userId, selectedCampaign.id);
      setEditingStory(false);
      setMessage("Historia de campaña guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la historia");
    } finally {
      setLoading(false);
    }
  }

  function startNewEntry() {
    setEntryDraft(createEmptyEntryDraft());
  }

  function startEditEntry(entry: CampaignJournalEntry) {
    setEntryDraft({
      id: entry.id,
      title: entry.title,
      session_date: entry.session_date ?? new Date().toISOString().slice(0, 10),
      blocks: normalizeBlocks(entry.blocks).map((block) => ({ ...block, id: block.id ?? blockId() })),
      source_payload: entry.source_payload ?? {},
    });
  }

  async function saveEntry() {
    if (!userId || !selectedCampaign || !entryDraft) return;
    try {
      setLoading(true);
      const blocks = entryDraft.blocks
        .map((block) => ({ ...block, title: block.title.trim(), content: block.content.trim() }))
        .filter((block) => block.title || block.content);
      await upsertCampaignJournalEntry(userId, selectedCampaign.id, {
        id: entryDraft.id,
        title: entryDraft.title.trim(),
        session_date: entryDraft.session_date || null,
        blocks,
        source_payload: entryDraft.source_payload ?? {},
      });
      await refresh(userId, selectedCampaign.id);
      setEntryDraft(null);
      setMessage("Bitácora guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la bitácora");
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(entryId: string) {
    if (!userId || !selectedCampaign) return;
    const ok = window.confirm("¿Eliminar esta bitácora?");
    if (!ok) return;
    try {
      await deleteCampaignJournalEntry(userId, selectedCampaign.id, entryId);
      await refresh(userId, selectedCampaign.id);
      setMessage("Bitácora eliminada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar");
    }
  }

  async function changeRole(member: CampaignMember, role: CampaignMember["role"]) {
    if (!userId || !selectedCampaign) return;
    try {
      await setCampaignMemberRole(userId, selectedCampaign.id, member.user_id, role);
      await refresh(userId, selectedCampaign.id);
      setMessage("Permisos actualizados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron actualizar permisos");
    }
  }

  async function importNivel20Journal() {
    if (!userId) return;
    try {
      setImportingNivel20(true);
      setMessage("Importando diario de Nivel20...");
      const response = await fetch("/api/nivel20/import-campaign-journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appSessionToken: getStoredSessionToken(),
          campaignId: selectedCampaign?.id,
          campaignPath: "/games/dnd-5/campaigns/110040-reino-de-chatelenz",
        }),
      });
      const body = (await response.json()) as { error?: string; campaignId?: string; campaignName?: string; entries?: number; created?: number; updated?: number };
      if (!response.ok) throw new Error(body.error || "No se pudo importar Nivel20");
      await refresh(userId, body.campaignId || selectedCampaign?.id || "");
      setMessage(`Importado ${body.campaignName ?? "Reino de Chatelenz"}: ${body.entries ?? 0} entradas (${body.created ?? 0} nuevas, ${body.updated ?? 0} actualizadas).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo importar Nivel20");
    } finally {
      setImportingNivel20(false);
    }
  }

  function updateDraftBlock(index: number, patch: Partial<JournalBlock>) {
    setEntryDraft((current) => current ? {
      ...current,
      blocks: current.blocks.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block),
    } : current);
  }

  function addDraftBlock() {
    setEntryDraft((current) => current ? {
      ...current,
      blocks: [...current.blocks, { id: blockId(), title: "Nuevo bloque", content: "" }],
    } : current);
  }

  function removeDraftBlock(index: number) {
    setEntryDraft((current) => current ? {
      ...current,
      blocks: current.blocks.filter((_, blockIndex) => blockIndex !== index),
    } : current);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 overflow-hidden p-0">
        <div className="border-b border-[#d3a84a33] bg-[radial-gradient(circle_at_20%_0%,rgba(211,168,74,0.22),transparent_34%),linear-gradient(135deg,rgba(211,168,74,0.14),rgba(0,0,0,0.16))] p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-[#b9ae8d]">Campañas</p>
          <h1 className="mt-1 text-3xl text-[#f3dfac]">Diario de campaña</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#d9c89e]">Un libro compartido para leer la historia, consultar sesiones anteriores y escribir bitácoras por partida. Todos los miembros leen; solo admin/editor escribe.</p>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input className="field" placeholder="Nombre nueva campaña" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className="btn-primary" onClick={() => void onCreate()} type="button">Crear</button>
          </div>
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input className="field" placeholder="Código para unirte" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} />
            <button className="btn-secondary" onClick={() => void onJoin()} type="button">Unirme</button>
          </div>
        </div>
        {message ? <p className="border-t border-[#d3a84a22] px-4 py-3 text-sm text-[#f3dfac]">{message}</p> : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="panel h-fit p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl text-[#f3dfac]">Tus campañas</h2>
            <button className="btn-secondary px-3 py-2 text-xs" type="button" disabled={importingNivel20} onClick={() => void importNivel20Journal()}>
              {importingNivel20 ? "Importando..." : "Importar Chatelenz"}
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {campaigns.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => void selectCampaign(campaign.id)}
                className={`rounded-xl border p-3 text-left transition ${selectedCampaign?.id === campaign.id ? "border-[#ffd86faa] bg-[#ffd86f18]" : "border-[#d3a84a44] bg-black/20 hover:bg-white/5"}`}
              >
                <span className="block font-semibold text-[#f3dfac]">{campaign.name}</span>
                <span className="text-xs text-[#b9ae8d]">{roleLabel(campaign.role)} · Código {campaign.join_code}</span>
              </button>
            ))}
            {!campaigns.length ? <p className="text-sm text-[#b9ae8d]">No tienes campañas aún.</p> : null}
          </div>
        </aside>

        <section className="grid gap-4">
          {selectedCampaign ? (
            <>
              <div className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#b9ae8d]">Historia</p>
                    <h2 className="text-2xl text-[#f3dfac]">{selectedCampaign.name}</h2>
                    <p className="text-xs text-[#b9ae8d]">{roleLabel(selectedCampaign.role)} · {canEdit ? "Puedes editar" : "Solo lectura"}</p>
                  </div>
                  {canEdit ? (
                    <button className="btn-secondary px-3 py-2 text-xs" type="button" onClick={() => setEditingStory((current) => !current)}>
                      {editingStory ? "Cerrar historia" : "Editar historia"}
                    </button>
                  ) : null}
                </div>
                {editingStory ? (
                  <div className="mt-3">
                    <textarea className="field min-h-36" value={storyDraft} onChange={(event) => setStoryDraft(event.target.value)} placeholder="Historia general de la campaña" />
                    <button className="btn-primary mt-2" type="button" disabled={loading} onClick={() => void saveStory()}>Guardar historia</button>
                  </div>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#d9c89e]">{selectedCampaign.description || "Sin historia de campaña todavía."}</p>
                )}
              </div>

              {canManageRoles ? (
                <div className="panel p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-[#b9ae8d]">Permisos</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {members.map((member) => (
                      <div key={member.user_id} className="rounded-lg border border-[#d3a84a33] bg-black/20 p-3">
                        <p className="font-semibold text-[#f3dfac]">{member.nickname || member.email}</p>
                        <p className="text-xs text-[#b9ae8d]">{member.email}</p>
                        {member.role === "owner" ? <p className="mt-2 text-xs text-[#f3dfac]">Propietario</p> : (
                          <select className="field mt-2" value={member.role} onChange={(event) => void changeRole(member, event.target.value as CampaignMember["role"])}>
                            <option value="player">Lector</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-[#b9ae8d]">Bitácora</p>
                    <h2 className="text-2xl text-[#f3dfac]">Sesiones</h2>
                  </div>
                  {canEdit ? <button className="btn-primary" type="button" onClick={startNewEntry}>Nueva bitácora</button> : null}
                </div>

                {entryDraft ? (
                  <div className="mt-4 rounded-xl border border-[#ffd86f66] bg-[#110d06]/80 p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                      <input className="field" placeholder="Título de la sesión" value={entryDraft.title} onChange={(event) => setEntryDraft((current) => current ? { ...current, title: event.target.value } : current)} />
                      <input className="field" type="date" value={entryDraft.session_date} onChange={(event) => setEntryDraft((current) => current ? { ...current, session_date: event.target.value } : current)} />
                    </div>
                    <div className="mt-3 grid gap-3">
                      {entryDraft.blocks.map((block, index) => (
                        <div key={block.id ?? index} className="rounded-lg border border-[#d3a84a33] bg-black/20 p-3">
                          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                            <input className="field" placeholder="Título del bloque" value={block.title} onChange={(event) => updateDraftBlock(index, { title: event.target.value })} />
                            <button className="btn-secondary px-3 py-2 text-xs" type="button" onClick={() => removeDraftBlock(index)}>Quitar</button>
                          </div>
                          <textarea className="field mt-2 min-h-28" placeholder="Contenido del bloque" value={block.content} onChange={(event) => updateDraftBlock(index, { content: event.target.value })} />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="btn-secondary" type="button" onClick={addDraftBlock}>Añadir bloque</button>
                      <button className="btn-primary" type="button" disabled={loading} onClick={() => void saveEntry()}>Guardar bitácora</button>
                      <button className="btn-secondary" type="button" onClick={() => setEntryDraft(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3">
                  {entries.map((entry) => (
                    <article key={entry.id} className="rounded-xl border border-[#d3a84a44] bg-black/25 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.18em] text-[#b9ae8d]">{formatDate(entry.session_date)}</p>
                          <h3 className="mt-1 text-xl text-[#f3dfac]">{entry.title}</h3>
                        </div>
                        {canEdit ? (
                          <div className="flex gap-2">
                            <button className="btn-secondary px-3 py-2 text-xs" type="button" onClick={() => startEditEntry(entry)}>Editar</button>
                            <button className="rounded border border-red-400/60 px-3 py-2 text-xs text-red-300 hover:bg-red-900/30" type="button" onClick={() => void removeEntry(entry.id)}>Eliminar</button>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 grid gap-3">
                        {normalizeBlocks(entry.blocks).map((block, index) => (
                          <section key={block.id ?? `${entry.id}-${index}`} className="rounded-lg border border-[#d3a84a22] bg-[#ffffff04] p-3">
                            <h4 className="font-semibold text-[#f3dfac]">{block.title}</h4>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#d9c89e]">{block.content || "Sin contenido."}</p>
                          </section>
                        ))}
                      </div>
                    </article>
                  ))}
                  {!entries.length ? <p className="rounded-xl border border-[#d3a84a33] bg-black/20 p-4 text-sm text-[#b9ae8d]">No hay bitácoras todavía. Importa Nivel20 o crea la primera sesión.</p> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="panel p-6 text-center text-[#d9c89e]">Crea una campaña o importa Reino de Chatelenz para empezar el diario.</div>
          )}
        </section>
      </div>
    </main>
  );
}
