"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser, getStoredSessionToken, signOutAppUser } from "@/lib/custom-auth";

export default function UserPage() {
  const [email, setEmail] = useState("");
  const [cookie, setCookie] = useState("");
  const [cookieStatus, setCookieStatus] = useState("Cargando estado de Nivel20...");
  const [busy, setBusy] = useState(false);
  const [captureStatus, setCaptureStatus] = useState("");

  useEffect(() => {
    void (async () => {
      const user = await getCurrentAppUser();
      if (!user) {
        window.location.href = "/";
        return;
      }
      setEmail(user.email);
      await refreshNivel20Status();
    })();
  }, []);

  function token(): string {
    const value = getStoredSessionToken();
    if (!value) throw new Error("Sesion local no encontrada");
    return value;
  }

  async function refreshNivel20Status() {
    const appSessionToken = getStoredSessionToken();
    if (!appSessionToken) return;
    const response = await fetch(`/api/nivel20/settings?appSessionToken=${encodeURIComponent(appSessionToken)}`);
    const body = (await response.json()) as { hasCookie?: boolean; updatedAt?: string | null; error?: string };
    if (!response.ok) throw new Error(body.error ?? "No se pudo leer Nivel20");
    setCookieStatus(body.hasCookie ? `Cookie guardada${body.updatedAt ? ` · ${new Date(body.updatedAt).toLocaleString()}` : ""}` : "No hay cookie guardada");
  }

  async function testCookie() {
    setBusy(true);
    setCaptureStatus("");
    try {
      const response = await fetch("/api/nivel20/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appSessionToken: token(), cookie, test: true }),
      });
      const body = (await response.json()) as { characters?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Cookie invalida");
      setCookieStatus(`Cookie valida · ${body.characters ?? 0} personajes detectados`);
    } catch (error) {
      setCookieStatus(error instanceof Error ? error.message : "Error probando cookie");
    } finally {
      setBusy(false);
    }
  }

  async function saveCookie() {
    setBusy(true);
    setCaptureStatus("");
    try {
      const response = await fetch("/api/nivel20/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appSessionToken: token(), cookie }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo guardar");
      setCookie("");
      await refreshNivel20Status();
    } catch (error) {
      setCookieStatus(error instanceof Error ? error.message : "Error guardando cookie");
    } finally {
      setBusy(false);
    }
  }

  async function captureLevels() {
    setBusy(true);
    setCaptureStatus("Capturando personajes desde Nivel20...");
    try {
      const response = await fetch("/api/nivel20/capture-levels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appSessionToken: token() }),
      });
      const body = (await response.json()) as { results?: Array<{ name: string; level?: number; status: string }>; error?: string };
      if (!response.ok) throw new Error(body.error ?? "No se pudo capturar");
      const saved = body.results?.filter((row) => row.status === "guardado").length ?? 0;
      const details = body.results?.map((row) => `${row.name}: ${row.status}${row.level ? ` nivel ${row.level}` : ""}`).join(" · ");
      setCaptureStatus(`Captura terminada: ${saved} guardados. ${details ?? ""}`);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : "Error capturando niveles");
    } finally {
      setBusy(false);
    }
  }

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

      <section className="panel mt-4 overflow-hidden p-4">
        <div className="rounded-2xl border border-[#7b5a2d]/50 bg-[#170f09] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <p className="text-xs uppercase tracking-[0.35em] text-[#d7b46a]">Nivel20</p>
          <h2 className="mt-2 text-2xl text-[#f2dfb3]">Mesa de sincronizacion</h2>
          <p className="mt-2 max-w-3xl text-sm text-[#b9ae8d]">
            Pega aqui la cookie desde el ordenador. Despues pulsa capturar: la BD guardara una version por nivel para cada personaje sin pisar inventarios, cartera, vida actual, municion ni estados de partida.
          </p>

          <textarea
            className="mt-4 min-h-28 w-full rounded-xl border border-[#5e4728] bg-[#0d0906] p-3 text-sm text-[#f5e7c8] outline-none focus:border-[#d7b46a]"
            onChange={(event) => setCookie(event.target.value)}
            placeholder="Pega aqui la cookie completa de Nivel20"
            value={cookie}
          />
          <p className="mt-2 text-xs text-[#b9ae8d]">{cookieStatus}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-secondary" disabled={busy || !cookie.trim()} onClick={() => void testCookie()} type="button">
              Probar cookie
            </button>
            <button className="btn-primary" disabled={busy || !cookie.trim()} onClick={() => void saveCookie()} type="button">
              Guardar cookie
            </button>
            <button className="btn-primary" disabled={busy} onClick={() => void captureLevels()} type="button">
              Capturar niveles desde Nivel20
            </button>
          </div>

          {captureStatus ? <p className="mt-4 rounded-xl bg-[#24170d] p-3 text-sm text-[#f2dfb3]">{captureStatus}</p> : null}
        </div>
      </section>
    </main>
  );
}
