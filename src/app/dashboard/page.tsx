"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/");
        return;
      }
      setEmail(data.session.user.email ?? "");
    })();
  }, [router]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-4 py-10">
      <section className="panel w-full p-6 md:p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-[#d3a84a]">Dashboard</p>
        <h1 className="mt-2 text-3xl">Sesion iniciada correctamente</h1>
        <p className="mt-2 text-[#b9ae8d]">Usuario: {email || "Cargando..."}</p>
        <button className="btn-secondary mt-4" onClick={() => void signOut()} type="button">
          Cerrar sesion
        </button>
      </section>
    </main>
  );
}
