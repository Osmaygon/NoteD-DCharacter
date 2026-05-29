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
  return value.replace(/\r/g, "").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

function firstMatch(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function sectionBetween(text: string, startLabel: string, endLabel: string): string {
  const start = text.toUpperCase().indexOf(startLabel.toUpperCase());
  const end = text.toUpperCase().indexOf(endLabel.toUpperCase());
  if (start === -1 || end === -1 || end <= start) return "";
  return text.slice(start + startLabel.length, end).trim();
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

export function parseImportedCharacter(rawText: string): ParsedCharacter {
  const text = normalizeWhitespace(rawText);

  const name = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]+)\s+NOMBRE DEL PERSONAJE/i);
  const classAndLevel = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]+\s+\d+)\s+CLASE Y NIVEL/i);
  const background = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ()'\- ]+)\s+TRASFONDO/i);
  const race = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ'\- ]+)\s+ESPECIE/i);
  const hpText = firstMatch(text, /Puntos de Golpe M[aá]ximos\s*(\d+)/i);
  const acText = firstMatch(text, /\bCA\s*[-+]?\d*\s*(\d{1,3})/i);
  const speedText = firstMatch(text, /INICIATIVA\s*\d+\s*VELOCIDAD\s*\(PIES\)\s*(\d+)/i);
  const player = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_\- ]+)\s+JUGADOR/i);
  const alignment = firstMatch(text, /([A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+)\s+ALINEAMIENTO/i);
  const proficiency = firstMatch(text, /\+(\d+)\s+BONIFICADOR DE COMPETENCIA/i);
  const passivePerception = firstMatch(text, /(\d+)\s+SABIDUR[ÍI]A \(PERCEPCI[ÓO]N\) PASIVA/i);

  const competencies = sectionBetween(text, "OTRAS COMPETENCIAS E IDIOMAS", "ATAQUES Y LANZAMIENTO DE CONJUROS");
  const attacks = sectionBetween(text, "ATAQUES Y LANZAMIENTO DE CONJUROS", "RASGOS Y ATRIBUTOS");
  const traits = sectionBetween(text, "RASGOS Y ATRIBUTOS", "RASGOS DE PERSONALIDAD");
  const personality = sectionBetween(text, "RASGOS DE PERSONALIDAD", "IDEALES");
  const ideals = sectionBetween(text, "IDEALES", "VÍNCULOS");
  const bonds = sectionBetween(text, "VÍNCULOS", "DEFECTOS");
  const defects = sectionBetween(text, "DEFECTOS", "APARIENCIA");
  const appearance = sectionBetween(text, "APARIENCIA", "NOTAS ADICIONALES");
  const additionalNotes = sectionBetween(text, "NOTAS ADICIONALES", "HISTORIA DEL PERSONAJE");
  const story = sectionBetween(text, "HISTORIA DEL PERSONAJE", "RASGOS ©");
  const spellChunk = sectionBetween(text, "ESPACIOS DE CONJURO", "©");
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

  const classMatch = classAndLevel.match(/^(.*?)(\d+)$/);
  const className = classMatch?.[1]?.trim() ?? "";
  const level = toInt(classMatch?.[2] ?? "");

  return {
    name: name || "Personaje importado",
    class_name: className,
    level,
    race,
    background,
    hp: toInt(hpText),
    ac: toInt(acText),
    speed: toInt(speedText),
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
        saving_throws: savingThrowsChunk,
        skills: skillsChunk,
        competencies,
        attacks,
        traits,
        personality,
        ideals,
        bonds,
        defects,
        appearance,
        additional_notes: additionalNotes,
        story,
        full_traits: fullTraits,
        spell_chunk: spellChunk,
      },
      spells_detected: listSpells(text),
    },
  };
}
