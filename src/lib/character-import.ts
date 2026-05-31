type ParsedCharacter = {
  name: string;
  class_name: string;
  level: number | null;
  race: string;
  background: string;
  hp: number | null;
  ac: number | null;
  speed: number | null;
  notes: string;
  source_payload: Record<string, unknown>;
};

type AbilityBlock = {
  score: number | null;
  modifier: number | null;
};

type ParsedCheck = {
  name: string;
  bonus: string;
  proficient: boolean;
};

type ParsedAttack = {
  name: string;
  bonus: string;
  damage: string;
  damageType: string;
};

type ParsedTrait = {
  name: string;
  pdf_description: string;
  kind: string;
};

type ParsedEquipment = {
  name: string;
  detail: string;
  kind: string;
  quick_use: string;
};

const savingThrowNames = ["Fuerza", "Destreza", "Constitución", "Inteligencia", "Sabiduría", "Carisma"];

const skillNames = [
  "Acrobacias",
  "Arcanos",
  "Atletismo",
  "Engañar",
  "Historia",
  "Interpretación",
  "Intimidar",
  "Investigación",
  "Juego de Manos",
  "Medicina",
  "Naturaleza",
  "Percepción",
  "Perspicacia",
  "Persuasión",
  "Religión",
  "Sigilo",
  "Supervivencia",
  "Trato con Animales",
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/^[\-:;,./\s]+|[\-:;,./\s]+$/g, "")
    .trim();
}

function dedupeLineBreaks(value: string): string {
  const chunks = value
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  return Array.from(new Set(chunks)).join("\n");
}

function toInt(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
}

function findLineIndex(lines: string[], label: string): number {
  const target = normalizeSearch(label);
  return lines.findIndex((line) => normalizeSearch(line) === target);
}

function valueBeforeLabel(lines: string[], label: string): string {
  const idx = findLineIndex(lines, label);
  if (idx <= 0) return "";
  return cleanText(lines[idx - 1] ?? "");
}

function firstMatch(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function stripLabelNoise(value: string): string {
  let cleaned = cleanText(value);
  const separators = [
    "NOMBRE DEL PERSONAJE",
    "CLASE Y NIVEL",
    "TRASFONDO",
    "ESPECIE",
    "JUGADOR",
    "ALINEAMIENTO",
    "PUNTOS DE EXPERIENCIA",
  ];

  for (const label of separators) {
    const parts = cleaned.split(new RegExp(label, "i"));
    cleaned = cleanText(parts[parts.length - 1] ?? cleaned);
  }

  return cleaned;
}

function parseClassAndLevel(lines: string[], text: string): { className: string; level: number | null } {
  const fromLine = valueBeforeLabel(lines, "CLASE Y NIVEL");
  if (fromLine) {
    const match = fromLine.match(/^(.*?)(\d{1,2})$/);
    if (match) {
      return {
        className: stripLabelNoise(match[1]).replace(/\s+\d{1,2}$/, "").trim(),
        level: toInt(match[2]),
      };
    }
  }

  const inline = text.match(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]{2,60})\s+(\d{1,2})\s+CLASE Y NIVEL/i);
  if (inline) {
    const cleanedClass = stripLabelNoise(inline[1]).replace(/\s+\d{1,2}$/, "").trim();
    return {
      className: cleanedClass,
      level: toInt(inline[2]),
    };
  }

  return { className: "", level: null };
}

function parseBackground(lines: string[], text: string): string {
  const fromLine = valueBeforeLabel(lines, "TRASFONDO");
  if (fromLine && !/CLASE Y NIVEL|ESPECIE|JUGADOR/i.test(fromLine)) return fromLine;

  const strictBefore = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_'()\- ]{2,80})\s+TRASFONDO/i);
  if (strictBefore) {
    return stripLabelNoise(strictBefore);
  }

  const fallback = firstMatch(text, /TRASFONDO\s*[:\-]?\s*([^\n]+?)(?:\s+ESPECIE|\s+ALINEAMIENTO|\s+JUGADOR|$)/i);
  return stripLabelNoise(fallback);
}

