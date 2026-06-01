# NoteD&DCharacter

Aplicacion web para importar, consultar y usar fichas de personaje de D&D durante una partida. El objetivo actual es tener una ficha practica, visual y rapida, con importacion desde PDF y datos persistidos en Supabase.

## Estado Actual

- App en Next.js con TypeScript.
- Tema oscuro con acentos dorados.
- Autenticacion propia en base de datos, no Supabase Auth.
- Importacion de personajes desde PDF usando `pdfjs-dist`.
- Parser propio para extraer datos de hojas tipo Nivel20.
- Datos guardados en Supabase mediante RPCs.
- Los personajes pueden ocultarse por usuario sin borrarse de la BD.
- El estado de combate editable en partida se guarda por usuario para no pisar la vida de otras cuentas.
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
- El diseno debe acabar siendo comodo tambien en movil.

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

La UI actual muestra habilidades en tarjetas individuales, en escritorio con 3 columnas.

### Equipo

El equipo se debe mostrar como objetos desplegables, no como texto plano. La vista cerrada usa una descripcion corta; la descripcion completa aparece al abrir el objeto.

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

- PDF + parser propio es la fuente principal.
- Nivel20 se usa como referencia visual y puede investigarse como fuente futura.
- D&D Beyond puede investigarse como API/fuente futura.
- `dnd5eapi.co` solo se usa experimentalmente para rasgos, y solo si parece devolver espanol.
- No depender de scraping de Nivel20 o D&D Beyond sin aprobacion explicita.

Importante: si una API devuelve ingles, no mostrarlo al usuario. El usuario quiere la informacion en espanol.

### UI Actual De La Ficha

Archivo: `src/app/characters/[id]/page.tsx`.

Cabecera:

- Nombre.
- Clase + nivel.
- Especie + trasfondo.
- Botones `Guardar` y `Borrar`.

Pestanas:

- `Informacion`.
- `Combate`.

`Informacion`:

- Caracteristicas en 3 columnas y 2 filas.
- PP separado a la derecha de las caracteristicas en escritorio.
- Tiradas de salvacion horizontales.
- Habilidades horizontales.
- Historia y notas en bloques apilados.

`Combate`:

- Referencia rapida: CA, HP max, velocidad en pies/casillas, competencia.
- Durante la partida: HP actual y vida temporal uno al lado del otro desde `md`.
- Ataques y Equipo en bloques apilados.
- Rasgos, conjuros y trucos en bloques apilados; las descripciones de conjuros se muestran resumidas y se amplian al pulsarlas. En la pestaña Conjuros, los espacios por nivel se muestran a la derecha como bloques visibles.

### Estado Persistente Actual

Se guardan con `update_character_detail_for_user`:

- HP actual.
- Vida temporal.
- Datos basicos de personaje.

Se guarda con `update_character_source_payload_for_user`:

- Descripciones manuales de rasgos en `source_payload.manual_trait_descriptions`.

No se guardan todavia manualmente:

- Descripciones manuales de equipo.
- Clasificacion manual de acciones/conjuros/trucos.

### Archivos Clave

- `src/app/characters/[id]/page.tsx`: ficha visual, pestanas, contadores, desplegables.
- `src/app/characters/page.tsx`: lista/importacion de personajes; no tocar salvo pedido.
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
- No depender de APIs no oficiales sin confirmacion.

### Deuda Tecnica Concreta

- `shields` sigue existiendo en BD y tipos por iteracion anterior.
- `src/app/characters/page.tsx` puede tener cambios locales anteriores no relacionados; revisar antes de tocar.
- `supabase/.temp/` puede aparecer como no trackeado; no commitearlo.
- El parser sigue siendo heuristico y depende mucho del OCR del PDF.
- Los ataques pueden quedar truncados por OCR.
- Faltan tests del parser.
- Falta revision responsive completa en movil.

## URLs

- Supabase: `https://tu-proyecto.supabase.co`
- Produccion: `https://note-d-d-character.vercel.app`
- Repositorio: `https://github.com/Osmaygon/NoteD-DCharacter`

## Rutas Principales

- `/`: login y creacion de cuenta.
- `/dashboard`: pantalla principal tras iniciar sesion; los personajes visibles mostrados enlazan directamente a su ficha.
- `/characters`: lista de personajes visibles, personajes ocultos e importacion desde Nivel20/PDF.
- `/characters/[id]`: ficha del personaje.
- `/campaigns`: campanas.
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
- `app_characters`
- `app_character_members`
- `app_character_profiles`
- `app_character_user_state`

Campos relevantes de `app_character_profiles`:

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

RPCs relevantes:

- `import_character_from_payload`
- `get_character_detail_for_user`
- `update_character_detail_for_user`
- `update_character_source_payload_for_user`
- `delete_character_for_user`

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
- Equipo.
- Ataques reales.
- Rasgos y atributos.

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
- Historia y notas en bloques apilados.

El bloque de habilidades esta organizado para que en escritorio quede en 3 columnas.

### Combate

Contiene informacion util para usar durante pelea o roleo activo:

- Referencia rapida:
  - CA.
  - HP max.
  - Velocidad en pies y casillas.
  - Competencia.
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

Reglas actuales:

- `current_hp` no baja de `0`.
- `current_hp` no sube por encima de `hp` maximo.
- `temp_hp` no baja de `0`.
- Si otra cuenta tiene acceso al mismo personaje, sus contadores de vida son independientes.

`shields` existe en la base de datos por una iteracion anterior, pero se quito del visual. Hay que limpiarlo mas adelante si se confirma que no se va a usar.

## Tiradas Y Habilidades

- Se muestran como bloques individuales.
- Cada bloque muestra nombre y bonus; la competencia se marca con un fondo dorado sutil, sin texto repetido.
- No se muestran los iconos raros del PDF.
- El parser separa automaticamente salvaciones de habilidades.

## Equipo

El equipo se parsea como objetos individuales y se muestra como desplegable en 2 columnas desde escritorio, con descripcion corta cerrada y detalle completo al abrir.

Cada objeto puede tener:

- nombre.
- detalle detectado (`CA 2`, `1d4 perforante`, etc.).
- tipo estimado (`Escudo`, `Arma`, `Foco`, `Paquete`, `Herramienta`, `Vestimenta`, `Defensa`, `Objeto`).
- uso rapido en espanol.

Ejemplos:

- `Escudo centinela` con `CA 2`.
- `Simbolo Sagrado` como foco.
- `Paquete de sacerdote` separado del objeto suelto posterior.
- `Un escarabajo muerto del tamano de mi mano` como objeto independiente.

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

El plan es anadir mas adelante:

- `Conjuro`.
- `Truco`.

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

- Tema oscuro/dorado.
- Cabecera con nombre, clase/nivel, especie y trasfondo.
- `Guardar` y `Borrar` arriba.
- Titulo del header siempre navega al dashboard.
- Evitar textos de estado innecesarios tipo `Listo` o `Sesion iniciada`.
- Ficha pensada para escritorio ahora, pero debe quedar comoda en movil mas adelante.

Pendiente importante de movil:

- Revisar todos los bloques en pantalla pequena.
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
- Permitir descripcion manual tambien en equipo, si hace falta.
- Cachear respuestas de API en Supabase si se usa API de forma estable.
- Investigar D&D Beyond como posible API/fuente.
- Investigar Nivel20 como API/fuente, no solo como referencia visual.
- Mejorar la importacion para PDFs con OCR desordenado.
- Anadir tests unitarios del parser con texto real de ejemplo.
- Hacer una revision completa de responsive movil.
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
