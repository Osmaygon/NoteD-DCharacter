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

function dedupeLineBreaks(value: string): string {
  const chunks = value
    .split(/\n+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set(chunks)).join("\n");
}

function firstMatch(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function firstMatchGroups(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match) return [];
  return match.slice(1).map((v) => v.trim());
}

function sectionBetween(text: string, startLabel: string, endLabel: string): string {
  const start = text.toUpperCase().indexOf(startLabel.toUpperCase());
  const end = text.toUpperCase().indexOf(endLabel.toUpperCase());
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start + startLabel.length, end).trim();
}

function sectionByLabels(text: string, startLabel: string, endLabels: string[]): string {
  const upper = text.toUpperCase();
  const start = upper.indexOf(startLabel.toUpperCase());
  if (start === -1) return "";
  const from = start + startLabel.length;

  let minEnd = text.length;
  for (const label of endLabels) {
    const idx = upper.indexOf(label.toUpperCase(), from);
    if (idx !== -1 && idx < minEnd) minEnd = idx;
  }

  return text.slice(from, minEnd).trim();
}

function captureAfterLabel(text: string, label: string): string {
  const regex = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n]+)`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? "";
}

function extractBeforeLabel(text: string, label: string): string {
  const regex = new RegExp(`([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_()'\\- ]{2,80})\\s+${label}`, "i");
  const match = text.match(regex);
  return match?.[1]?.trim() ?? "";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\b\d+\b$/g, "").trim();
}

function listSpells(text: string): string[] {
  const chunk = sectionBetween(text, "PREP NIVEL NOMBRE", "©");
  if (!chunk) return [];
  const matches = chunk.match(/\b[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]{2,}\b/g) ?? [];
  const unique = Array.from(new Set(matches.map((m) => m.trim())));
  return unique.slice(0, 120);
}

function parseAbility(text: string, label: string): AbilityBlock {
  const upper = text.toUpperCase();
  const idx = upper.indexOf(label.toUpperCase());
  if (idx === -1) return { score: null, modifier: null };
  const slice = text.slice(idx, idx + 80);
  const nums = slice.match(/[-+]?\d+/g) ?? [];
  if (!nums.length) return { score: null, modifier: null };
  const modifier = Number(nums[0]);
  const score = nums.length > 1 ? Number(nums[1]) : null;
  return {
    score: Number.isFinite(score as number) ? (score as number) : null,
    modifier: Number.isFinite(modifier) ? modifier : null,
  };
}

function sectionAfter(text: string, startLabel: string): string {
  const start = text.toUpperCase().indexOf(startLabel.toUpperCase());
  if (start === -1) return "";
  return text.slice(start + startLabel.length).trim();
}

function toInt(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function extractSpeed(text: string): number | null {
  const afterLabel = firstMatch(text, /VELOCIDAD\s*\(PIES\)\s*(\d{1,3})/i);
  if (afterLabel) return toInt(afterLabel);

  const beforeLabel = firstMatch(text, /(\d{1,3})\s+VELOCIDAD\s*\(PIES\)/i);
  if (beforeLabel) return toInt(beforeLabel);

  const aroundInitiative = firstMatchGroups(
    text,
    /INICIATIVA\s*(\d{1,3})\s+VELOCIDAD\s*\(PIES\)\s*(\d{1,3})?/i,
  );
  if (aroundInitiative[1]) return toInt(aroundInitiative[1]);

  return null;
}

function extractAc(text: string): number | null {
  const direct = firstMatch(text, /\bCA\s*(\d{1,3})\b/i);
  if (direct) return toInt(direct);
  const around = firstMatchGroups(text, /CA\s*[-+]?\d*\s*(\d{1,3})/i);
  if (around[0]) return toInt(around[0]);
  return null;
}

function extractHp(text: string): number | null {
  const direct = firstMatch(text, /Puntos de Golpe M[aá]ximos\s*(\d{1,3})/i);
  if (direct) return toInt(direct);
  const fallback = firstMatch(text, /\bHP\s*(\d{1,3})/i);
  return toInt(fallback);
}

function extractClassAndLevel(text: string): { className: string; level: number | null } {
  const groups = firstMatchGroups(
    text,
    /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]{2,60})\s+(\d{1,2})\s+CLASE Y NIVEL/i,
  );
  if (groups.length >= 2) {
    return {
      className: cleanText(groups[0]),
      level: toInt(groups[1]),
    };
  }

  const near = firstMatch(text, /NOMBRE DEL PERSONAJE\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]+\s+\d{1,2})/i);
  if (near) {
    const m = near.match(/^(.*?)(\d{1,2})$/);
    return {
      className: cleanText(m?.[1] ?? ""),
      level: toInt(m?.[2] ?? ""),
    };
  }

  return { className: "", level: null };
}

