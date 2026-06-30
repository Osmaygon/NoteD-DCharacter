# NoteD&DCharacter

Aplicacion web para importar, consultar y usar fichas de personaje de D&D durante una partida. El objetivo actual es tener una ficha practica, visual y rapida, con importacion desde Nivel20/PDF y datos persistidos en Supabase.

## Estado Actual

- App en Next.js con TypeScript.
- Tema oscuro con acentos dorados.
- Autenticacion propia en base de datos, no Supabase Auth.
- Importacion de personajes desde Nivel20 en modo solo lectura mediante `scripts/import-nivel20-campaign.mjs`.
- Importacion de personajes desde PDF usando `pdfjs-dist`.
- Parser propio para extraer datos de hojas tipo Nivel20/PDF.
- Datos guardados en Supabase mediante RPCs.
- Los personajes pueden ocultarse por usuario sin borrarse de la BD.
- El estado editable de partida se guarda por usuario para no pisar vida, vida temporal, espacios de conjuro ni munición de otras cuentas.
- Ficha reconstruida visualmente desde cero y dividida en pestañas.
- Commit y push inmediato despues de cada cambio funcional o visual para verlo en Vercel.

## Contexto Para PI/IA Que Continue El Proyecto

Esta seccion resume el contexto operativo para que una PI/IA futura pueda continuar sin perder decisiones ni repetir errores.

### Reglas De Conversacion Y Trabajo

- Responder siempre en espanol.
- El usuario quiere ver los cambios en Vercel, por eso cada cambio debe terminar con commit y push inmediato.
- Antes de grandes cambios visuales conviene confirmar la intencion, pero si el usuario dice `ejecuta`, implementar directamente.
- No tocar `/characters` salvo que el usuario lo pida explicitamente; el trabajo activo es la ficha `/characters/[id]`.
- No revertir cambios ajenos ni cambios no relacionados del worktree.
- Si se cambia SQL, aplicar `supabase db query --linked --file "supabase/home_entities.sql"` y commitear tambien el SQL.
- Para cambios de codigo ejecutar `npm run lint` y `npm run build` antes del commit.
- Para cambios solo de documentacion no hace falta `lint/build`.
- Mantener la ficha practica, no sobrecargarla de texto abierto por defecto.
- En móvil se conserva la colocación general pero se ocultan textos descriptivos largos para reducir ruido visual; si el bloque es desplegable, al pulsarlo se puede ver el texto completo.

### Objetivo Del Producto

La app debe servir para usar una ficha de D&D en partida real. No es solo un visor del PDF. La ficha debe separar claramente:

- Informacion estable del personaje.
- Herramientas de combate y roleo rapido.
- Datos editables durante la sesion.
- Texto largo cerrado por defecto y desplegable bajo demanda.

Referencia visual deseada: Nivel20, especialmente la ficha publica `https://nivel20.com/games/dnd-5/characters/1505343-gravity-claymore`.

### Datos De Ejemplo Del PDF Real

El personaje de referencia importado desde PDF tiene estos valores esperados:

- Nombre: `Gravity Claymore`.
- Clase: `Paladin` o `Paladin` con tilde si el PDF la trae acentuada; en la UI debe verse solo la clase, no el nombre del personaje ni etiquetas cercanas.
- Nivel: `7`.
- Especie: `Draconido`.
- Trasfondo: `Soldado (Sanador)`.
- Alineamiento: `Legal bueno`.
- CA: `19`.
- HP max: `60`.
- Velocidad: `30 pies`, `6 casillas`.
- Fuerza: `18`, modificador `+4`.
- Percepcion pasiva: `11`.

Fragmento importante del PDF:

```text
Paladin 7
CLASE Y NIVEL
Soldado (Sanador)
TRASFONDO
GravedadMolon
JUGADOR
Draconido
ESPECIE
Legal bueno
ALINEAMIENTO PUNTOS DE EXPERIENCIA
FUERZA +4
18
DESTREZA -1
8
CONSTITUCION +2
15
INTELIGENCIA 0
10
SABIDURIA +1
12
CARISMA +2
14
```

El parser debe evitar que `Clase`, `Especie` o `Trasfondo` capturen ruido como `Gravity Claymore NOMBRE DEL PERSONAJE`.

### Reglas Importantes Del PDF Nivel20

