"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser } from "@/lib/custom-auth";
import { createCharacter, HomeEntity, joinCharacter, listCharacters } from "@/lib/home-entities";

export default function CharactersPage() {
  const [userId, setUserId] = useState("");
  const [characters, setCharacters] = useState<HomeEntity[]>([]);
  const [newName, setNewName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  async function refresh(uid: string) {
    const rows = await listCharacters(uid);
    setCharacters(rows);
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
        console.error(error);
      }
    })();
  }, []);

  async function onCreate() {
    if (!userId || !newName.trim()) return;
    try {
      await createCharacter(userId, newName.trim());
      setNewName("");
      await refresh(userId);
    } catch (error) {
      console.error(error);
    }
  }

  async function onJoin() {
    if (!userId || !joinCode.trim()) return;
    try {
      await joinCharacter(userId, joinCode.trim());
      setJoinCode("");
      await refresh(userId);
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 p-4">
        <h1 className="mb-3 text-2xl">Personajes</h1>
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <input className="field" placeholder="Nombre nuevo personaje" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary" onClick={() => void onCreate()} type="button">Crear</button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input className="field" placeholder="Codigo para unirte" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
          <button className="btn-secondary" onClick={() => void onJoin()} type="button">Unirme</button>
        </div>
      </section>

      <section className="panel p-4">
        <div className="grid gap-2">
          {characters.map((c) => (
            <div key={c.id} className="rounded border border-[#d3a84a44] p-3">
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-[#b9ae8d]">Codigo: {c.join_code}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
