"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type CoinKey = "cp" | "sp" | "gp" | "pp";

type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  equipped?: boolean;
};

const initialInventory: InventoryItem[] = [
  { id: "longsword", name: "Espada larga", quantity: 1, equipped: true },
  { id: "shield", name: "Escudo con blasón", quantity: 1, equipped: true },
  { id: "rations", name: "Raciones", quantity: 5 },
  { id: "potion", name: "Poción de curación", quantity: 2 },
];

const traits = [
  "Imponer las manos",
  "Castigo divino",
  "Sentidos divinos",
  "Ataque de aliento",
];

const spells = ["Bendición", "Curar heridas", "Escudo de fe", "Detectar magia"];

export default function DemoPage() {
  const [currentHp, setCurrentHp] = useState(34);
  const [tempHp, setTempHp] = useState(0);
  const [wallet, setWallet] = useState<Record<CoinKey, number>>({ cp: 8, sp: 12, gp: 46, pp: 1 });
  const [inventory, setInventory] = useState(initialInventory);
  const [message, setMessage] = useState("Modo demo: puedes tocar todo, nada se guarda.");

  const hpPercent = useMemo(() => Math.max(0, Math.min(100, Math.round((currentHp / 42) * 100))), [currentHp]);

  function adjustHp(delta: number) {
    setCurrentHp((value) => Math.max(0, Math.min(42, value + delta)));
    setMessage(delta < 0 ? "Daño aplicado solo en esta demo." : "Curación aplicada solo en esta demo.");
  }

  function adjustCoin(coin: CoinKey, delta: number) {
    setWallet((value) => ({ ...value, [coin]: Math.max(0, value[coin] + delta) }));
    setMessage("Cartera modificada en memoria. Al recargar vuelve al estado inicial.");
  }

  function consumeItem(id: string) {
    setInventory((items) => items.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item));
    setMessage("Objeto usado en demo. No afecta a ninguna partida real.");
  }

  function resetDemo() {
    setCurrentHp(34);
    setTempHp(0);
    setWallet({ cp: 8, sp: 12, gp: 46, pp: 1 });
    setInventory(initialInventory);
    setMessage("Demo reiniciada.");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <header className="panel mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
        <Link href="/" className="text-xl font-semibold tracking-wide text-[#f8f4e8]">NoteD&DCharacter</Link>
        <div className="flex gap-2">
          <Link className="btn-secondary" href="/">Entrar</Link>
          <button className="btn-primary" type="button" onClick={resetDemo}>Reiniciar demo</button>
        </div>
      </header>

      <section className="panel overflow-hidden p-5">
        <div className="rounded-[2rem] border border-[#7b5a2d]/70 bg-[radial-gradient(circle_at_top_left,#3a2313,transparent_35%),#100b07] p-5 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#d7b46a]">Personaje demo público</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold text-[#f2dfb3]">Aurelia Valdaceniza</h1>
              <p className="mt-1 text-[#d9c89e]">Paladín 5 · Dracónida · Juramento de Devoción</p>
            </div>
            <div className="rounded-2xl border border-[#d3a84a55] bg-black/25 px-5 py-3 text-center">
              <p className="text-xs uppercase tracking-wide text-[#b9ae8d]">CA</p>
              <p className="text-3xl text-[#f3dfac]">18</p>
            </div>
          </div>

          <p className="mt-4 rounded-xl bg-[#24170d] p-3 text-sm text-[#f2dfb3]">{message}</p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-2xl border border-[#d3a84a55] bg-black/25 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Puntos de golpe</p>
                  <p className="mt-1 text-3xl text-[#f3dfac]">{currentHp} / 42 <span className="text-lg text-[#b9ae8d]">+{tempHp} temp</span></p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary" onClick={() => adjustHp(-5)} type="button">-5 daño</button>
                  <button className="btn-secondary" onClick={() => adjustHp(5)} type="button">+5 curar</button>
                  <button className="btn-secondary" onClick={() => setTempHp((v) => v + 3)} type="button">+3 temp</button>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/50">
                <div className="h-full rounded-full bg-gradient-to-r from-red-700 via-amber-500 to-[#f3dfac]" style={{ width: `${hpPercent}%` }} />
              </div>
            </section>

            <section className="rounded-2xl border border-[#d3a84a55] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Cartera demo</p>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {(Object.keys(wallet) as CoinKey[]).map((coin) => (
                  <div key={coin} className="rounded-xl bg-[#0c0805] p-3 text-center">
                    <p className="text-lg text-[#f3dfac]">{wallet[coin]}</p>
                    <p className="text-xs uppercase text-[#b9ae8d]">{coin}</p>
                    <div className="mt-2 flex justify-center gap-1">
                      <button className="rounded border border-[#d3a84a55] px-2" onClick={() => adjustCoin(coin, -1)} type="button">-</button>
                      <button className="rounded border border-[#d3a84a55] px-2" onClick={() => adjustCoin(coin, 1)} type="button">+</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="rounded-2xl border border-[#d3a84a55] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Inventario</p>
              <div className="mt-3 space-y-2">
                {inventory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#0c0805] p-3">
                    <div>
                      <p className="text-sm text-[#f3dfac]">{item.name}</p>
                      <p className="text-xs text-[#b9ae8d]">Cantidad: {item.quantity}{item.equipped ? " · equipado" : ""}</p>
                    </div>
                    <button className="btn-secondary" disabled={item.quantity <= 0} onClick={() => consumeItem(item.id)} type="button">Usar</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#d3a84a55] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Rasgos</p>
              <ul className="mt-3 space-y-2 text-sm text-[#f3dfac]">
                {traits.map((trait) => <li className="rounded-xl bg-[#0c0805] p-3" key={trait}>{trait}</li>)}
              </ul>
            </section>

            <section className="rounded-2xl border border-[#d3a84a55] bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-[#b9ae8d]">Conjuros preparados</p>
              <ul className="mt-3 space-y-2 text-sm text-[#f3dfac]">
                {spells.map((spell) => <li className="rounded-xl bg-[#0c0805] p-3" key={spell}>{spell}</li>)}
              </ul>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
