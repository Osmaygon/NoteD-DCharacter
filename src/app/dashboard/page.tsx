"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser } from "@/lib/custom-auth";
import { HomeEntity, listCampaigns, listCharacters } from "@/lib/home-entities";

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<HomeEntity[]>([]);
  const [characters, setCharacters] = useState<HomeEntity[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const user = await getCurrentAppUser();
        if (!user) {
          window.location.href = "/";
          return;
        }
        const [campaignRows, characterRows] = await Promise.all([
          listCampaigns(user.user_id),
          listCharacters(user.user_id),
        ]);
        setCampaigns(campaignRows.slice(0, 5));
        setCharacters(characterRows.slice(0, 5));
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl">Ultimas campañas</h2>
          <Link href="/campaigns" className="btn-secondary">
            Ver todas
          </Link>
        </div>
        <div className="grid gap-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} className="rounded border border-[#d3a84a44] p-3 hover:bg-[#ffffff08]">
              <p className="font-semibold">{c.name}</p>
              <p className="mobile-detail text-xs text-[#b9ae8d]">Codigo: {c.join_code}</p>
            </Link>
          ))}
          {!campaigns.length ? <p className="text-sm text-[#b9ae8d]">No tienes campañas aun.</p> : null}
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl">Personajes</h2>
          <Link href="/characters" className="btn-secondary">
            Ver todos
          </Link>
        </div>
        <div className="grid gap-2">
          {characters.map((c) => (
            <Link key={c.id} href={`/characters/${c.id}`} className="rounded border border-[#d3a84a44] p-3 hover:bg-[#ffffff08]">
              <p className="font-semibold">{c.name}</p>
              <p className="mobile-detail text-xs text-[#b9ae8d]">Codigo: {c.join_code}</p>
            </Link>
          ))}
          {!characters.length ? <p className="text-sm text-[#b9ae8d]">No tienes personajes aun.</p> : null}
        </div>
      </section>
    </main>
  );
}
