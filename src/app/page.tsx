"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentAppUser,
  signInAppUser,
  signOutAppUser,
  signUpAppUser,
} from "@/lib/custom-auth";

export default function Home() {
  const router = useRouter();
  const [loggedInEmail, setLoggedInEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState("Inicia sesion para entrar a NoteD&DCharacter.");

  useEffect(() => {
    void (async () => {
      const user = await getCurrentAppUser();
      if (user) {
        setLoggedInEmail(user.email);
        setStatus("Sesion activa.");
        router.push("/dashboard");
      }
    })();
  }, [router]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setStatus("Escribe email y password.");
      return;
    }

    if (mode === "login") {
      try {
        await signInAppUser(cleanEmail, cleanPassword);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "No se pudo iniciar sesion");
        return;
      }
      setLoggedInEmail(cleanEmail);
      setStatus("Inicio de sesion correcto.");
      router.push("/dashboard");
      return;
    }

    try {
      await signUpAppUser(cleanEmail, cleanPassword);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo crear cuenta");
      return;
    }
    setLoggedInEmail(cleanEmail);
    setStatus("Cuenta creada e inicio correcto.");
    router.push("/dashboard");
  }

  async function sendRecovery() {
    setStatus("Recuperacion por correo pendiente de implementar en tu proveedor de email.");
  }

  async function signOut() {
    await signOutAppUser();
    setLoggedInEmail(null);
    setStatus("Sesion cerrada.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 md:px-8">
      <section className="panel grid w-full gap-8 p-6 md:grid-cols-2 md:p-10">
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-[#d3a84a]">NoteD&DCharacter</p>
          <h1 className="text-4xl font-semibold leading-tight text-[#f8f4e8]">Fichas de D&D listas para mesa.</h1>
          <p className="text-sm text-[#b9ae8d]">Gestiona personajes, inventario, conjuros y niveles. Si solo quieres curiosear, entra en la demo pública: puedes tocar botones sin guardar nada.</p>
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

          <a className="btn-secondary mt-3 block w-full text-center" href="/demo">
            Ver demo sin cuenta
          </a>

          <p className="mt-4 text-sm text-[#b9ae8d]">{status}</p>
        </div>
      </section>
    </main>
  );
}