function parseRace(lines: string[], text: string): string {
  const fromLine = valueBeforeLabel(lines, "ESPECIE");
  if (fromLine && !/CLASE Y NIVEL|TRASFONDO|JUGADOR|NOMBRE DEL PERSONAJE/i.test(fromLine)) return fromLine;

  const fromPlayerBlock = firstMatch(text, /JUGADOR\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]{2,40})\s+ESPECIE/i);
  if (fromPlayerBlock) return stripLabelNoise(fromPlayerBlock);

  const strictBefore = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_'()\- ]{2,80})\s+ESPECIE/i);
  if (strictBefore) {
    const fromJugador = strictBefore.split(/JUGADOR/i).pop() ?? strictBefore;
    return stripLabelNoise(fromJugador);
  }

  const fallback = firstMatch(text, /ESPECIE\s*[:\-]?\s*([^\n]+?)(?:\s+ALINEAMIENTO|\s+TRASFONDO|\s+JUGADOR|$)/i);
  return stripLabelNoise(fallback);
}

function parseAbility(lines: string[], text: string, label: string): AbilityBlock {
  const idx = findLineIndex(lines, label);
  if (idx !== -1) {
    const labelLine = lines[idx] ?? "";
    const mod = labelLine.match(/([+-]\d{1,2})/);
    const nextLine = lines[idx + 1] ?? "";
    const score = nextLine.match(/\b(\d{1,2})\b/);
    if (score || mod) {
      return {
        score: score ? Number(score[1]) : null,
        modifier: mod ? Number(mod[1]) : null,
      };
    }
  }

  const inText = new RegExp(`${label}\\s*([+-]?\\d{1,2})\\s*(\\d{1,2})`, "i");
  const match = text.match(inText);
  if (match) {
    return {
      score: Number(match[2]),
      modifier: Number(match[1]),
    };
  }

  return { score: null, modifier: null };
}

function parseAbilityMulti(lines: string[], text: string, labels: string[]): AbilityBlock {
  for (const label of labels) {
    const parsed = parseAbility(lines, text, label);
    if (parsed.score !== null || parsed.modifier !== null) return parsed;
  }
  return { score: null, modifier: null };
}

function parseAc(text: string): number | null {
  const blockMatch = text.match(/(\d{1,3})\s+CA\s*[+-]?\d{0,2}\s+INICIATIVA/i);
  if (blockMatch) return toInt(blockMatch[1]);
  const direct = text.match(/\bCA\s*(\d{1,3})\b/i);
  if (direct) return toInt(direct[1]);
  const before = text.match(/(\d{1,3})\s+CA\b/i);
  if (before) return toInt(before[1]);
  return null;
}

function parseHp(text: string): number | null {
  const max = text.match(/Puntos de Golpe M[aá]ximos\s*(\d{1,3})/i);
  if (max) return toInt(max[1]);
  const fallback = text.match(/\bHP\s*(\d{1,3})\b/i);
  return fallback ? toInt(fallback[1]) : null;
}

function parseSpeed(text: string): number | null {
  const around = text.match(/INICIATIVA\s*(\d{1,3})\s+VELOCIDAD\s*\(PIES\)\s*(\d{1,3})?/i);
  if (around?.[2]) return toInt(around[2]);
  const direct = text.match(/VELOCIDAD\s*\(PIES\)\s*(\d{1,3})/i);
  if (direct) return toInt(direct[1]);
  const before = text.match(/(\d{1,3})\s+VELOCIDAD\s*\(PIES\)/i);
  if (before) return toInt(before[1]);
  return null;
}

function sectionBetween(text: string, startLabel: string, endLabel: string): string {
  const upper = normalizeSearch(text);
  const start = upper.indexOf(normalizeSearch(startLabel));
  const end = upper.indexOf(normalizeSearch(endLabel));
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start + startLabel.length, end).trim();
}

