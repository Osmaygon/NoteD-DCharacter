"use client";

import { useState } from "react";

export default function ResetPasswordPage() {
  const [status] = useState(
    "La recuperacion por correo se implementara con tu proveedor SMTP propio para evitar limites.",
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10">
      <section className="panel w-full p-6 md:p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-[#d3a84a]">Recuperar acceso</p>
        <h1 className="mt-2 text-3xl">Recuperacion en construccion</h1>
        <p className="mt-4 text-sm text-[#b9ae8d]">{status}</p>
      </section>
    </main>
  );
}
