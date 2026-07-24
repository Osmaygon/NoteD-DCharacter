# Revisión de seguridad para pi - NoteD-DCharacter

Fecha: 2026-07-08

Este documento resume los problemas/riesgos detectados en el proyecto `NoteD-DCharacter` para que otra sesión de pi pueda continuar sin perder contexto.

## Estado general

No se encontraron tokens reales, contraseñas reales, claves privadas ni API keys publicadas en el repositorio público principal.

El archivo público `.env.example` solo contiene placeholders:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_publica_de_supabase
```

`.gitignore` ignora `.env*` y permite solo `.env.example`, lo cual está bien.

## Repos/rutas revisadas

Repositorio principal local:

- `/home/osmay/proyectos/note-dnd-character`

Existe un `.env.local` local. No parece estar trackeado por Git, pero debe tratarse como sensible.

## Problemas y riesgos detectados

### 1. Funciones RPC antiguas `*_for_user` aceptan `user_id` directamente

Archivo principal:

- `supabase/home_entities.sql`

Hay funciones antiguas que reciben `p_user_id uuid`, por ejemplo:

- `list_campaigns_for_user(uuid)`
- `get_campaign_detail_for_user(uuid, uuid)`
- `update_campaign_for_user(...)`
- `delete_campaign_for_user(...)`
- `list_characters_for_user(uuid)`
- `get_character_detail_for_user(uuid, uuid)`
- `update_character_detail_for_user(...)`
- `delete_character_for_user(...)`

Riesgo: si estas funciones son ejecutables por `anon` o `authenticated`, un cliente podría pasar el UUID de otro usuario e intentar leer/modificar datos ajenos.

Mitigación presente en el SQL:

- Al final de `supabase/home_entities.sql` hay wrappers nuevos `*_for_session`.
- Estos wrappers usan `require_app_user_id(p_token)` para resolver el usuario desde el token de sesión.
- También hay `revoke execute` para quitar permisos públicos a muchas funciones `*_for_user`.

Acción recomendada:

1. Confirmar en la base real de Supabase que el SQL completo se aplicó hasta el final.
2. Verificar que las funciones `*_for_user` ya no tengan permisos para `anon`, `authenticated` ni `public`.
3. Mantener accesibles al cliente solo las funciones `*_for_session` necesarias.

### 2. Tokens de sesión hasheados con MD5

Archivo:

- `supabase/custom_auth.sql`

Actualmente las sesiones se guardan y buscan con:

```sql
token_hash = md5(plain_token)
```

y:

```sql
where s.token_hash = md5(p_token)
```

Riesgo: MD5 está obsoleto. Como el token es aleatorio y largo, el riesgo práctico es menor que con contraseñas, pero sigue siendo una mala práctica.

Acción recomendada:

- Migrar a SHA-256 usando `pgcrypto`, por ejemplo `encode(digest(token, 'sha256'), 'hex')`.
- Actualizar todas las funciones que crean, buscan, cambian contraseña o cierran sesión.

Funciones afectadas en `custom_auth.sql`:

- `create_app_user`
- `login_app_user`
- `get_user_by_session`
- `update_app_user_nickname`
- `change_app_user_password`
- `logout_app_session`

### 3. Token de sesión guardado en cliente

Archivo:

- `src/lib/custom-auth.ts`

El token de sesión se guarda en el cliente. Si está en `localStorage`, una vulnerabilidad XSS podría robarlo.

Riesgo: robo de sesión si se inyecta JavaScript malicioso.

Acción recomendada:

- Migrar a cookie `HttpOnly`, `Secure`, `SameSite=Lax` o `Strict`.
- Preferiblemente manejar login/sesión desde API routes/server side, no desde llamadas directas del navegador a RPCs sensibles.

### 4. Script antiguo usa RPCs `*_for_user`

Archivo:

- `scripts/import-nivel20-campaign.mjs`

El script todavía usa llamadas antiguas con `userId`, por ejemplo:

- `list_all_characters_for_user`
- `get_character_detail_for_user`
- `import_character_from_payload`
- `sync_character_base_from_payload`

Riesgo:

- Si las funciones antiguas están revocadas correctamente, el script puede fallar.
- Si se reabren permisos para que el script funcione, se puede reintroducir el riesgo de acceso por `user_id` elegido por cliente.

Acción recomendada:

- Migrar el script a funciones `*_for_session` usando token de sesión, o convertirlo en herramienta server/admin controlada.
- No reabrir permisos públicos a `*_for_user` solo para este script.

### 5. Variable sensible `NIVEL20_SESSION_COOKIE`

Archivo:

- `src/lib/nivel20.ts`

Usa:

```ts
process.env.NIVEL20_SESSION_COOKIE
```

Riesgo: si se expone al frontend o se sube a Git, permitiría acceso a una sesión externa de Nivel20.

Acción recomendada:

- Mantenerla solo en servidor.
- No usar prefijo `NEXT_PUBLIC_`.
- Confirmar que no se serializa ni se devuelve al navegador.
- Mantenerla en `.env.local`/secret manager, nunca en Git.

### 6. `.env.local` local en duplicado

Ruta observada:

- `/home/osmay/proyectos/note-dnd-character/.env.local`

No parece estar en Git, pero puede contener valores reales de Supabase/Nivel20.

Acción recomendada:

- No mostrar su contenido en logs.
- No commitearlo.
- Si alguna vez se subió por error, rotar claves.

## Checks útiles para continuar

Desde el repo:

```bash
cd /home/osmay/proyectos/note-dnd-character
```

Buscar llamadas antiguas:

```bash
grep -RInE 'for_user|p_user_id|userId' src scripts supabase --exclude-dir=node_modules
```

Buscar grants/revokes relevantes:

```bash
grep -nE 'grant execute on function public\..*_for_user|revoke execute on function public\..*_for_user|for_session|require_app_user_id' supabase/home_entities.sql
```

Buscar uso de MD5 en auth:

```bash
grep -n 'md5' supabase/custom_auth.sql
```

Verificar que no haya `.env` trackeados:

```bash
git ls-files | grep -E '(^|/)\.env'
```

## Prioridad recomendada

1. Alta: verificar en Supabase real que los permisos `*_for_user` están revocados.
2. Alta: migrar o retirar `scripts/import-nivel20-campaign.mjs` si depende de `*_for_user`.
3. Media: sustituir `md5` por SHA-256 para sesiones.
4. Media: mover token de sesión a cookie `HttpOnly`.
5. Baja: mantener `.env.local` fuera de Git y proteger `NIVEL20_SESSION_COOKIE`.