function sectionAfter(text: string, startLabel: string, maxLength = 900): string {
  const upper = normalizeSearch(text);
  const start = upper.indexOf(normalizeSearch(startLabel));
  if (start === -1) return "";
  return text.slice(start + startLabel.length, start + startLabel.length + maxLength).trim();
}

function parseCheckEntries(text: string, names: string[]): ParsedCheck[] {
  return names.flatMap((name) => {
    const regex = new RegExp(`(?:^|\\s)([x\\s]{0,8})${escapeRegExp(name)}\\s+([+-]?\\d{1,2}|0)\\b`, "i");
    const match = text.match(regex);
    if (!match || !match[1].includes("")) return [];

    return [{
      name,
      bonus: match[2],
      proficient: /x/i.test(match[1]),
    }];
  });
}

function formatCheckEntries(entries: ParsedCheck[]): string {
  return entries.map((entry) => `${entry.proficient ? "x " : ""}${entry.name} ${entry.bonus}`).join("\n");
}

function parseAttackEntries(text: string): ParsedAttack[] {
  const chunk = sectionAfter(text, "NOMBRE BONIF. DAÑO/TIPO", 900);
  if (!chunk) return [];

  const attacks: ParsedAttack[] = [];
  const pattern = /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9()'….,\- ]{2,70}?)\s+([+-]\d{1,2})\s+(\d+d\d+(?:\s*\+\s*\d+)?)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ…]+)(?=\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9()'….,\- ]{2,70}?\s+[+-]\d{1,2}\s+\d+d\d+|\s*(?:EQUIPO|RASGOS|$))/gi;
  for (const match of chunk.matchAll(pattern)) {
    attacks.push({
      name: cleanText(match[1]),
      bonus: match[2],
      damage: cleanText(match[3]),
      damageType: cleanText(match[4]),
    });
  }

  return attacks;
}

function formatAttackEntries(entries: ParsedAttack[]): string {
  return entries.map((entry) => `${entry.name} ${entry.bonus} ${entry.damage} ${entry.damageType}`).join("\n");
}

function inferEquipmentKind(name: string, detail: string): string {
  const normalized = normalizeSearch(`${name} ${detail}`);
  if (normalized.includes("ESCUDO")) return "Escudo";
  if (/\b(CLAYMORE|DAGA|ARMA|ESPADA|MARTILLO|LANZA|ARCO)\b/.test(normalized)) return "Arma";
  if (normalized.includes("SIMBOLO SAGRADO")) return "Foco";
  if (normalized.includes("PAQUETE")) return "Paquete";
  if (normalized.includes("DADOS") || normalized.includes("JUEGO")) return "Herramienta";
  if (normalized.includes("ROPA") || normalized.includes("ARMADURA")) return "Vestimenta";
  if (normalized.includes("CA")) return "Defensa";
  return "Objeto";
}

function inferEquipmentQuickUse(name: string, detail: string, kind: string): string {
  const normalized = normalizeSearch(`${name} ${detail}`);
  if (kind === "Escudo") return "Útil para defensa. Revisa si su bonificador de CA está activo o equipado.";
  if (kind === "Arma") return "Útil en combate. Revisa si aparece también en la sección de ataques.";
  if (kind === "Foco") return "Puede servir como foco para lanzar conjuros si tu clase lo permite.";
  if (kind === "Paquete") return "Conjunto de objetos de apoyo para exploración, descanso o roleo.";
  if (kind === "Herramienta") return "Útil en pruebas, roleo o escenas fuera de combate.";
  if (kind === "Vestimenta") return "Objeto principalmente narrativo o social salvo que indique defensa.";
  if (normalized.includes("CA")) return "Puede afectar a la defensa. Comprueba cuándo aplica ese valor de CA.";
  return "Objeto disponible en inventario. Añade notas manuales si necesitas un uso concreto.";
}