function extractSpecies(text: string): string {
  const before = extractBeforeLabel(text, "ESPECIE");
  if (before) return cleanText(before);
  return cleanText(captureAfterLabel(text, "ESPECIE"));
}

function extractBackground(text: string): string {
  const before = extractBeforeLabel(text, "TRASFONDO");
  if (before) return cleanText(before);
  return cleanText(captureAfterLabel(text, "TRASFONDO"));
}

export function parseImportedCharacter(rawText: string): ParsedCharacter {
  const text = normalizeWhitespace(rawText);

  const name = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]{2,80})\s+NOMBRE DEL PERSONAJE/i);
  const { className, level } = extractClassAndLevel(text);
  const background = extractBackground(text);
  const race = extractSpecies(text);
  const hpValue = extractHp(text);
  const acValue = extractAc(text);
  const speedValue = extractSpeed(text);
  const player = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_\- ]+)\s+JUGADOR/i) || captureAfterLabel(text, "JUGADOR");
  const alignment = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+)\s+ALINEAMIENTO/i) || captureAfterLabel(text, "ALINEAMIENTO");
  const proficiency = firstMatch(text, /\+(\d+)\s+BONIFICADOR DE COMPETENCIA/i);
  const passivePerception = firstMatch(text, /(\d+)\s+SABIDUR[ÍI]A \(PERCEPCI[ÓO]N\) PASIVA/i);

  const competencies = sectionByLabels(text, "OTRAS COMPETENCIAS E IDIOMAS", ["ATAQUES Y LANZAMIENTO DE CONJUROS", "EQUIPO", "INSPIRACIÓN"]);
  const attacks = sectionByLabels(text, "ATAQUES Y LANZAMIENTO DE CONJUROS", ["RASGOS Y ATRIBUTOS", "EQUIPO", "RASGOS DE PERSONALIDAD"]);
  const traits = sectionByLabels(text, "RASGOS Y ATRIBUTOS", ["RASGOS DE PERSONALIDAD", "APARIENCIA", "RASGOS "]);
  const personality = sectionByLabels(text, "RASGOS DE PERSONALIDAD", ["IDEALES", "VÍNCULOS", "DEFECTOS"]);
  const ideals = sectionByLabels(text, "IDEALES", ["VÍNCULOS", "DEFECTOS", "APARIENCIA"]);
  const bonds = sectionByLabels(text, "VÍNCULOS", ["DEFECTOS", "APARIENCIA", "NOTAS ADICIONALES"]);
  const defects = sectionByLabels(text, "DEFECTOS", ["APARIENCIA", "NOTAS ADICIONALES", "HISTORIA DEL PERSONAJE"]);
  const appearance = sectionByLabels(text, "APARIENCIA", ["NOTAS ADICIONALES", "HISTORIA DEL PERSONAJE", "RASGOS"]);
  const additionalNotes = sectionByLabels(text, "NOTAS ADICIONALES", ["HISTORIA DEL PERSONAJE", "RASGOS", "ESPACIOS DE CONJURO"]);
  const story = sectionByLabels(text, "HISTORIA DEL PERSONAJE", ["RASGOS", "ESPACIOS DE CONJURO", "©"]);
  const spellChunk = sectionByLabels(text, "ESPACIOS DE CONJURO", ["©", "NIVEL20", "Tu plataforma"]);
  const fullTraits = sectionAfter(text, "RASGOS");

  const abilities = {
    fuerza: parseAbility(text, "FUERZA"),
    destreza: parseAbility(text, "DESTREZA"),
    constitucion: parseAbility(text, "CONSTITUCIÓN"),
    inteligencia: parseAbility(text, "INTELIGENCIA"),
    sabiduria: parseAbility(text, "SABIDURÍA"),
    carisma: parseAbility(text, "CARISMA"),
  };

  const savingThrowsChunk = sectionBetween(text, "TIRADAS DE SALVACIÓN", "HABILIDADES");
  const skillsChunk = sectionBetween(text, "HABILIDADES", "SABIDURÍA (PERCEPCIÓN) PASIVA");

  return {
    name: name || "Personaje importado",
    class_name: className,
    level,
    race,
    background,
    hp: hpValue,
    ac: acValue,
    speed: speedValue,
    notes: additionalNotes || "Importado desde PDF",
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
        traits: dedupeLineBreaks(traits),
        personality: dedupeLineBreaks(personality),
        ideals: dedupeLineBreaks(ideals),
        bonds: dedupeLineBreaks(bonds),
        defects: dedupeLineBreaks(defects),
        appearance: dedupeLineBreaks(appearance),
        additional_notes: dedupeLineBreaks(additionalNotes),
        story: dedupeLineBreaks(story),
        full_traits: dedupeLineBreaks(fullTraits),
        spell_chunk: dedupeLineBreaks(spellChunk),
      },
      spells_detected: Array.from(new Set(listSpells(text))),
    },
  };
}
