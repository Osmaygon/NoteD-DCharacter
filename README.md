# NoteD&DCharacter

Aplicacion web (PWA-ready) para gestionar personajes de D&D 5e (2014) con sincronizacion por cuenta, campanas compartidas, rol DM/co-DM, tiradas en vivo y bitacora de sesion.

## Stack

- Next.js + TypeScript
- Supabase (Auth Email/Password, Postgres, Realtime, RLS)
- Vercel para despliegue

## Setup rapido

1) Instala dependencias:

```bash
npm install
```

2) Crea `.env.local` copiando `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

3) En Supabase > SQL Editor ejecuta `supabase/schema.sql`.
   Luego ejecuta:
   - `supabase/seed_conditions.sql`
   - `supabase/seed_sourcebooks_and_spells.sql`

4) Auth en Supabase (sin Google):
- En `Authentication > Providers`, habilita `Email`.
- En `Authentication > URL Configuration` agrega:
  - `Site URL`: `http://localhost:3000`
  - `Allowed Redirect URLs`: `http://localhost:3000/**`

5) Arranca local:

```bash
npm run dev
```

## Funcionalidad MVP incluida

- Login email/password
- Campanas y personajes
- Vida, escudo temporal, nivel, velocidad
- Ajuste de velocidad por estados (ejemplo via `effect_json.speed_multiplier`)
- Tiradas de dados con notacion `XdY+Z` en `d4/d6/d8/d10/d12/d20/d100`
- Log de dados compartido por partida
- Bitacora DM de sucesos
- Libros externos por campana y personaje
- Informacion personal del personaje
- Lista de conjuros filtrada por clase (`spells.classes`)

## Publicar en tu GitHub

Repositorio objetivo: `https://github.com/Osmaygon/NoteD-DCharacter.git`

```bash
git init
git add .
git commit -m "feat: initial NoteD&DCharacter MVP"
git branch -M main
git remote add origin https://github.com/Osmaygon/NoteD-DCharacter.git
git push -u origin main
```

## Notas

- Nunca pongas `secret key` o `service_role` en el frontend.
- Usa solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key).