- Muchas etiquetas estan al final del bloque, no al principio.
- Si un bloque termina en `EQUIPO`, el contenido anterior es equipo.
- Si un bloque termina en `RASGOS Y ATRIBUTOS`, el contenido anterior son rasgos/atributos.
- `ATAQUES Y LANZAMIENTO DE CONJUROS` no siempre contiene los ataques reales; en este PDF muchas veces va antes del equipo.
- Los ataques reales estan bajo la tabla `NOMBRE BONIF. DANO/TIPO`, despues de `SALVACIONES DE MUERTE`.
- `11 SABIDURIA (PERCEPCION) PASIVA` significa PP `11`, no que `Trato con Animales` tenga `+1 11`.

### Tiradas De Salvacion Y Habilidades

El icono raro del PDF indica competencia:

- ` Inteligencia +2`: sin competencia.
- `x Sabiduria +6`: con competencia.
- `x Atletismo +7`: con competencia.

Las 6 salvaciones son:

- Fuerza.
- Destreza.
- Constitucion.
- Inteligencia.
- Sabiduria.
- Carisma.

Todo lo demas de esa lista son habilidades.

La UI actual muestra habilidades en tarjetas individuales, en móvil con 2 columnas y en escritorio con 3 columnas.

### Equipo

El equipo se debe mostrar como objetos desplegables, no como texto plano. La vista cerrada no debe mostrar descripciones por defecto; el detalle real aparece solo al abrir el objeto.

El parser debe separar casos como:

```text
- Paquete de sacerdote
Un escarabajo muerto del tamano de mi mano
EQUIPO
```

Resultado esperado:

- `Paquete de sacerdote`.
- `Un escarabajo muerto del tamano de mi mano`.

Cada objeto de equipo puede tener:

- `name`.
- `detail`.
- `kind`.
- `quick_use`.

De momento el `quick_use` se infiere por reglas simples, no por API.

### Ataques

Los ataques deben salir como tarjetas, no mezclados con equipo.

Ejemplos reales del PDF:

- `CasiClaymore +7 2d6 +4 cortante`.
- `El clavito +7 1d8 +4 contunden...`.
- `cuidado por la de... +7 1d6 +4 contunden...`.
- `Daga exotica (Tr...) +7 1d4 perforante`.

El OCR puede truncar textos con `...` o `…`; no asumir nombres perfectos.

### Rasgos, Conjuros Y Trucos

Regla de clasificacion: los `Conjuros de juramento`, `Conjuros de dominio` y `Conjuros de artillero` se tratan como conjuros siempre preparados, no como rasgos. No cuentan para el limite de preparados, pero si gastan espacios al lanzarse. Rasgos como `Canalizar Divinidad` siguen siendo rasgos de clase.

El bloque debe seguir siendo unico, pero cada elemento debe tener un identificador pequeno:

- `Rasgo`.
- `Rasgo personalizado`.
- Futuro: `Conjuro`.
- Futuro: `Truco`.
- Futuro: `Accion`.
- Futuro: `Accion adicional`.
- Futuro: `Reaccion`.

Los rasgos estan cerrados por defecto. Al abrir uno:

- Mostrar descripcion.
- Mostrar fuente.
- Mostrar boton `Editar descripcion`.
- El textarea de edicion manual debe estar oculto por defecto.

Prioridad de descripcion:

1. Manual (`source_payload.manual_trait_descriptions`).
2. PDF limpio.
3. API solo si devuelve texto en espanol.
4. `Sin descripcion disponible en espanol.`

No mostrar descripciones largas abiertas por defecto.

### API Y Fuentes Externas

El usuario ha sugerido usar Nivel20 y D&D Beyond mas adelante.

Decision actual:

- Nivel20 se usa como fuente de importacion en modo solo lectura y como referencia visual.
- PDF + parser propio sigue disponible como fuente alternativa.
- D&D Beyond puede investigarse como API/fuente futura.
- `dnd5eapi.co` solo se usa experimentalmente para rasgos, y solo si parece devolver espanol.
- No modificar datos remotos de Nivel20; la app solo lee/importa y guarda en Supabase.

Importante: si una API devuelve ingles, no mostrarlo al usuario. El usuario quiere la informacion en espanol.

### UI Actual De La Ficha

Archivo: `src/app/characters/[id]/page.tsx`.

Cabecera:

- Nombre.
- Clase + nivel visible también en móvil.
- Especie + trasfondo visible también en móvil.
- Botones `Guardar` y `Borrar`.

Pestanas:

- `Informacion`.
- `Combate`.

`Informacion`:

- Caracteristicas en 3 columnas y 2 filas.
- PP separado a la derecha de las caracteristicas en escritorio.
- Tiradas de salvacion horizontales.
- Habilidades horizontales.
- Historia importada desde Nivel20 en bloques apilados/desplegables con los mismos títulos del trasfondo (`Rasgos de personalidad`, `Ideales`, `Vínculos`, `Defectos`, `Historia del personaje`, etc.).

