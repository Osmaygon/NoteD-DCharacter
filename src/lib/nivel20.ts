export type Nivel20CharacterListEntry = {
  id: string;
  name: string;
  path: string;
};

export type Nivel20JournalBlock = {
  title: string;
  content: string;
};

export type Nivel20JournalEntry = {
  externalId: string;
  title: string;
  sessionDate: string | null;
  blocks: Nivel20JournalBlock[];
  sourcePayload: Record<string, unknown>;
};

export type Nivel20CampaignJournal = {
  name: string;
  description: string;
  path: string;
  logPath: string;
  entries: Nivel20JournalEntry[];
  importedAt: string;
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

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t\u00a0]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function firstHtmlMatch(html: string, pattern: RegExp): string {
  return decodeHtmlEntities(html.match(pattern)?.[1]?.trim() ?? "");
}

function normalizeDate(value: string): string | null {
  const cleaned = value.trim();
  const iso = cleaned.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = cleaned.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (slash) {
    const day = slash[1].padStart(2, "0");
    const month = slash[2].padStart(2, "0");
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${month}-${day}`;
  }

  const spanish = cleaned.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})\b/i);
  if (!spanish) return null;
  const monthMap: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };
  const month = monthMap[normalizeSearch(spanish[2])];
  return month ? `${spanish[3]}-${month}-${spanish[1].padStart(2, "0")}` : null;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isSpellGrantTraitName(name: string): boolean {
  const normalized = normalizeSearch(name);
  return /^conjuros? de (juramento|dominio|artillero)\b/.test(normalized);
}

function isAlwaysPreparedSpellLabel(labels: string[] = []): boolean {
  return labels.some((label) => /conjuros? de (juramento|dominio|artillero)/i.test(normalizeSearch(label)));
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

function parseCampaignJournalEntries(html: string, logPath: string): Nivel20JournalEntry[] {
  const items = Array.from(html.matchAll(/<li\b[^>]*class=["'][^"']*timeline-item[^"']*["'][^>]*>([\s\S]*?)(?=<li\b[^>]*class=["'][^"']*timeline-item|<\/ul>)/gi));

  return items.flatMap((match, index) => {
    const itemHtml = match[1];
    const rawTitle = firstHtmlMatch(itemHtml, /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)
      || firstHtmlMatch(itemHtml, /<div[^>]*class=["'][^"']*(?:card-title|timeline-title)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
      || `Sesión ${index + 1}`;
    const title = stripTags(rawTitle) || `Sesión ${index + 1}`;
    const timeDate = firstHtmlMatch(itemHtml, /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i);
    const visibleDate = firstHtmlMatch(itemHtml, /<time[^>]*>([\s\S]*?)<\/time>/i)
      || firstHtmlMatch(itemHtml, /<p[^>]*class=["'][^"']*timeline-date[^"']*["'][^>]*>([\s\S]*?)<\/p>/i)
      || htmlToText(itemHtml).slice(0, 160);
    const sessionDate = normalizeDate(timeDate || visibleDate);
    const cardText = firstHtmlMatch(itemHtml, /<div[^>]*class=["'][^"']*card-text[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i);
    const withoutTitle = itemHtml
      .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/i, " ")
      .replace(/<div[^>]*class=["'][^"']*(?:card-title|timeline-title)[^"']*["'][^>]*>[\s\S]*?<\/div>/i, " ")
      .replace(/<time[^>]*>[\s\S]*?<\/time>/i, " ")
      .replace(/<p[^>]*class=["'][^"']*timeline-date[^"']*["'][^>]*>[\s\S]*?<\/p>/i, " ");
    const content = htmlToText(cardText || withoutTitle).replace(title, "").trim();
    if (!content && /^Sesión \d+$/i.test(title)) return [];

    return [{
      externalId: firstHtmlMatch(itemHtml, /data-(?:id|log-id|entry-id)=["']([^"']+)["']/i) || `${logPath}#${index + 1}`,
      title,
      sessionDate,
      blocks: [{ title: "Resumen", content: content || "Entrada importada desde Nivel20." }],
      sourcePayload: { nivel20: { path: logPath, index: index + 1 } },
    }];
  });
}

export async function fetchNivel20CampaignJournal(campaignPath: string): Promise<Nivel20CampaignJournal> {
  const normalizedCampaignPath = campaignPath.replace(/\/characters$|\/details$|\/log$|\/tracking_log$/i, "").replace(/\/$/, "");
  if (!normalizedCampaignPath.startsWith("/games/dnd-5/campaigns/")) {
    throw new Error("Ruta de campaña no valida");
  }

  const logPath = `${normalizedCampaignPath}/log`;
  const html = await nivel20FetchText(logPath);
  const name = stripTags(
    firstHtmlMatch(html, /<meta\s+content=["']([^"']+?)\s+-\s+Campaña/iu)
      || firstHtmlMatch(html, /<title>([\s\S]*?)\s+-\s+D&amp;D/i)
      || firstHtmlMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
      || "Campaña importada",
  );
  const description = stripTags(
    firstHtmlMatch(html, /<meta\s+content=["']([\s\S]*?)["']\s+name=["']description["']/i)
      || firstHtmlMatch(html, /<meta\s+content=["']([\s\S]*?)["']\s+property=["']og:description["']/i),
  );

  return {
    name,
    description,
    path: normalizedCampaignPath,
    logPath,
    entries: parseCampaignJournalEntries(html, logPath),
    importedAt: new Date().toISOString(),
  };
}

export function normalizeNivel20Character(payload: Nivel20CharacterJson, sourcePath: string): Record<string, unknown> {
  const printable = payload.printable_hash ?? {};
  const info = printable.info ?? {};
  const abilities = printable.ability ?? {};

  const className = info.level_desc?.replace(/\s+\d+$/, "").trim() || "";
  const classFeats = (printable.professions ?? []).flatMap((profession) =>
    (profession.feats ?? []).flatMap((feat) => {
      if (!feat.name || isSpellGrantTraitName(feat.name)) return [];
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
    spells.map((spell) => {
      const label = spell.label ?? [];
      const alwaysPrepared = isAlwaysPreparedSpellLabel(label);
      return {
      id: spell.id,
      level,
      name: spell.name,
      prepared: Boolean(spell.prepared) || alwaysPrepared,
      included: Boolean(spell.included) || alwaysPrepared,
      always_prepared: alwaysPrepared,
      label,
      summary: spell.summary ?? "",
      description: spell.description ?? "",
      range: spell.range ?? "",
      casting_time: spell.short_casting_time ?? "",
      duration: spell.duration ?? "",
      components: spell.short_components ?? "",
      school: spell.spell_school_name ?? "",
      };
    }),
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
