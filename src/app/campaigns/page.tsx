"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser } from "@/lib/custom-auth";
import { HomeEntity, createCampaign, joinCampaign, listCampaigns } from "@/lib/home-entities";

function roleLabel(role?: string): string {
  if (role === "owner") return "Propietario";
  if (role === "admin") return "Admin";
  if (role === "editor") return "Editor";
  return "Lector";
}

export default function CampaignsPage() {
  const [userId, setUserId] = useState("");
  const [campaigns, setCampaigns] = useState<HomeEntity[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");

  async function refresh(uid: string) {
    setCampaigns(await listCampaigns(uid));
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
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudieron cargar campañas");
      }
    })();
  }, []);

  async function onCreate() {
    if (!userId || !newName.trim()) return;
    try {
      setMessage("");
      await createCampaign(userId, newName.trim());
      setNewName("");
      await refresh(userId);
      setMessage("Campaña creada. Entra para editar su diario.");
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
      await refresh(userId);
      setMessage("Te has unido a la campaña. Entra para leer su diario.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No te pudiste unir");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 overflow-hidden p-0">
        <div className="border-b border-[#d3a84a33] bg-[radial-gradient(circle_at_20%_0%,rgba(211,168,74,0.22),transparent_34%),linear-gradient(135deg,rgba(211,168,74,0.14),rgba(0,0,0,0.16))] p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-[#b9ae8d]">Campañas</p>
          <h1 className="mt-1 text-3xl text-[#f3dfac]">Biblioteca de campañas</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#d9c89e]">Entra en una campaña para leer su diario, editar la historia y gestionar las bitácoras de cada sesión.</p>
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

      <section className="panel p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <Link key={campaign.id} href={`/campaigns/${campaign.id}`} className="rounded-xl border border-[#d3a84a44] bg-black/25 p-4 transition hover:border-[#ffd86faa] hover:bg-[#ffd86f12]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[#f3dfac]">{campaign.name}</p>
                  <p className="mt-1 text-xs text-[#b9ae8d]">{roleLabel(campaign.role)} · Código {campaign.join_code}</p>
                </div>
                <span className="rounded-full border border-[#d3a84a44] px-3 py-1 text-xs text-[#d9c89e]">Entrar</span>
              </div>
              <p className="mobile-detail mt-3 line-clamp-2 text-sm text-[#d9c89e]">{campaign.description || "Sin historia todavía."}</p>
            </Link>
          ))}
          {!campaigns.length ? <p className="text-sm text-[#b9ae8d]">No tienes campañas aún.</p> : null}
        </div>
      </section>
    </main>
  );
}