`Combate`:

- Bloque `Descansos` encima de combate, cerrado por defecto en una sola línea; al abrir muestra botones `Corto` y `Largo` con recordatorios específicos leídos de los rasgos/clase del personaje.
- Bloque `Estados` en combate para buscar estados del catálogo, aplicarlos/quitarles al personaje y modificar stats visibles como CA y velocidad.
- Referencia rapida: CA, HP max, velocidad en pies/casillas, competencia y CD de conjuros con característica debajo.
- Durante la partida: HP actual y vida temporal uno al lado del otro desde `md`.
- Munición opcional por usuario, visible/oculta según personaje, con bloques compactos ajustados a móvil: 1 columna en móvil y 3 columnas en pantallas; solo son editables al crearlos o al pulsar `Editar`; en modo normal solo muestran contador con `+`/`-`.
- Inventario equipable por usuario: permite añadir, editar, eliminar, equipar y desequipar armas, armaduras, escudos, herramientas y objetos. La munición se gestiona en su bloque propio. Arriba tiene cartera con cobre, plata, oro y platino, sin electrum; permite editar cantidades directas, sumar/restar un numero concreto y convertir 10:1 por boton. La CA visible se calcula desde la armadura/escudo equipados, DES según tipo de armadura y rasgos como Defensa.
- Rasgos, conjuros y trucos en bloques apilados; las descripciones de conjuros se muestran resumidas y se amplian al pulsarlas. Accion, alcance, duracion y componentes (`V`, `S`, `M`) van en la cabecera y el nivel queda al final de esa linea. En la pestaña Conjuros, los espacios por nivel se muestran debajo de preparados en una sola fila como nivel y cantidad disponible. En Combate, esos espacios se pueden marcar/desmarcar como gastados por nivel.

### Estado Persistente Actual

Los personajes importados funcionan como base compartida/default. Las ediciones hechas desde una cuenta se guardan como overrides por usuario en `app_character_user_state`, para que otra cuenta pueda usar el mismo personaje sin pisar esos cambios.

Se guardan con `update_character_detail_for_user`, por usuario:

- Datos basicos editados del personaje (`name`, `class_name`, `level`, `race`, `background`, `hp`, `ac`, `speed`, `notes`) en `profile_overrides`.
- HP actual.
- Vida temporal.

Se guarda por usuario en `app_character_user_state`:

- Espacios de conjuro gastados.
- Visibilidad y bloques de munición.
- Inventario/equipo equipado.

Se guarda con `update_character_source_payload_for_user`, por usuario:

- Preparados/favoritos/manuales y otros cambios de `source_payload` en `source_payload_overrides`, incluyendo `manual_trait_descriptions`.

No se guardan todavia manualmente:

- Descripciones manuales de equipo.
- Clasificacion manual de acciones/conjuros/trucos.

### Archivos Clave

- `src/app/characters/[id]/page.tsx`: ficha visual, pestanas, contadores, desplegables.
- `src/app/characters/page.tsx`: lista/importacion de personajes; no tocar salvo pedido.
- `src/app/campaigns/page.tsx`: campañas, diario compartido, bitácoras y permisos.
- `src/app/api/nivel20/import-campaign-journal/route.ts`: importación del diario de campaña desde Nivel20.
- `src/lib/nivel20.ts`: importación/normalización de Nivel20 para personajes y diario de campaña.
- `src/lib/character-import.ts`: parser principal del PDF.
- `src/lib/pdf-import.ts`: extraccion de texto del PDF.
- `src/lib/home-entities.ts`: cliente RPC de Supabase para campanas/personajes.
- `src/lib/custom-auth.ts`: auth propia.
- `src/components/app-header.tsx`: header compartido.
- `supabase/home_entities.sql`: tablas/RPCs de personajes/campanas.
- `supabase/custom_auth.sql`: tablas/RPCs de auth.

### Cosas Que No Debe Romper Una PI/IA

- No reintroducir `Escudos` en el visual; esta eliminado visualmente.
- No limpiar `shields` sin hacerlo completo en SQL, tipos, RPC y UI.
- No volver a mostrar `Competencias e idiomas` si esta vacio; se quito del visual.
- No mostrar informacion en ingles al usuario.
- No mezclar equipo con ataques.
- No mostrar el editor manual de rasgos por defecto.
- No tocar `/characters` si el usuario pide cambios de la ficha.
- En `/campaigns`, todos pueden leer el diario de una campaña si son miembros; solo `owner/admin/editor` editan.
- No depender de APIs no oficiales sin confirmacion.