function parseEquipmentEntries(value: string): ParsedEquipment[] {
  const rawLines = value
    .replace(/\s+-\s+/g, "\n- ")
    .split(/\n+/)
    .map((line) => cleanText(line.replace(/^[-•]+\s*/, "")))
    .filter(Boolean)
    .filter((line) => !/^(EQUIPO|INSPIRACIÓN|INSPIRACION)$/i.test(line));

  const lines = rawLines.flatMap((line) => {
    const packageMatch = line.match(/^(Paquete de sacerdote)\s+(.{3,})$/i);
    if (packageMatch) return [packageMatch[1], packageMatch[2]];
    return [line];
  });

  const entries = new Map<string, ParsedEquipment>();
  for (const line of lines) {
    const detailMatch = line.match(/\b(CA\s*[+-]?\d{1,3}|\d+d\d+(?:\s*\+\s*\d+)?\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ…]+)\b/i);
    const detail = cleanText(detailMatch?.[1] ?? "");
    const name = cleanText(detail ? line.replace(detailMatch?.[0] ?? "", "") : line);
    if (!name) continue;

    const kind = inferEquipmentKind(name, detail);
    const key = normalizeSearch(`${name} ${detail}`);
    entries.set(key, {
      name,
      detail,
      kind,
      quick_use: inferEquipmentQuickUse(name, detail, kind),
    });
  }

  return Array.from(entries.values());
}

function formatEquipmentEntries(entries: ParsedEquipment[]): string {
  return entries.map((entry) => `${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`).join("\n");
}

function cleanTraitDescription(value: string): string {
  let cleaned = cleanText(value);
  const stopLabels = [
    "RASGOS Y ATRIBUTOS",
    "RASGOS DE PERSONALIDAD",
    "RASGOS",
    "APARIENCIA",
    "IDEALES",
    "VÍNCULOS",
    "VINCULOS",
    "DEFECTOS",
    "HISTORIA DEL PERSONAJE",
    "NOTAS ADICIONALES",
    "EQUIPO",
    "ATAQUES Y LANZAMIENTO DE CONJUROS",
  ];

  for (const label of stopLabels) {
    const idx = normalizeSearch(cleaned).indexOf(normalizeSearch(label));
    if (idx !== -1) cleaned = cleanText(cleaned.slice(0, idx));
  }

  if (/^[-:;,./\s]*$/.test(cleaned)) return "";
  return cleaned;
}

function parseTraitEntries(text: string): ParsedTrait[] {
  const entries = new Map<string, ParsedTrait>();
  const customTraitNames = new Set(
    Array.from(text.matchAll(/Rasgos personalizados:\s*([\s\S]*?)(?=\s+RASGOS|\s+RASGOS Y ATRIBUTOS|$)/gi))
      .flatMap((match) => match[1].split(/\s+-\s*/))
      .map((name) => cleanText(name))
      .filter(Boolean)
      .map((name) => normalizeSearch(name)),
  );
  const detailPattern = /\uf0da\s*([^:]{2,90}):\s*([\s\S]*?)(?=\s*\uf0da\s*[^:]{2,90}:|\s+RASGOS\b|\s+APARIENCIA\b|$)/g;

  for (const match of text.matchAll(detailPattern)) {
    const name = cleanText(match[1]);
    const description = cleanTraitDescription(match[2]);
    if (!name) continue;
    entries.set(normalizeSearch(name), {
      name,
      pdf_description: description,
      kind: customTraitNames.has(normalizeSearch(name)) ? "Rasgo personalizado" : "Rasgo",
    });
  }

  return Array.from(entries.values());
}

function formatTraitEntries(entries: ParsedTrait[]): string {
  return entries.map((entry) => `${entry.name}: ${entry.pdf_description}`).join("\n");
}

