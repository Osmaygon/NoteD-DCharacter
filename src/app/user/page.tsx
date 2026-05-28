"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser, signOutAppUser } from "@/lib/custom-auth";

export default function UserPage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    void (async () => {
      const user = await getCurrentAppUser();
      if (!user) {
        window.location.href = "/";
        return;
      }
      setEmail(user.email);
    })();
  }, []);

  async function signOut() {
    await signOutAppUser();
    window.location.href = "/";
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel p-4">
        <h1 className="mb-3 text-2xl">Usuario</h1>
        <p className="text-sm text-[#b9ae8d]">Sesion iniciada con: {email || "..."}</p>
        <button className="btn-secondary mt-3" onClick={() => void signOut()} type="button">
          Cerrar sesion
        </button>
      </section>
    </main>
  );
}