### Deuda Tecnica Concreta

- `shields` sigue existiendo en BD y tipos por iteracion anterior.
- `src/app/characters/page.tsx` puede tener cambios locales anteriores no relacionados; revisar antes de tocar.
- `supabase/.temp/` puede aparecer como no trackeado; no commitearlo.
- El parser sigue siendo heuristico y depende mucho del OCR del PDF.
- Los ataques pueden quedar truncados por OCR.
- Faltan tests del parser.
- Falta revision responsive completa en movil.
- La importación de diario Nivel20 parsea HTML de `/log`; si Nivel20 cambia su marcado, puede requerir ajuste.

## URLs

- Supabase: configurar con `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` / Vercel
- Produccion: `https://note-d-d-character.vercel.app`
- Repositorio: `https://github.com/Osmaygon/NoteD-DCharacter`

## Rutas Principales

- `/`: login y creacion de cuenta.
- `/dashboard`: pantalla principal tras iniciar sesion; los personajes visibles mostrados enlazan directamente a su ficha.
- `/characters`: lista de personajes visibles, personajes ocultos e importacion desde Nivel20/PDF.
- `/characters/[id]`: ficha del personaje.
- `/campaigns`: biblioteca/listado de campanas.
- `/campaigns/[id]`: interior de una campaña, con historia, bitácoras por sesión, edición/borrado y permisos.
- `/user`: usuario.
- `/reset-password`: pantalla placeholder.

## Autenticacion

- Se usa autenticacion propia con tablas `app_users` y `app_sessions`.
- Las contrasenas se guardan hasheadas en BD usando `pgcrypto`.
- La sesion se gestiona desde las funciones de `src/lib/custom-auth.ts`.
- SQL base en `supabase/custom_auth.sql`.

## Base De Datos

SQL principal:

- `supabase/custom_auth.sql`: usuarios, sesiones y RPCs de auth.
- `supabase/home_entities.sql`: campanas, personajes, perfiles, miembros y RPCs.

Tablas principales:

- `app_campaigns`
- `app_campaign_members`
- `app_campaign_journal_entries`
- `app_characters`
- `app_character_members`
- `app_character_profiles`
- `app_character_user_state`
- `app_status_effects`
- `app_character_active_statuses`

Campos relevantes de `app_character_profiles` como base compartida/default:

- `class_name`
- `level`
- `race`
- `background`
- `hp`
- `current_hp`
- `temp_hp`
- `shields` (pendiente de limpiar si se confirma que no se usa)
- `ac`
- `speed`
- `notes`
- `source_payload`

Campos relevantes de `app_character_user_state` como estado/overrides por cuenta:

- `current_hp`
- `temp_hp`
- `spell_slots_spent`
- `ammunition`
- `inventory`
- `profile_overrides`
- `source_payload_overrides`

Tablas de estados:

- `app_status_effects`: catálogo por defecto con condiciones y efectos buscables (`Cegado`, `Acelerado`, `Escudo de fe`, etc.), con fuente y reglas JSON.
- `app_character_active_statuses`: estados activos por personaje/cuenta.

RPCs relevantes:

- `import_character_from_payload`
- `get_character_detail_for_user`
- `update_character_detail_for_user`
- `update_character_source_payload_for_user`
- `update_character_spell_slots_for_user`
- `update_character_ammunition_for_user`
- `update_character_inventory_for_user`
- `sync_character_base_from_payload`
- `get_campaign_detail_for_user`
- `update_campaign_story_for_user`
- `list_campaign_members_for_user`
- `set_campaign_member_role_for_user`
- `list_campaign_journal_entries_for_user`
- `upsert_campaign_journal_entry_for_user`
- `delete_campaign_journal_entry_for_user`
- `search_status_effects`
- `list_active_status_effects_for_character`
- `set_character_status_effect_active`
- `delete_character_for_user`

## Diario De Campaña

La ruta `/campaigns` es el listado de campañas y `/campaigns/[id]` funciona como diario compartido estilo Nivel20:

