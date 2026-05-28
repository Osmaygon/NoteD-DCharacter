"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser } from "@/lib/custom-auth";
import { createCampaign, HomeEntity, joinCampaign, listCampaigns } from "@/lib/home-entities";

export default function CampaignsPage() {
  const [userId, setUserId] = useState("");
  const [campaigns, setCampaigns] = useState<HomeEntity[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("Cargando...");

  async function refresh(uid: string) {
    const rows = await listCampaigns(uid);
    setCampaigns(rows);
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
        await refresh(user.user_id);
        setStatus("Listo");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Error cargando campanas");
      }
    })();
  }, []);

  async function onCreate() {
    if (!userId || !newName.trim()) return;
    try {
      await createCampaign(userId, newName.trim());
      setNewName("");
      await refresh(userId);
      setStatus("Campana creada");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo crear");
    }
  }

  async function onJoin() {
    if (!userId || !joinCode.trim()) return;
    try {
      await joinCampaign(userId, joinCode.trim());
      setJoinCode("");
      await refresh(userId);
      setStatus("Te uniste a la campana");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo unir");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 p-4">
        <h1 className="mb-3 text-2xl">Campanas</h1>
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input className="field" placeholder="Nombre nueva campana" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary" onClick={() => void onCreate()} type="button">Crear</button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input className="field" placeholder="Codigo para unirte" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
          <button className="btn-secondary" onClick={() => void onJoin()} type="button">Unirme</button>
        </div>
      </section>

      <section className="panel p-4">
        <div className="grid gap-2">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded border border-[#d3a84a44] p-3">
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-[#b9ae8d]">Codigo: {c.join_code}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-4 text-sm text-[#b9ae8d]">{status}</p>
    </main>
  );
}
