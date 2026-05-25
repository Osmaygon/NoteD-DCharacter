"use client";

import { useMemo, useState } from "react";
import { rollFormula } from "@/lib/dice";
import { supabase } from "@/lib/supabase";

type Campaign = { id: string; name: string };
type Character = {
  id: string;
  name: string;
  class_name: string;
  level: number;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  speed: number;
  passive_perception: number | null;
  passive_investigation: number | null;
  passive_insight: number | null;
  traits: string | null;
};

type Condition = { id: string; custom_name: string | null; condition_definitions: { name: string; effect_json: { speed_multiplier?: number } } | null };
type Roll = { id: string; formula: string; total: number; dice: number[]; created_at: string };

const CLASS_OPTIONS = [
  "barbarian",
  "bard",
  "cleric",
  "druid",
  "fighter",
  "monk",
  "paladin",
  "ranger",
  "rogue",
  "sorcerer",
  "warlock",
  "wizard",
];

export function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [spells, setSpells] = useState<{ id: string; name: string; level: number }[]>([]);
  const [logs, setLogs] = useState<{ id: string; title: string | null; body: string; event_date: string }[]>([]);
  const [status, setStatus] = useState<string>("Listo");
  const [newCampaignName, setNewCampaignName] = useState("");
  const [rollInput, setRollInput] = useState("1d20");
  const [logBody, setLogBody] = useState("");

  const currentCharacter = useMemo(
    () => characters.find((c) => c.id === selectedCharacter) ?? null,
    [characters, selectedCharacter],
  );

  const derivedSpeed = useMemo(() => {
    if (!currentCharacter) return 0;
    const active = conditions.filter((c) => c.condition_definitions?.effect_json?.speed_multiplier);
    const mult = active.reduce((acc, c) => acc * (c.condition_definitions?.effect_json?.speed_multiplier ?? 1), 1);
    return Math.max(0, Math.floor(currentCharacter.speed * mult));
  }, [conditions, currentCharacter]);

  async function bootstrap() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const uid = data.session.user.id;
    setUserId(uid);
    await supabase.from("profiles").upsert({ id: uid, display_name: data.session.user.user_metadata?.full_name ?? "Player" });
    await loadCampaigns();
  }

  async function signIn() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: "google" });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.reload();
  }

  async function loadCampaigns() {
    if (!supabase) return;
    const { data, error } = await supabase.from("campaigns").select("id,name").order("created_at", { ascending: false });
    if (error) {
      setStatus(error.message);
      return;
    }
    const rows = (data ?? []) as Campaign[];
    setCampaigns(rows);
    if (rows[0] && !campaignId) {
      setCampaignId(rows[0].id);
      await loadCampaignData(rows[0].id);
    }
  }

  async function createCampaign() {
    if (!supabase || !userId || !newCampaignName.trim()) return;
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ name: newCampaignName.trim(), created_by: userId })
      .select("id,name")
      .single();
    if (error || !data) {
      setStatus(error?.message ?? "No se pudo crear campaña");
      return;
    }
    await supabase.from("campaign_members").insert({ campaign_id: data.id, user_id: userId, role: "dm" });
    setNewCampaignName("");
    setCampaignId(data.id);
    await loadCampaigns();
    await loadCampaignData(data.id);
  }

  async function loadCampaignData(id: string) {
    if (!supabase) return;
    const [charRes, rollRes, logRes] = await Promise.all([
      supabase.from("characters").select("*").eq("campaign_id", id).order("created_at", { ascending: false }),
      supabase.from("dice_rolls").select("id,formula,total,dice,created_at").eq("campaign_id", id).order("created_at", { ascending: false }).limit(30),
      supabase.from("session_logs").select("id,title,body,event_date").eq("campaign_id", id).order("created_at", { ascending: false }).limit(20),
    ]);
    if (charRes.error) setStatus(charRes.error.message);
    setCharacters((charRes.data ?? []) as Character[]);
    setRolls((rollRes.data ?? []) as Roll[]);
    setLogs((logRes.data ?? []) as { id: string; title: string | null; body: string; event_date: string }[]);
    const first = charRes.data?.[0] as Character | undefined;
    if (first) {
      setSelectedCharacter(first.id);
      await loadCharacterExtras(first.id, first.class_name);
    }
  }

  async function loadCharacterExtras(characterId: string, className: string) {
    if (!supabase) return;
    const [condRes, spellRes] = await Promise.all([
      supabase
        .from("character_conditions")
        .select("id,custom_name,condition_definitions(name,effect_json)")
        .eq("character_id", characterId)
        .eq("is_active", true),
      supabase.from("spells").select("id,name,level").contains("classes", [className]).order("level", { ascending: true }).limit(80),
    ]);
    const normalizedConditions: Condition[] = ((condRes.data ?? []) as Array<{
      id: string;
      custom_name: string | null;
      condition_definitions: { name: string; effect_json: { speed_multiplier?: number } }[] | null;
    }>).map((row) => ({
      id: row.id,
      custom_name: row.custom_name,
      condition_definitions: row.condition_definitions?.[0] ?? null,
    }));
    setConditions(normalizedConditions);
    setSpells((spellRes.data ?? []) as { id: string; name: string; level: number }[]);
  }

  async function createCharacter() {
    if (!supabase || !campaignId || !userId) return;
    const payload = { campaign_id: campaignId, owner_user_id: userId, name: "Nuevo PJ", class_name: "paladin", level: 1, max_hp: 10, current_hp: 10, temp_hp: 0, speed: 30 };
    const { error } = await supabase.from("characters").insert(payload);
    if (error) setStatus(error.message);
    await loadCampaignData(campaignId);
  }

  async function patchCharacter(fields: Partial<Character>) {
    if (!supabase || !selectedCharacter) return;
    const { error } = await supabase.from("characters").update(fields).eq("id", selectedCharacter);
    if (error) setStatus(error.message);
    await loadCampaignData(campaignId);
  }

  async function rollDice() {
    if (!supabase || !campaignId || !userId) return;
    try {
      const result = rollFormula(rollInput);
      const { error } = await supabase.from("dice_rolls").insert({
        campaign_id: campaignId,
        character_id: selectedCharacter || null,
        rolled_by: userId,
        formula: result.formula,
        dice: result.rolls,
        modifier: result.modifier,
        total: result.total,
      });
      if (error) setStatus(error.message);
      await loadCampaignData(campaignId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Error al tirar dados");
    }
  }

  async function addLog() {
    if (!supabase || !campaignId || !userId || !logBody.trim()) return;
    const { error } = await supabase.from("session_logs").insert({
      campaign_id: campaignId,
      title: "Suceso",
      body: logBody.trim(),
      created_by: userId,
    });
    if (error) setStatus(error.message);
    setLogBody("");
    await loadCampaignData(campaignId);
  }

  if (!userId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center gap-5 px-6">
        <h1 className="text-4xl font-semibold">NoteD&DCharacter</h1>
        <p className="text-zinc-700">Gestiona personajes, estados, inventario y dados en tiempo real para D&D 5e (2014).</p>
        <button className="w-fit rounded-lg bg-zinc-900 px-4 py-2 text-white" onClick={signIn}>
          Entrar con Google
        </button>
        <button className="w-fit rounded-lg border px-4 py-2" onClick={() => void bootstrap()}>
          Ya inicie sesion, cargar datos
        </button>
        <p className="text-sm text-amber-700">{supabase ? status : "Falta configurar .env.local de Supabase"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <h1 className="text-3xl font-semibold">NoteD&DCharacter</h1>
          <p className="text-sm text-zinc-600">Campana compartida, combate, dados y bitacora del DM</p>
        </div>
        <button className="rounded-md border px-3 py-2" onClick={signOut}>Cerrar sesion</button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-4 md:col-span-1">
          <h2 className="mb-2 text-xl font-semibold">Campanas</h2>
          <div className="mb-3 flex gap-2">
            <input className="w-full rounded border px-2 py-1" placeholder="Nombre campaña" value={newCampaignName} onChange={(e) => setNewCampaignName(e.target.value)} />
            <button className="rounded bg-zinc-900 px-3 text-white" onClick={createCampaign}>Crear</button>
          </div>
          <div className="flex flex-col gap-1">
            {campaigns.map((c) => (
              <button key={c.id} className={`rounded border px-2 py-2 text-left ${campaignId === c.id ? "bg-zinc-900 text-white" : "bg-white"}`} onClick={() => { setCampaignId(c.id); void loadCampaignData(c.id); }}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 md:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Personajes</h2>
            <button className="rounded bg-zinc-900 px-3 py-1 text-white" onClick={createCharacter}>Nuevo PJ</button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {characters.map((ch) => (
              <button key={ch.id} className={`rounded border px-2 py-1 ${selectedCharacter === ch.id ? "bg-zinc-900 text-white" : ""}`} onClick={() => { setSelectedCharacter(ch.id); void loadCharacterExtras(ch.id, ch.class_name); }}>
                {ch.name}
              </button>
            ))}
          </div>
          {currentCharacter && (
            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded border px-2 py-1" value={currentCharacter.name} onChange={(e) => void patchCharacter({ name: e.target.value })} />
              <select className="rounded border px-2 py-1" value={currentCharacter.class_name} onChange={(e) => void patchCharacter({ class_name: e.target.value })}>
                {CLASS_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
              <input className="rounded border px-2 py-1" type="number" value={currentCharacter.level} onChange={(e) => void patchCharacter({ level: Number(e.target.value) })} />
              <input className="rounded border px-2 py-1" type="number" value={currentCharacter.current_hp} onChange={(e) => void patchCharacter({ current_hp: Number(e.target.value) })} />
              <input className="rounded border px-2 py-1" type="number" value={currentCharacter.max_hp} onChange={(e) => void patchCharacter({ max_hp: Number(e.target.value) })} />
              <input className="rounded border px-2 py-1" type="number" value={currentCharacter.temp_hp} onChange={(e) => void patchCharacter({ temp_hp: Number(e.target.value) })} />
              <input className="rounded border px-2 py-1" type="number" value={currentCharacter.speed} onChange={(e) => void patchCharacter({ speed: Number(e.target.value) })} />
              <div className="rounded border px-2 py-1">Velocidad efectiva: {derivedSpeed}</div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4">
          <h3 className="mb-2 text-lg font-semibold">Conjuros por clase</h3>
          <div className="max-h-56 overflow-auto text-sm">
            {spells.map((s) => (
              <div key={s.id} className="border-b py-1">Nv {s.level} - {s.name}</div>
            ))}
            {!spells.length && <p className="text-zinc-600">Carga conjuros en tabla spells para ver resultados.</p>}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-4">
          <h3 className="mb-2 text-lg font-semibold">Modo combate + dados</h3>
          <p className="mb-2 text-sm text-zinc-600">Acciones, reacciones y bonus quedan en tabla character_actions.</p>
          <div className="mb-2 flex gap-2">
            <input className="w-full rounded border px-2 py-1" value={rollInput} onChange={(e) => setRollInput(e.target.value)} />
            <button className="rounded bg-zinc-900 px-3 py-1 text-white" onClick={rollDice}>Tirar</button>
          </div>
          <div className="max-h-48 overflow-auto text-sm">
            {rolls.map((r) => (
              <div key={r.id} className="border-b py-1">{r.formula}{" => "}{JSON.stringify(r.dice)} = {r.total}</div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h3 className="mb-2 text-lg font-semibold">Bitacora del DM</h3>
        <textarea className="mb-2 h-24 w-full rounded border p-2" value={logBody} onChange={(e) => setLogBody(e.target.value)} placeholder="Escribe el suceso de la sesion..." />
        <button className="mb-3 rounded bg-zinc-900 px-3 py-1 text-white" onClick={addLog}>Guardar suceso</button>
        <div className="max-h-52 overflow-auto text-sm">
          {logs.map((l) => (
            <div key={l.id} className="mb-2 rounded border p-2">
              <div className="text-xs text-zinc-500">{l.event_date}</div>
              <div className="font-medium">{l.title ?? "Suceso"}</div>
              <div>{l.body}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm text-amber-700">{status}</p>
    </main>
  );
}