- Desde el listado se entra a una campaña concreta; las bitácoras viven dentro de esa campaña, no en el listado general.
- Cada campaña tiene nombre editable e historia general (`app_campaigns.description`).
- Cada partida/sesión se guarda como bitácora en `app_campaign_journal_entries`.
- Cada bitácora tiene `title`, `session_date` y `blocks` en JSONB.
- Cada bloque tiene `title` y `content`, para poder separar escenas, resumen, botín, NPCs, pistas, etc.
- Todos los miembros de la campaña pueden leer el diario.
- Solo pueden editar `owner`, `admin` y `editor`.
- El creador de la campaña queda como `owner`; para el caso actual, la cuenta de Osmaygon debe crear/importar Reino de Chatelenz y queda como admin/propietario.
- `owner` y `admin` pueden cambiar permisos de otros miembros entre `Lector`, `Editor` y `Admin`. El propietario no se puede degradar desde la UI/RPC.
- El propietario puede borrar la campaña completa; editores/admins pueden crear, editar y borrar bitácoras.
- La importación desde Nivel20 usa `/games/dnd-5/campaigns/110040-reino-de-chatelenz/log` por defecto y guarda el resultado en la campaña seleccionada o crea/localiza una campaña por nombre/ruta.
- Nivel20 se mantiene como solo lectura: se importa hacia Supabase, no se escribe de vuelta en Nivel20.

## Importacion Nivel20

El flujo actual de campaña es:

1. El script `npm run import:nivel20 -- --user <app_user_id>` lee la campaña configurada de Nivel20.
2. Nivel20 se trata como fuente de solo lectura.
3. El parser clasifica datos, rasgos, equipo, historia y conjuros.
4. Si el personaje no existe, se crea con esos datos como base/default.
5. Si el personaje ya existe, se actualiza solo la base importada con `sync_character_base_from_payload`; no se pisan overrides ni estado guardado desde la web.
6. La visibilidad posterior se gestiona por usuario desde `app_character_members.is_visible`.

Reglas actuales:

- No se escriben cambios en Nivel20.
- Reimportar desde Nivel20 no borra ni sobrescribe estado de la web por usuario: HP actual, vida temporal, espacios gastados, munición/flechas, inventario equipado, equipo añadido, estados activos, notas manuales y cartera/dinero.
- Los bloques `Conjuros de juramento`, `Conjuros de dominio` y `Conjuros de artillero` se importan como conjuros siempre preparados.
- La historia de Nivel20 se conserva en secciones desplegables dentro de `Informacion`.

## Importacion PDF

El flujo actual es:

1. El usuario sube un PDF desde `/characters`.
2. `src/lib/pdf-import.ts` extrae texto por paginas con `pdfjs-dist`.
3. `src/lib/character-import.ts` parsea el texto.
4. Se guarda el personaje con `importCharacterFromPayload`.
5. La ficha reparsa `raw_text` al abrir para refrescar datos antiguos.

Datos que se intentan extraer:

- Nombre.
- Clase.
- Nivel.
- Especie.
- Trasfondo.
- CA.
- HP maximo.
- Velocidad.
- Caracteristicas y modificadores.
- Percepcion pasiva.
- Tiradas de salvacion.
- Habilidades.
- Competencias e idiomas.
- Equipo.
- Ataques reales.
- Rasgos y atributos.
- Historia, apariencia, notas adicionales, rasgos de personalidad, ideales, vinculos y defectos cuando el PDF trae esos bloques.

### Mapeo Interno Del PDF

El parser de PDF debe colocar los datos en las mismas claves que usa la ficha al leer datos de Nivel20. No se debe cambiar la UI para mostrar campos nuevos; la UI ya consume estas rutas:

- Datos base del perfil: `name`, `class_name`, `level`, `race`, `background`, `hp`, `ac`, `speed`, `notes`.
- Texto original del PDF: `source_payload.raw_text` y, si aplica, paginas en `source_payload.pages`.
- Metadatos de origen: `source_payload.external_source = "pdf"` e `source_payload.imported_at`.
- Resumen visual de ficha: `source_payload.summary`.
  - `summary.abilities`: `fuerza`, `destreza`, `constitucion`, `inteligencia`, `sabiduria`, `carisma` con `score` y `modifier`.
  - `summary.saving_throws`: array de `{ name, bonus, proficient }`.
  - `summary.skills`: array de `{ name, bonus, proficient }`.
  - `summary.attacks`: tarjetas de ataque `{ name, bonus, damage, damageType }`.
  - `summary.equipment`: inventario base `{ name, detail, kind, quick_use }`.
  - `summary.traits`: rasgos `{ name, pdf_description, kind }`.
  - `summary.spells` y `summary.spell_meta`: estructura compatible con Nivel20, aunque el PDF todavia no extraiga conjuros completos.
