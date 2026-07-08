#!/usr/bin/env node
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path = ".env.local") {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
    process.env[key] ||= value;
  }
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
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

function isSpellGrantTraitName(name) {
  const normalized = normalizeName(name);
  return /^conjuros? de (juramento|dominio|artillero)\b/.test(normalized);
}

function isAlwaysPreparedSpellLabel(labels = []) {
  return labels.some((label) => /conjuros? de (juramento|dominio|artillero)/i.test(normalizeName(label)));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function nivel20FetchText(path) {
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

  if (!response.ok) throw new Error(`Nivel20 devolvio ${response.status} para ${path}`);
  return response.text();
}

async function listCampaignCharacterPaths(campaignPath) {
  const html = await nivel20FetchText(`${campaignPath.replace(/\/$/, "")}/characters`);
  const matches = html.matchAll(/\/games\/dnd-5\/campaigns\/[^"'<>\s]+\/characters\/\d+[^"'<>\s]*/g);
  return Array.from(
    new Set(
      Array.from(matches, (match) => decodeHtmlEntities(match[0]).replace(/\.json$/, "").replace(/\?.*$/, "")),
    ),
  );
}

async function fetchCharacterJson(characterPath) {
  return JSON.parse(await nivel20FetchText(`${characterPath}.json`));
}

function normalizeNivel20Character(payload, sourcePath) {
  const printable = payload.printable_hash ?? {};
  const info = printable.info ?? {};
  const abilities = printable.ability ?? {};
  const className = info.level_desc?.replace(/\s+\d+$/, "").trim() || "";

  const classFeats = (printable.professions ?? []).flatMap((profession) =>
    (profession.feats ?? []).flatMap((feat) =>
      feat?.name && !isSpellGrantTraitName(feat.name)
        ? [{ name: feat.name, pdf_description: feat.description ?? "", kind: profession.name ? `Clase: ${profession.name}` : "Clase" }]
        : [],
    ),
  );

  const raceFeats = (printable.race_feats ?? []).flatMap((feat) => {
    if (typeof feat === "string") return [{ name: feat, pdf_description: "", kind: "Raza" }];
    return feat?.name ? [{ name: feat.name, pdf_description: feat.description ?? "", kind: "Raza" }] : [];
  });

  const customFeats = (printable.custom_feats ?? []).flatMap((feat) => {
    if (typeof feat === "string") return [{ name: feat, pdf_description: "", kind: "Dote personalizada" }];
    return feat?.name ? [{ name: feat.name, pdf_description: feat.description ?? "", kind: "Dote personalizada" }] : [];
  });

  const attacks = (printable.attacks ?? []).map((attack) => ({
    name: attack.name,
    bonus: attack.attack?.to_hit?.value !== undefined ? String(attack.attack.to_hit.value) : "-",
    damage: attack.attack?.damage?.value ?? "-",
    damageType: attack.attack?.damage?.type ?? "",
  }));

  const equipment = Object.entries(printable.items ?? {}).flatMap(([group, items]) =>
    (items ?? []).map((item) => ({
      name: item.name,
      detail: item.description ?? "",
      kind: group,
      quick_use: item.tags?.join(", ") ?? "",
    })),
  );

  const spellBook = printable.spell_books?.[0];
  const spells = (spellBook?.spells ?? []).flatMap(([level, rows]) =>
    rows.map((spell) => {
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
    entry.slug === "percepcion" || normalizeName(entry.name) === "percepcion",
  );
  const rawPassivePerception = printable.fields?.perception?.total ?? printable.fields?.perception?.total_value;
  const passivePerception = typeof rawPassivePerception === "number" && rawPassivePerception > 0
    ? rawPassivePerception
    : typeof perceptionSkill?.total === "number"
      ? 10 + perceptionSkill.total
      : rawPassivePerception ?? null;

  const sourcePayload = {
    external_source: "nivel20",
    external_id: String(info.id ?? ""),
    external_path: sourcePath,
    imported_at: new Date().toISOString(),
    raw: printable,
    summary: {
      player: info.player,
      campaign: info.campaign,
      proficiency_bonus: info.proficiency_bonus,
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
      spells,
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
  };

  return {
    name: info.name ?? "Personaje importado",
    class_name: className,
    level: info.level ?? null,
    race: info.race ?? "",
    background: printable.background?.name ?? "",
    hp: info.hit_points ?? null,
    ac: printable.armor?.normal ?? null,
    speed: info.speed ?? null,
    notes: printable.fields?.notas ?? printable.fields?.historia ?? "",
    source_payload: sourcePayload,
  };
}

function mergeSourcePayload(_existingPayload, importedPayload, characterPath, externalId) {
  return {
    ...importedPayload,
    nivel20: {
      id: externalId,
      path: characterPath,
      source: "nivel20",
      last_synced_at: new Date().toISOString(),
      sync_hash: stableStringify(importedPayload.summary),
    },
  };
}

async function rpc(supabase, name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function findTargetCharacter(supabase, sessionToken, externalId, importedName) {
  const rows = await rpc(supabase, "list_all_characters_for_session", { p_token: sessionToken });
  let matchByName = null;
  for (const row of rows ?? []) {
    const details = await rpc(supabase, "get_character_detail_for_session", { p_token: sessionToken, p_character_id: row.id });
    const detail = details?.[0];
    if (!detail) continue;
    const payload = detail.source_payload ?? {};
    const nested = payload.source_payload ?? {};
    const nivel20 = payload.nivel20 ?? nested.nivel20 ?? {};
    const existingExternalId = String(nivel20.id ?? payload.external_id ?? nested.external_id ?? "");
    if (existingExternalId && existingExternalId === externalId) return detail;
    if (!matchByName && normalizeName(detail.name) === normalizeName(importedName)) matchByName = detail;
  }
  return matchByName;
}

async function upsertCharacter(supabase, sessionToken, normalized, characterPath) {
  const sourcePayload = normalized.source_payload ?? {};
  const externalId = String(sourcePayload.external_id ?? "");
  if (!externalId || !normalized.name) throw new Error(`No se pudo leer id/nombre para ${characterPath}`);

  const target = await findTargetCharacter(supabase, sessionToken, externalId, normalized.name);
  if (!target) {
    const mergedPayload = mergeSourcePayload({}, sourcePayload, characterPath, externalId);
    normalized.source_payload = mergedPayload;
    const imported = await rpc(supabase, "import_character_from_payload_for_session", { p_token: sessionToken, p_payload: normalized });
    const createdId = imported?.[0]?.id;
    return { action: "created", id: createdId, name: normalized.name };
  }

  const mergedPayload = mergeSourcePayload(target.source_payload ?? {}, sourcePayload, characterPath, externalId);
  await rpc(supabase, "sync_character_base_from_payload_for_session", {
    p_token: sessionToken,
    p_character_id: target.id,
    p_payload: {
      ...normalized,
      source_payload: mergedPayload,
    },
  });
  return { action: "updated", id: target.id, name: normalized.name };
}

async function main() {
  loadEnvFile();
  const sessionToken = argValue("--session-token") || process.env.APP_SESSION_TOKEN || process.env.NIVEL20_IMPORT_SESSION_TOKEN;
  const campaignPath = argValue("--campaign") || process.env.NIVEL20_CAMPAIGN_PATH || "/games/dnd-5/campaigns/110040-reino-de-chatelenz";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sessionToken) throw new Error("Falta --session-token <token> o APP_SESSION_TOKEN");
  if (!supabaseUrl || !supabaseKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const supabase = createClient(supabaseUrl, supabaseKey);
  const paths = await listCampaignCharacterPaths(campaignPath);
  console.log(`Nivel20: ${paths.length} personajes encontrados en ${campaignPath}`);

  const results = [];
  for (const path of paths) {
    const json = await fetchCharacterJson(path);
    const normalized = normalizeNivel20Character(json, path);
    const result = await upsertCharacter(supabase, sessionToken, normalized, path);
    results.push(result);
    console.log(`${result.action}: ${result.name} (${result.id || "sin id"})`);
  }

  const created = results.filter((row) => row.action === "created").length;
  const updated = results.filter((row) => row.action === "updated").length;
  console.log(`Listo. Creados: ${created}. Actualizados: ${updated}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
