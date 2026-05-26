"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState("Inicia sesion para entrar a NoteD&DCharacter.");

  useEffect(() => {
    if (!supabase) return;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session) {
        setLoggedInEmail(session.user.email ?? null);
        setStatus("Sesion activa.");
        router.push("/dashboard");
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedInEmail(session?.user.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setStatus("Faltan variables de entorno de Supabase.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setStatus("Escribe email y password.");
      return;
    }

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (error) {
        setStatus(error.message);
        return;
      }
      setLoggedInEmail(cleanEmail);
      setStatus("Inicio de sesion correcto.");
      router.push("/dashboard");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/reset-password`,
      },
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    if (data.session) {
      setLoggedInEmail(cleanEmail);
      setStatus("Cuenta creada e inicio correcto.");
      router.push("/dashboard");
      return;
    }

    setStatus("Cuenta creada. Ya puedes iniciar sesion.");
    setMode("login");
  }

  async function sendRecovery() {
    if (!supabase) {
      setStatus("Faltan variables de entorno de Supabase.");
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setStatus("Escribe tu email para recuperar password.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setStatus(
      error
        ? error.message
        : "Correo enviado. Abre el enlace para crear una password nueva en una ventana dedicada.",
    );
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setLoggedInEmail(null);
    setStatus("Sesion cerrada.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 md:px-8">
      <section className="panel grid w-full gap-8 p-6 md:grid-cols-2 md:p-10">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d3a84a]">NoteD&DCharacter</p>
          {loggedInEmail ? (
            <div className="rounded-xl border border-[#d3a84a66] bg-black/20 p-4 text-sm text-[#f8f4e8]">
              <p>Sesion activa con: {loggedInEmail}</p>
              <button className="btn-secondary mt-3" onClick={() => void signOut()} type="button">
                Cerrar sesion
              </button>
            </div>
          ) : null}
        </div>

        <div className="panel p-5 md:p-6">
          <div className="mb-4 flex gap-2">
            <button
              className={mode === "login" ? "btn-primary" : "btn-secondary"}
              onClick={() => setMode("login")}
              type="button"
            >
              Iniciar sesion
            </button>
            <button
              className={mode === "signup" ? "btn-primary" : "btn-secondary"}
              onClick={() => setMode("signup")}
              type="button"
            >
              Crear cuenta
            </button>
          </div>

          <form className="space-y-3" onSubmit={(event) => void submitAuth(event)}>
            <input
              className="field"
              type="email"
              value={email}
              placeholder="Email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="field"
              type="password"
              value={password}
              placeholder="Password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="btn-primary w-full" type="submit">
              {mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>

          <button className="btn-secondary mt-3 w-full" onClick={() => void sendRecovery()} type="button">
            Olvide mi password
          </button>

          <p className="mt-4 text-sm text-[#b9ae8d]">{status}</p>
        </div>
      </section>
    </main>
  );
}