- Secciones de respaldo: `source_payload.sections` para texto plano formateado si una lista estructurada no se pudo construir.
- Estructura compatible con Nivel20: `source_payload.raw`.
  - `raw.info`: nombre, raza, nivel, clase+nivel, velocidad, jugador, HP y competencia.
  - `raw.armor.normal`: CA.
  - `raw.ability`: claves cortas `fue`, `des`, `con`, `int`, `sab`, `car`.
  - `raw.saving_throws` y `raw.skills`: total numerico y competencia en formato Nivel20.
  - `raw.attacks`: ataques en formato `attack.to_hit.value` y `attack.damage`.
  - `raw.items.Equipo`: equipo del PDF como items.
  - `raw.professions[].feats`: rasgos del PDF para que los recordatorios de descansos y busquedas internas puedan encontrarlos.
  - `raw.background`: trasfondo, rasgos de personalidad, ideales, vinculos, defectos y rasgo de trasfondo si existe.
  - `raw.fields`: historia, apariencia, alineamiento, edad, idiomas, notas y percepcion pasiva.
  - `raw.spell_books`: reservado para que el PDF pueda acabar usando el mismo formato de conjuros que Nivel20.

## Parser Actual

Archivo principal: `src/lib/character-import.ts`.

Reglas importantes:

- Muchas etiquetas del PDF aparecen al final del bloque, no al principio.
- `EQUIPO` marca que el texto anterior pertenece a equipo.
- `RASGOS Y ATRIBUTOS` marca que el texto anterior pertenece a rasgos.
- Los ataques reales se extraen desde la tabla `NOMBRE BONIF. DANO/TIPO`.
- Las tiradas/habilidades detectan competencia si aparece `x` cerca del icono ``.
- `11 SABIDURIA (PERCEPCION) PASIVA` se interpreta como percepcion pasiva, no como bonus de habilidad.

Interpretacion de competencia:

- ` Inteligencia +2`: sin competencia.
- `x Sabiduria +6`: con competencia.
- `x Atletismo +7`: con competencia.

## Ficha De Personaje

Archivo principal: `src/app/characters/[id]/page.tsx`.

La ficha esta dividida en dos pestanas:

- `Informacion`
- `Combate`

### Informacion

Contiene datos de consulta del personaje:

- Caracteristicas (`FUE`, `DES`, `CON`, `INT`, `SAB`, `CAR`) en 3 columnas y 2 filas.
- `PP` como percepcion pasiva, separado a la derecha en escritorio.
- Tiradas de salvacion en tarjetas individuales.
- Habilidades en tarjetas individuales.
- Historia importada desde Nivel20 en bloques apilados/desplegables con los mismos títulos del trasfondo (`Rasgos de personalidad`, `Ideales`, `Vínculos`, `Defectos`, `Historia del personaje`, etc.).

El bloque de habilidades esta organizado para que en móvil quede en 2 columnas y en escritorio en 3 columnas.

### Combate

Contiene informacion util para usar durante pelea o roleo activo:

- Descansos:
  - Bloque desplegable cerrado por defecto.
  - `Descanso corto`: aplica recuperaciones automáticas cuando no hay elección pendiente, como espacios de brujo por Magia del pacto; muestra recordatorios para dados de golpe, Recuperación arcana, Ki, Canalizar Divinidad, Forma salvaje, Inspiración bárdica, etc.
  - `Descanso largo`: deja HP al máximo, vida temporal a 0 y recupera espacios de conjuro gastados; además recuerda recursos por personaje como Imponer las manos, conjuros raciales, Destello de Genio o Cañón Sobrenatural.
- Estados:
  - Catálogo en BD con condiciones oficiales 5e 2014 y efectos comunes usados en Nivel20/libros compatibles (`Tasha`, `Eberron`), ampliado con conjuros que aplican estados como `Dormir`, `Inmovilizar`, `Telaraña`, `Miedo`, `Patrón hipnótico`, `Destierro`, castigos de paladín y estados genéricos.
  - Buscador en combate para aplicar/quitar estados; no muestra sugerencias iniciales, solo coincidencias cuando se escribe una búsqueda.
  - Reglas JSON aplican modificadores visibles: CA, velocidad, dados a ataques/salvaciones y recordatorios de ventaja/desventaja/resistencias.
- Referencia rapida:
  - CA.
  - HP max.
  - Velocidad en pies y casillas.
  - Competencia.
  - CD de salvacion de conjuros con caracteristica de lanzamiento debajo.
- Durante la partida:
  - HP actual con contador.
  - Vida temporal con contador.
- Ataques.
- Equipo.
- Rasgos, conjuros y trucos.

Regla de velocidad:

- `5 pies = 1 casilla`.
- Ejemplo: `30 pies = 6 casillas`.

## Contadores Persistentes

Se guardan en base de datos al pulsar `Guardar`, por usuario en `app_character_user_state`:

