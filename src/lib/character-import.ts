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
  const competencies = sectionBetween(text, "OTRAS COMPETENCIAS E IDIOMAS", "ATAQUES Y LANZAMIENTO DE CONJUROS");
  const attacks = sectionBetween(text, "ATAQUES Y LANZAMIENTO DE CONJUROS", "EQUIPO");
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
      },
      sections: {
        saving_throws: dedupeLineBreaks(savingThrowsChunk),
        skills: dedupeLineBreaks(skillsChunk),
        competencies: dedupeLineBreaks(competencies),
        attacks: dedupeLineBreaks(attacks),
      },
      spells_detected: [],
    },
  };
}
