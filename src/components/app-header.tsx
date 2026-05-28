"use client";

import Link from "next/link";
import { useState } from "react";

export function AppHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="panel mb-6 flex items-center justify-between p-4">
      <Link href="/dashboard" className="text-xl font-semibold tracking-wide text-[#f8f4e8]">
        NoteD&DCharacter
      </Link>

      <div className="relative">
        <button
          type="button"
          className="btn-secondary"
          aria-label="menu"
          onClick={() => setOpen((prev) => !prev)}
        >
          ☰
        </button>

        {open ? (
          <nav className="panel absolute right-0 top-12 z-10 min-w-44 p-2">
            <Link href="/user" className="block rounded px-3 py-2 hover:bg-[#ffffff12]" onClick={() => setOpen(false)}>
              Usuario
            </Link>
            <Link href="/characters" className="block rounded px-3 py-2 hover:bg-[#ffffff12]" onClick={() => setOpen(false)}>
              Personajes
            </Link>
            <Link href="/campaigns" className="block rounded px-3 py-2 hover:bg-[#ffffff12]" onClick={() => setOpen(false)}>
              Campañas
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
