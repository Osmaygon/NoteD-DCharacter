export type Nivel20CharacterListEntry = {
  id: string;
  name: string;
  path: string;
};

type Nivel20Spell = {
  id: number;
  name: string;
  summary?: string;
  description?: string;
  short_components?: string;
  range?: string;
  short_casting_time?: string;
  duration?: string;
  spell_school_name?: string;
  prepared?: boolean;
  included?: boolean;
  label?: string[];
};

type Nivel20CharacterJson = {
  printable_hash: {
    info?: {
      id?: number;
      name?: string;
      race?: string;
      level?: number;
      level_desc?: string;
      speed?: number;
      player?: string;
      campaign?: string;
      hit_points?: number;
      proficiency_bonus?: number;
    };
    armor?: { normal?: number };
    ability?: Record<string, { total?: number; mod?: number }>;
    saving_throws?: Array<{ name: string; total?: number; proficiency?: string }>;
    skills?: Array<{ name: string; slug?: string; total?: number; proficiency?: string }>;
    attacks?: Array<{
      name: string;
      attack?: { to_hit?: { value?: number }; damage?: { value?: string; type?: string } };
      fields?: { versatil?: string | null };
      tags?: string[];
      description?: string;
    }>;
    items?: Record<string, Array<{ name: string; description?: string; tags?: string[]; location?: string | null }>>;
    race_feats?: Array<{ name: string; description?: string } | string>;
    custom_feats?: Array<{ name: string; description?: string } | string>;
    professions?: Array<{ name?: string; feats?: Array<{ name?: string; description?: string }> }>;
    fields?: {
      historia?: string | null;
      apariencia?: string | null;
      alineamiento?: string | null;
      edad?: string | null;
      idiomas?: string | null;
      notas?: string | null;
      perception?: { total?: number; total_value?: number };
    };
    background?: {
      name?: string;
      traits?: string;
      ideals?: string;
      bonds?: string;
      flaws?: string;
      feat_description?: string;
    };
    spell_books?: Array<{
      spell_ability_name?: string;
      spell_save_dc?: number;
      spell_attack_bonus?: number;
      prepared_spells?: number;
      current_level_slots?: Record<string, string>;
      spells?: Array<[number, Nivel20Spell[]]>;
    }>;
  };
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú");
}

function stripTags(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function nivel20FetchText(path: string): Promise<string> {
  const baseUrl = (process.env.NIVEL20_BASE_URL || "https://nivel20.com").replace(/\/$/, "");
  const sessionCookie = process.env.NIVEL20_SESSION_COOKIE;
  if (!sessionCookie) throw new Error("NIVEL20_SESSION_COOKIE no configurada");

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      cookie: sessionCookie,
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "user-agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Nivel20 devolvio ${response.status} para ${path}`);
  }

  return response.text();
}

