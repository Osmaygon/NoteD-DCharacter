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

function normalizeWhitespace(value: string): string {
  return value.replace(/\r/g, "").replace(/\t/g, " ").replace(/ +/g, " ").trim();
}

function firstMatch(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? "";
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
    notes: "Importado desde archivo",
    source_payload: { raw_text: rawText },
  };
}
