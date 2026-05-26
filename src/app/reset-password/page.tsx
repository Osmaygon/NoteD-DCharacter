"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("Escribe una password nueva para tu cuenta.");

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("Token valido. Ya puedes guardar la nueva password.");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setStatus("Faltan variables de entorno de Supabase.");
      return;
    }

    const next = password.trim();
    const confirm = confirmPassword.trim();
    if (!next || next.length < 6) {
      setStatus("La password debe tener al menos 6 caracteres.");
      return;
    }
    if (next !== confirm) {
      setStatus("Las passwords no coinciden.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setStatus(error ? error.message : "Password actualizada. Vuelve a la pantalla de inicio e inicia sesion.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10">
      <section className="panel w-full p-6 md:p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-[#d3a84a]">Recuperar acceso</p>
        <h1 className="mt-2 text-3xl">Crear nueva password</h1>
        <form className="mt-5 space-y-3" onSubmit={(event) => void updatePassword(event)}>
          <input
            className="field"
            type="password"
            value={password}
            placeholder="Nueva password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            className="field"
            type="password"
            value={confirmPassword}
            placeholder="Repite la nueva password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <button className="btn-primary w-full" type="submit">
            Guardar password
          </button>
        </form>
        <p className="mt-4 text-sm text-[#b9ae8d]">{status}</p>
      </section>
    </main>
  );
}