- `current_hp`: HP actual.
- `temp_hp`: vida temporal.
- `spell_slots_spent`: espacios de conjuro gastados por nivel; se limpian con descanso largo y con descanso corto en personajes de Magia del pacto.
- `ammunition`: visibilidad y bloques editables de munición.
- `inventory`: inventario equipable editable por usuario/personaje.
- Estados activos: se guardan en `app_character_active_statuses` y se aplican a la ficha de esa cuenta/personaje.

Reglas actuales:

- `current_hp` no baja de `0`.
- `current_hp` no sube por encima de `hp` maximo.
- `temp_hp` no baja de `0`.
- Si otra cuenta tiene acceso al mismo personaje, sus contadores de vida, espacios gastados, munición, inventario equipado, datos básicos editados y cambios de `source_payload` son independientes.

`shields` existe en la base de datos por una iteracion anterior, pero se quito del visual. Hay que limpiarlo mas adelante si se confirma que no se va a usar.

## Tiradas Y Habilidades

- Se muestran como bloques individuales.
- Cada bloque muestra nombre y bonus; la competencia se marca con un fondo dorado sutil, sin texto repetido.
- No se muestran los iconos raros del PDF.
- El parser separa automaticamente salvaciones de habilidades.

## Inventario Y Equipo

El equipo importado se transforma en inventario por usuario. Se muestra como desplegable en 2 columnas desde escritorio, sin descripcion visible por defecto y con detalle completo al abrir si existe.

Cada objeto puede tener:

- nombre.
- tipo (`Arma`, `Armadura`, `Escudo`, `Herramienta`, `Objeto`).
- cantidad.
- detalle detectado (`CA 2`, `1d4 perforante`, etc.).
- daño/uso si es arma.
- CA base, máximo de DES y bonus de CA si afecta a defensa.
- estado `equipado`.
- resumen visible de sus características principales (`CA`, `DES máx`, bonus de escudo o daño) que cambia inmediatamente al editar.

Reglas actuales:

- Solo una armadura y un escudo quedan equipados a la vez.
- La CA se calcula desde el inventario: armadura equipada o base `10 + DES`, escudo equipado y bonificadores detectados como estilo `Defensa`.
- Reglas de DES en armadura: ligera suma DES completo, media suma DES máximo +2 y pesada no suma DES ni positiva ni negativa (`Máx. DES = 0`).
- Monje sin armadura usa `10 + DES + SAB`; bárbaro sin armadura usa `10 + DES + CON`.
- Se pueden añadir objetos manuales desde el bloque de inventario.
- Los valores editables del inventario se respetan como fuente visible; las correcciones de datos antiguos solo aplican si el campo no fue editado manualmente.

Ejemplos:

- `Protecsao` se trata como armadura laminada: CA 17 sin DES; si se edita manualmente, el valor guardado por usuario manda. Para Gravity se suma el estilo `Defensa +1` al llevar armadura equipada.
- `Escudo centinela` como escudo con bonus de CA.
- `Escudo del juramento implacable` se trata como escudo +1.
- `Cuero tachonado`, `Cota de escamas`, `Cota de malla`, etc. como armaduras con fórmula de CA.
- `Simbolo Sagrado` como objeto/foco.
- `Paquete de sacerdote` separado del objeto suelto posterior.

## Ataques

Los ataques reales se extraen de la zona bajo `NOMBRE BONIF. DANO/TIPO`, no del bloque que termina en `EQUIPO`.

Ejemplos esperados:

- `CasiClaymore +7 2d6 +4 cortante`.
- `El clavito +7 1d8 +4 contundente`.
- `Daga exotica +7 1d4 perforante`.

## Rasgos, Conjuros Y Trucos

El bloque es unico, pero cada entrada tiene una etiqueta pequena de tipo.

Tipos actuales:

- `Rasgo`.
- `Rasgo personalizado`.
- `Conjuro`.
- `Truco`.
- Origenes automaticos como `Por juramento`, `Por dominio` o `Por artillero`.

Los conjuros otorgados automaticamente por subclase/dominio/juramento se muestran en `Conjuros` con su origen, no en `Rasgos`, no cuentan para el limite de preparados y siguen gastando espacios al lanzarse.

Los rasgos se muestran cerrados por defecto. Al pulsar se despliega la descripcion.

Prioridad de descripcion:

1. Descripcion manual guardada.
2. Descripcion limpia del PDF.
3. API si devuelve texto en espanol.
4. `Sin descripcion disponible en espanol.`

El editor manual esta oculto por defecto. Al abrir un rasgo se muestra un boton `Editar descripcion`; al pulsarlo aparece el textarea y el boton de guardar.

Las descripciones manuales se guardan en `source_payload.manual_trait_descriptions` mediante `update_character_source_payload_for_user`.

