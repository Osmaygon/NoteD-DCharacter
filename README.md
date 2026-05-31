# NoteD&DCharacter

Aplicacion web para importar, consultar y usar fichas de personaje de D&D durante una partida. El objetivo actual es tener una ficha practica, visual y rapida, con importacion desde PDF y datos persistidos en Supabase.

## Estado Actual

- App en Next.js con TypeScript.
- Tema oscuro con acentos dorados.
- Autenticacion propia en base de datos, no Supabase Auth.
- Importacion de personajes desde PDF usando `pdfjs-dist`.
- Parser propio para extraer datos de hojas tipo Nivel20.
- Datos guardados en Supabase mediante RPCs.
- Ficha reconstruida visualmente desde cero y dividida en pestañas.
- Commit y push inmediato despues de cada cambio funcional o visual para verlo en Vercel.

## URLs

- Supabase: `https://tu-proyecto.supabase.co`
- Produccion: `https://note-d-d-character.vercel.app`
- Repositorio: `https://github.com/Osmaygon/NoteD-DCharacter`

## Rutas Principales

- `/`: login y creacion de cuenta.
- `/dashboard`: pantalla principal tras iniciar sesion.
- `/characters`: lista e importacion de personajes.
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

- Caracteristicas (`FUE`, `DES`, `CON`, `INT`, `SAB`, `CAR`).
- `PP` como percepcion pasiva.
- Tiradas de salvacion en tarjetas individuales.
- Habilidades en tarjetas individuales.
- Historia y notas.

El bloque de habilidades esta organizado para que en escritorio quede en filas de 4 y la ultima fila de 2 quede centrada.

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

Se guardan en base de datos al pulsar `Guardar`:

- `current_hp`: HP actual.
- `temp_hp`: vida temporal.

Reglas actuales:

- `current_hp` no baja de `0`.
- `current_hp` no sube por encima de `hp` maximo.
- `temp_hp` no baja de `0`.

`shields` existe en la base de datos por una iteracion anterior, pero se quito del visual. Hay que limpiarlo mas adelante si se confirma que no se va a usar.

## Tiradas Y Habilidades

- Se muestran como bloques individuales.
- Cada bloque muestra nombre, bonus y si tiene competencia.
- No se muestran los iconos raros del PDF.
- El parser separa automaticamente salvaciones de habilidades.

## Equipo

El equipo se parsea como objetos individuales y se muestra como desplegable.

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
