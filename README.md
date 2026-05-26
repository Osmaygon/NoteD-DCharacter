# NoteD&DCharacter

Base inicial de autenticacion para la app web.

## Incluye ahora

- Pantalla inicial con prioridad en `Iniciar sesion`.
- `Crear cuenta` como opcion secundaria.
- Autenticacion propia en tu BD (`app_users` + `app_sessions`).
- Password hasheada en BD con `pgcrypto` (bcrypt via `crypt`).
- Tema visual oscuro con acentos dorados y layout comodo.
- Reglas globales de producto en `docs/PRODUCT_RULES.md`.

## Configuracion

1. Copia `.env.example` a `.env.local`.
2. Rellena tus variables de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_publica_de_supabase
```

3. Ejecuta en Supabase SQL Editor el archivo `supabase/custom_auth.sql`.
4. En `Authentication > URL Configuration` agrega:
   - `http://localhost:3000/**`
   - `https://note-d-d-character.vercel.app/**`
   - `Site URL`: `https://note-d-d-character.vercel.app`
5. Ejecuta la app:

```bash
npm install
npm run dev
```
