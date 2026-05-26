"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentAppUser, signOutAppUser } from "@/lib/custom-auth";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const user = await getCurrentAppUser();
      if (!user) {
        router.push("/");
        return;
      }
      setEmail(user.email ?? "");
    })();
  }, [router]);

  async function signOut() {
    await signOutAppUser();
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