## API Externa

Decision actual:

- No depender de una API externa como fuente principal de la ficha.
- El PDF y el parser propio son la fuente principal.
- API externa solo como ayuda para ampliar descripciones.

APIs consideradas para mas adelante:

- Nivel20: buena referencia visual y posible fuente futura si hay API usable.
- D&D Beyond: se quiere investigar como posible API/fuente futura.
- `dnd5eapi.co`: API abierta usada experimentalmente para rasgos, pero solo si devuelve texto en espanol.
- Open5e: posible alternativa futura.

Nota importante:

- Si D&D Beyond o Nivel20 no tienen API oficial/documentada, no se debe depender de scraping sin decidirlo explicitamente.

## Diseno Y UX

Decisiones actuales:

- Tema oscuro/dorado con fondo global fijo para evitar cortes de gradiente al hacer scroll.
- Cabecera con nombre, clase/nivel, especie y trasfondo.
- `Guardar` y `Borrar` arriba.
- Titulo del header siempre navega al dashboard.
- Evitar textos de estado innecesarios tipo `Listo` o `Sesion iniciada`.
- Ficha ya ajustada para movil: mantiene la estructura general, reduce texto visible y permite expandir bloques para consultar descripciones.

Criterio de móvil:

- Mantener la colocación general siempre que sea posible.
- Ocultar textos descriptivos largos (`mobile-detail`) para que la ficha sea más rápida, manteniendo acceso al texto completo al desplegar el bloque cuando aplique.
- Botones `+` y `-` suficientemente grandes.
- Evitar scroll horizontal.
- Reorganizar tarjetas para lectura rapida en partida.

## Pendientes Futuras

- Limpiar `shields` de base de datos, RPCs, tipos y estado si definitivamente no se usa.
- Revisar `/characters`; hubo cambios visuales temporales anteriores que pueden necesitar limpieza si no forman parte del flujo final.
- Mejorar parser de `Equipo` para mas casos donde varios objetos vienen en una misma linea.
- Mejorar parser de ataques truncados por OCR (`contunden…`, nombres cortados, etc.).
- Parsear conjuros y trucos como elementos separados.
- Diferenciar `Rasgo`, `Rasgo personalizado`, `Conjuro`, `Truco`, `Accion`, `Accion adicional` y `Reaccion`.
- Mejorar más el inventario con categorías especiales, peso y consumibles si hace falta.
- Cachear respuestas de API en Supabase si se usa API de forma estable.
- Investigar D&D Beyond como posible API/fuente.
- Investigar Nivel20 como API/fuente, no solo como referencia visual.
- Mejorar la importacion para PDFs con OCR desordenado.
- Anadir tests unitarios del parser con texto real de ejemplo.
- Seguir refinando responsive movil con casos reales de partida.
- Limpiar codigo muerto cuando el flujo quede cerrado.

## Comandos De Desarrollo

Instalar dependencias:

```bash
npm install
```

Ejecutar en local:

```bash
npm run dev
```

Validar lint:

```bash
npm run lint
```

Validar build:

```bash
npm run build
```

Aplicar SQL enlazado a Supabase:

```bash
supabase db query --linked --file "supabase/home_entities.sql"
```

## Configuracion

1. Copia `.env.example` a `.env.local`.
2. Rellena tus variables de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_publica_de_supabase
NIVEL20_BASE_URL=https://nivel20.com
NIVEL20_CAMPAIGN_PATH=/games/dnd-5/campaigns/ID-slug-de-tu-campana
NIVEL20_SESSION_COOKIE=pega_aqui_tu_cookie_de_nivel20
```

3. Ejecuta en Supabase SQL Editor el archivo `supabase/custom_auth.sql`.
4. Ejecuta en Supabase SQL Editor el archivo `supabase/home_entities.sql`.
5. En `Authentication > URL Configuration` agrega:
   - `http://localhost:3000/**`
   - `https://note-d-d-character.vercel.app/**`
   - `Site URL`: `https://note-d-d-character.vercel.app`
6. Ejecuta la app:

```bash
npm install
npm run dev
```

## Flujo De Trabajo Acordado

- Cada cambio se valida con `npm run lint` y `npm run build` cuando aplica.
- Cada cambio se commitea y se pushea inmediatamente para verlo en Vercel.
- No tocar cambios no relacionados del worktree.
- Mantener conversacion en espanol.

## Enlaces del proyecto

- GitHub: https://github.com/Osmaygon/NoteD-DCharacter
- Vercel: https://note-d-d-character.vercel.app
- Deploy automático: Vercel está conectado al repositorio de GitHub.
