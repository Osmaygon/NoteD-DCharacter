"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUser, getStoredSessionToken } from "@/lib/custom-auth";
import { parseImportedCharacter } from "@/lib/character-import";
import { extractTextFromPdf } from "@/lib/pdf-import";
import {
  deleteCharacter,
  HomeEntity,
  importCharacterFromPayload,
  listCharacters,
} from "@/lib/home-entities";

export default function CharactersPage() {
  const [userId, setUserId] = useState("");
  const [characters, setCharacters] = useState<HomeEntity[]>([]);
  const [importing, setImporting] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [importInfo, setImportInfo] = useState("");
  const [nivel20Loading, setNivel20Loading] = useState(false);
  const [nivel20Characters, setNivel20Characters] = useState<Array<{ id: string; name: string; path: string }>>([]);
  const [selectedNivel20Path, setSelectedNivel20Path] = useState("");

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

  async function onImportFile(file: File) {
    if (!userId) return;
    try {
      setErrorText("");
      setImportInfo("");
      setImporting(true);
      const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
      const pdfData = isPdf ? await extractTextFromPdf(file) : null;
      const rawText = pdfData ? pdfData.fullText : await file.text();
      const parsed = parseImportedCharacter(rawText);
      if (pdfData) {
        parsed.source_payload.pages = pdfData.pages;
      }
      await importCharacterFromPayload(userId, parsed);
      await refresh(userId);
      setImportInfo(`Importado: ${parsed.name} (${parsed.class_name || "Sin clase"})`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "No se pudo importar el personaje");
    } finally {
      setImporting(false);
    }
  }

  async function onDeleteCharacter(characterId: string) {
    if (!userId) return;
    try {
      setErrorText("");
      await deleteCharacter(userId, characterId);
      await refresh(userId);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "No se pudo borrar el personaje");
    }
  }

  async function loadNivel20Characters() {
    try {
      setErrorText("");
      setImportInfo("");
      setNivel20Loading(true);
      const response = await fetch("/api/nivel20/characters");
      const body = (await response.json()) as {
        error?: string;
        characters?: Array<{ id: string; name: string; path: string }>;
      };
      if (!response.ok) {
        throw new Error(body.error || "No se pudo cargar personajes de Nivel20");
      }
      const rows = body.characters ?? [];
      setNivel20Characters(rows);
      setSelectedNivel20Path(rows[0]?.path ?? "");
      setImportInfo(rows.length ? `Nivel20: ${rows.length} personajes cargados.` : "No hay personajes visibles en Nivel20.");
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "No se pudo cargar Nivel20");
    } finally {
      setNivel20Loading(false);
    }
  }

  async function importSelectedNivel20Character() {
    if (!selectedNivel20Path || !userId) return;
    const appSessionToken = getStoredSessionToken();
    if (!appSessionToken) {
      setErrorText("Sesion local no encontrada");
      return;
    }

    try {
      setErrorText("");
      setImportInfo("");
      setNivel20Loading(true);
      const response = await fetch("/api/nivel20/import-character", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterPath: selectedNivel20Path, appSessionToken }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "No se pudo importar personaje de Nivel20");
      }
      await refresh(userId);
      const pickedName = nivel20Characters.find((row) => row.path === selectedNivel20Path)?.name || "Personaje";
      setImportInfo(`Importado desde Nivel20: ${pickedName}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "No se pudo importar personaje de Nivel20");
    } finally {
      setNivel20Loading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-6 md:px-8">
      <AppHeader />

      <section className="panel mb-4 p-4">
        <h1 className="mb-2 text-2xl">Personajes</h1>
        <p className="mb-1 text-sm text-[#b9ae8d]">Selecciona un personaje de Nivel20 y traelo a tu web para editarlo aqui.</p>
        <p className="mb-4 text-xs text-[#9f9578]">Nivel20 se usa en modo solo lectura. Nunca se modifican datos remotos.</p>

        <div className="mb-4 grid gap-2 md:grid-cols-[auto_1fr_auto]">
          <button className="btn-secondary" type="button" disabled={nivel20Loading} onClick={() => void loadNivel20Characters()}>
            {nivel20Loading ? "Cargando..." : "Cargar personajes"}
          </button>
          <select
            className="field"
            value={selectedNivel20Path}
            disabled={nivel20Loading || !nivel20Characters.length}
            onChange={(event) => setSelectedNivel20Path(event.target.value)}
          >
            {!nivel20Characters.length ? <option value="">Sin personajes cargados</option> : null}
            {nivel20Characters.map((row) => (
              <option key={row.id} value={row.path}>{row.name}</option>
            ))}
          </select>
          <button
            className="btn-primary"
            type="button"
            disabled={nivel20Loading || !selectedNivel20Path}
            onClick={() => void importSelectedNivel20Character()}
          >
            Unirme
          </button>
        </div>

        <details>
          <summary className="cursor-pointer text-sm text-[#b9ae8d]">Importar por PDF/TXT (fallback)</summary>
          <div className="mt-3">
            <label className="mb-1 block text-sm text-[#b9ae8d]">Importar hoja (.pdf recomendado, tambien .txt)</label>
            <input
              className="field"
              type="file"
              accept=".pdf,.txt"
              disabled={importing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void onImportFile(file);
                  e.currentTarget.value = "";
                }
              }}
            />
          </div>
        </details>
        {importing ? <p className="mt-2 text-sm text-[#b9ae8d]">Procesando PDF...</p> : null}
        {importInfo ? <p className="mt-2 text-sm text-green-300">{importInfo}</p> : null}
        {errorText ? <p className="mt-2 text-sm text-red-300">{errorText}</p> : null}
      </section>

      <section className="panel p-4">
        <div className="grid gap-2">
          {characters.map((c) => (
            <div key={c.id} className="rounded border border-[#d3a84a44] p-3">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/characters/${c.id}`} className="block min-w-0 flex-1 hover:text-[#f5db95]">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-[#b9ae8d]">Codigo: {c.join_code}</p>
                </Link>
                <button
                  type="button"
                  className="rounded border border-red-400/70 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                  onClick={() => void onDeleteCharacter(c.id)}
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