export function parseImportedCharacter(rawText: string): ParsedCharacter {
  const text = normalizeWhitespace(rawText);
  const lines = splitLines(rawText);

  const { className, level } = parseClassAndLevel(lines, text);
  const race = parseRace(lines, text);
  const background = parseBackground(lines, text);

  const name = cleanText(firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]{2,80})\s+NOMBRE DEL PERSONAJE/i)) || "Personaje importado";
  const player = cleanText(firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_\- ]+)\s+JUGADOR/i));
  const alignment = cleanText(firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+)\s+ALINEAMIENTO/i));
  const proficiency = firstMatch(text, /\+(\d+)\s+BONIFICADOR DE COMPETENCIA/i);
  const passivePerception = firstMatch(text, /(\d+)\s+SABIDUR[ÍI]A \(PERCEPCI[ÓO]N\) PASIVA/i);

  const abilities = {
    fuerza: parseAbilityMulti(lines, text, ["FUERZA"]),
    destreza: parseAbilityMulti(lines, text, ["DESTREZA"]),
    constitucion: parseAbilityMulti(lines, text, ["CONSTITUCIÓN", "CONSTITUCION"]),
    inteligencia: parseAbilityMulti(lines, text, ["INTELIGENCIA"]),
    sabiduria: parseAbilityMulti(lines, text, ["SABIDURÍA", "SABIDURIA"]),
    carisma: parseAbilityMulti(lines, text, ["CARISMA"]),
  };

  const savingThrowsChunk = sectionBetween(text, "TIRADAS DE SALVACIÓN", "HABILIDADES");
  const skillsChunk = sectionBetween(text, "HABILIDADES", "SABIDURÍA (PERCEPCIÓN) PASIVA");
  const checksChunk = skillsChunk || sectionBetween(text, "TIRADAS DE SALVACIÓN", "SABIDURÍA (PERCEPCIÓN) PASIVA");
  const parsedSavingThrows = parseCheckEntries(`${savingThrowsChunk}\n${checksChunk}`, savingThrowNames);
  const parsedSkills = parseCheckEntries(checksChunk, skillNames);
  const competencies = sectionBetween(text, "OTRAS COMPETENCIAS E IDIOMAS", "ATAQUES Y LANZAMIENTO DE CONJUROS");
  const equipment = sectionBetween(text, "ATAQUES Y LANZAMIENTO DE CONJUROS", "EQUIPO");
  const traits = sectionBetween(text, "EQUIPO", "RASGOS Y ATRIBUTOS");
  const parsedAttacks = parseAttackEntries(text);
  const parsedEquipment = parseEquipmentEntries(equipment);
  const parsedTraits = parseTraitEntries(text);
  const notes = sectionBetween(text, "NOTAS ADICIONALES", "HISTORIA DEL PERSONAJE") || "Importado desde PDF";

  return {
    name,
    class_name: className,
    level,
    race,
    background,
    hp: parseHp(text),
    ac: parseAc(text),
    speed: parseSpeed(text),
    notes: cleanText(notes),
    source_payload: {
      raw_text: rawText,
      summary: {
        player,
        alignment,
        proficiency_bonus: toInt(proficiency),
        passive_perception: toInt(passivePerception),
        abilities,
        saving_throws: parsedSavingThrows,
        skills: parsedSkills,
        attacks: parsedAttacks,
        equipment: parsedEquipment,
        traits: parsedTraits,
      },
      sections: {
        saving_throws: formatCheckEntries(parsedSavingThrows) || dedupeLineBreaks(savingThrowsChunk),
        skills: formatCheckEntries(parsedSkills) || dedupeLineBreaks(skillsChunk),
        competencies: dedupeLineBreaks(competencies),
        equipment: formatEquipmentEntries(parsedEquipment) || dedupeLineBreaks(equipment),
        attacks: formatAttackEntries(parsedAttacks),
        traits: formatTraitEntries(parsedTraits) || dedupeLineBreaks(traits),
      },
      spells_detected: [],
    },
  };
}
