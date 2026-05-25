const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export type RollResult = {
  formula: string;
  rolls: number[];
  modifier: number;
  total: number;
};

export function rollFormula(input: string): RollResult {
  const formula = input.replaceAll(" ", "").toLowerCase();
  const match = formula.match(/^(\d+)d(4|6|8|10|12|20|100)([+-]\d+)?$/);
  if (!match) {
    throw new Error("Formato invalido. Usa por ejemplo 1d6, 3d20, 2d8+3");
  }

  const count = Number(match[1]);
  const faces = Number(match[2]);
  const modifier = match[3] ? Number(match[3]) : 0;

  if (!DICE.includes(faces as (typeof DICE)[number])) {
    throw new Error("Tipo de dado no soportado");
  }
  if (count < 1 || count > 50) {
    throw new Error("Cantidad de dados fuera de rango (1-50)");
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * faces) + 1);
  const total = rolls.reduce((acc, v) => acc + v, 0) + modifier;
  return { formula, rolls, modifier, total };
}