export async function listNivel20CampaignCharacters(campaignPath: string): Promise<Nivel20CharacterListEntry[]> {
  const charactersPath = `${campaignPath.replace(/\/$/, "")}/characters`;
  const html = await nivel20FetchText(charactersPath);
  const re = /href="(\/games\/dnd-5\/campaigns\/[^"]+\/characters\/(\d+)(?:-[^"]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;
  const map = new Map<string, Nivel20CharacterListEntry>();
  for (const match of html.matchAll(re)) {
    const path = decodeHtmlEntities(match[1]);
    const id = match[2];
    const name = stripTags(match[3]);
    if (!name || name === "Ver detalles") continue;
    map.set(id, { id, name, path });
  }
  return Array.from(map.values());
}

export async function fetchNivel20CharacterJson(characterPath: string): Promise<Nivel20CharacterJson> {
  const normalized = characterPath.endsWith(".json") ? characterPath : `${characterPath}.json`;
  const body = await nivel20FetchText(normalized);
  return JSON.parse(body) as Nivel20CharacterJson;
}

export function normalizeNivel20Character(payload: Nivel20CharacterJson, sourcePath: string): Record<string, unknown> {
  const printable = payload.printable_hash ?? {};
  const info = printable.info ?? {};
  const abilities = printable.ability ?? {};

  const className = info.level_desc?.replace(/\s+\d+$/, "").trim() || "";
  const classFeats = (printable.professions ?? []).flatMap((profession) =>
    (profession.feats ?? []).flatMap((feat) => {
      if (!feat.name) return [];
      return [{
        name: feat.name,
        pdf_description: feat.description ?? "",
        kind: profession.name ? `Clase: ${profession.name}` : "Clase",
      }];
    }),
  );

  const raceFeats = (printable.race_feats ?? []).flatMap((feat) => {
    if (typeof feat === "string") {
      return [{ name: feat, pdf_description: "", kind: "Raza" }];
    }
    if (!feat?.name) return [];
    return [{ name: feat.name, pdf_description: feat.description ?? "", kind: "Raza" }];
  });

  const customFeats = (printable.custom_feats ?? []).flatMap((feat) => {
    if (typeof feat === "string") {
      return [{ name: feat, pdf_description: "", kind: "Dote personalizada" }];
    }
    if (!feat?.name) return [];
    return [{ name: feat.name, pdf_description: feat.description ?? "", kind: "Dote personalizada" }];
  });

  const attacks = (printable.attacks ?? []).map((attack) => ({
    name: attack.name,
    bonus: attack.attack?.to_hit?.value !== undefined ? String(attack.attack.to_hit.value) : "-",
    damage: attack.attack?.damage?.value ?? "-",
    damageType: attack.attack?.damage?.type ?? "",
  }));

  const equipment = Object.entries(printable.items ?? {}).flatMap(([group, items]) =>
    items.map((item) => ({
      name: item.name,
      detail: item.description ?? "",
      kind: group,
      quick_use: item.tags?.join(", ") ?? "",
    })),
  );

  const spellBook = printable.spell_books?.[0];
  const spellRows = (spellBook?.spells ?? []).flatMap(([level, spells]) =>
    spells.map((spell) => ({
      id: spell.id,
      level,
      name: spell.name,
      prepared: Boolean(spell.prepared),
      included: Boolean(spell.included),
      label: spell.label ?? [],
      summary: spell.summary ?? "",
      description: spell.description ?? "",
      range: spell.range ?? "",
      casting_time: spell.short_casting_time ?? "",
      duration: spell.duration ?? "",
      components: spell.short_components ?? "",
      school: spell.spell_school_name ?? "",
    })),
  );
  const perceptionSkill = (printable.skills ?? []).find((entry) =>
    entry.slug === "percepcion" || normalizeSearch(entry.name) === "percepcion",
  );
  const rawPassivePerception = printable.fields?.perception?.total ?? printable.fields?.perception?.total_value;
  const passivePerception = typeof rawPassivePerception === "number" && rawPassivePerception > 0
    ? rawPassivePerception
    : typeof perceptionSkill?.total === "number"
      ? 10 + perceptionSkill.total
      : rawPassivePerception ?? null;

  return {
    name: info.name ?? "Personaje importado",
    class_name: className,
    level: info.level ?? null,
    race: info.race ?? "",
    background: printable.background?.name ?? "",
    hp: printable.info?.hit_points ?? null,
    ac: printable.armor?.normal ?? null,
    speed: printable.info?.speed ?? null,
    notes: printable.fields?.notas ?? printable.fields?.historia ?? "",
    source_payload: {
      external_source: "nivel20",
      external_id: String(info.id ?? ""),
      external_path: sourcePath,
      imported_at: new Date().toISOString(),
      raw: printable,
      summary: {
        player: printable.info?.player,
        campaign: printable.info?.campaign,
        proficiency_bonus: printable.info?.proficiency_bonus,
        passive_perception: passivePerception,
        abilities: {
          fuerza: { score: abilities.fue?.total, modifier: abilities.fue?.mod },
          destreza: { score: abilities.des?.total, modifier: abilities.des?.mod },
          constitucion: { score: abilities.con?.total, modifier: abilities.con?.mod },
          inteligencia: { score: abilities.int?.total, modifier: abilities.int?.mod },
          sabiduria: { score: abilities.sab?.total, modifier: abilities.sab?.mod },
          carisma: { score: abilities.car?.total, modifier: abilities.car?.mod },
        },
        saving_throws: (printable.saving_throws ?? []).map((entry) => ({
          name: entry.name,
          bonus: entry.total !== undefined ? String(entry.total) : "-",
          proficient: entry.proficiency === "proficient" || entry.proficiency === "expertise",
        })),
        skills: (printable.skills ?? []).map((entry) => ({
          name: entry.name,
          bonus: entry.total !== undefined ? String(entry.total) : "-",
          proficient: entry.proficiency === "proficient" || entry.proficiency === "expertise",
        })),
        attacks,
        equipment,
        traits: [...raceFeats, ...classFeats, ...customFeats],
        spells: spellRows,
        spell_meta: {
          ability: spellBook?.spell_ability_name ?? null,
          save_dc: spellBook?.spell_save_dc ?? null,
          attack_bonus: spellBook?.spell_attack_bonus ?? null,
          prepared_limit: spellBook?.prepared_spells ?? null,
          slots: spellBook?.current_level_slots ?? {},
        },
      },
      sections: {
        attacks: attacks.map((entry) => `${entry.name} ${entry.bonus} ${entry.damage} ${entry.damageType}`).join("\n"),
        equipment: equipment.map((entry) => entry.name).join("\n"),
        traits: [...raceFeats, ...classFeats, ...customFeats].map((entry) => entry.name).join("\n"),
      },
    },
  };
}
