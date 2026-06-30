import { NextResponse } from "next/server";
import { fetchNivel20CharacterJson, normalizeNivel20Character } from "@/lib/nivel20";
import { createServerSupabase } from "@/lib/server-supabase";

type ReqBody = {
  characterPath?: string;
  appSessionToken?: string;
};

type CharacterListRow = {
  id: string;
  name: string;
};

type CharacterDetailRow = {
  id: string;
  name: string;
  class_name: string | null;
  level: number | null;
  race: string | null;
  background: string | null;
  hp: number | null;
  current_hp: number | null;
  temp_hp: number | null;
  shields: number | null;
  ac: number | null;
  speed: number | null;
  notes: string | null;
  source_payload: Record<string, unknown>;
};

function normalizePath(path: string): string {
  const clean = path.trim();
  if (!clean.startsWith("/games/dnd-5/campaigns/")) {
    throw new Error("Ruta de personaje no valida");
  }
  if (!clean.includes("/characters/")) {
    throw new Error("Ruta de personaje no valida");
  }
  return clean.replace(/\.json$/, "");
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function mergeSourcePayload(
  existingPayload: Record<string, unknown>,
  importedPayload: Record<string, unknown>,
  characterPath: string,
  externalId: string,
): Record<string, unknown> {
  const existingManual = existingPayload.manual_trait_descriptions;
  const existingPreparedSpellIds = existingPayload.prepared_spell_ids;
  const existingCombatFavorites = existingPayload.combat_favorites;

  return {
    ...importedPayload,
    manual_trait_descriptions: existingManual ?? {},
    prepared_spell_ids: existingPreparedSpellIds ?? [],
    combat_favorites: existingCombatFavorites ?? [],
    nivel20: {
      id: externalId,
      path: characterPath,
      source: "nivel20",
      last_synced_at: new Date().toISOString(),
      sync_hash: stableStringify(importedPayload.summary),
    },
  };
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReqBody;
    const characterPath = body.characterPath ? normalizePath(body.characterPath) : "";
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!characterPath) {
      return NextResponse.json({ error: "Falta characterPath" }, { status: 400 });
    }
    if (!appSessionToken) {
      return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });
    }

    const supabase = createServerSupabase();
    const userResp = await supabase.rpc("get_user_by_session", { p_token: appSessionToken });
    if (userResp.error) {
      return NextResponse.json({ error: userResp.error.message }, { status: 401 });
    }
    const user = (userResp.data as Array<{ user_id: string; email: string }> | null)?.[0];
    if (!user?.user_id) {
      return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });
    }

    const nivel20Json = await fetchNivel20CharacterJson(characterPath);
    const normalized = normalizeNivel20Character(nivel20Json, characterPath);
    const sourcePayload = (normalized.source_payload as Record<string, unknown>) ?? {};
    const externalId = String(sourcePayload.external_id ?? "");
    const importedName = String(normalized.name ?? "");
    if (!externalId || !importedName) {
      return NextResponse.json({ error: "No se pudo leer id/nombre del personaje de Nivel20" }, { status: 500 });
    }

    const listResp = await supabase.rpc("list_all_characters_for_session", { p_token: appSessionToken });
    if (listResp.error) {
      return NextResponse.json({ error: listResp.error.message }, { status: 500 });
    }
    const listRows = (listResp.data ?? []) as CharacterListRow[];

    let matchByExternal: CharacterDetailRow | null = null;
    let matchByName: CharacterDetailRow | null = null;
    const normalizedImportedName = normalizeName(importedName);
    const importSummaryHash = stableStringify(sourcePayload.summary);

    for (const row of listRows) {
      const detailResp = await supabase.rpc("get_character_detail_for_session", {
        p_token: appSessionToken,
        p_character_id: row.id,
      });
      if (detailResp.error) continue;
      const detail = ((detailResp.data ?? []) as CharacterDetailRow[])[0];
      if (!detail) continue;

      const payload = (detail.source_payload ?? {}) as Record<string, unknown>;
      const nivel20 = payload.nivel20 as Record<string, unknown> | undefined;
      const existingExternalId = String(nivel20?.id ?? payload.external_id ?? "");

      if (existingExternalId && existingExternalId === externalId) {
        matchByExternal = detail;
        break;
      }

      if (!matchByName && normalizeName(detail.name ?? "") === normalizedImportedName) {
        matchByName = detail;
      }
    }

    const target = matchByExternal ?? matchByName;
    if (!target) {
      normalized.source_payload = mergeSourcePayload({}, sourcePayload, characterPath, externalId);
      const importResp = await supabase.rpc("import_character_from_payload_for_session", {
        p_token: appSessionToken,
        p_payload: normalized,
      });
      if (importResp.error) {
        return NextResponse.json({ error: importResp.error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "created", imported: importResp.data });
    }

    const visibilityResp = await supabase.rpc("set_character_visibility_for_session", {
      p_token: appSessionToken,
      p_character_id: target.id,
      p_is_visible: true,
    });
    if (visibilityResp.error) {
      return NextResponse.json({ error: visibilityResp.error.message }, { status: 500 });
    }

    const existingPayload = (target.source_payload ?? {}) as Record<string, unknown>;
    const currentHash = String((existingPayload.nivel20 as Record<string, unknown> | undefined)?.sync_hash ?? "");
    if (currentHash && currentHash === importSummaryHash) {
      return NextResponse.json({ ok: true, action: "unchanged", characterId: target.id });
    }

    const updateResp = await supabase.rpc("update_character_detail_for_session", {
      p_token: appSessionToken,
      p_character_id: target.id,
      p_name: String(normalized.name ?? target.name ?? ""),
      p_class_name: String(normalized.class_name ?? ""),
      p_level: (normalized.level as number | null) ?? null,
      p_race: String(normalized.race ?? ""),
      p_background: String(normalized.background ?? ""),
      p_hp: (normalized.hp as number | null) ?? null,
      p_current_hp: target.current_hp ?? (normalized.hp as number | null) ?? 0,
      p_temp_hp: target.temp_hp ?? 0,
      p_shields: target.shields ?? 0,
      p_ac: (normalized.ac as number | null) ?? null,
      p_speed: (normalized.speed as number | null) ?? null,
      p_notes: String(normalized.notes ?? ""),
    });
    if (updateResp.error) {
      return NextResponse.json({ error: updateResp.error.message }, { status: 500 });
    }

    const mergedPayload = mergeSourcePayload(existingPayload, sourcePayload, characterPath, externalId);
    const payloadResp = await supabase.rpc("update_character_source_payload_for_session", {
      p_token: appSessionToken,
      p_character_id: target.id,
      p_source_payload: mergedPayload,
    });
    if (payloadResp.error) {
      return NextResponse.json({ error: payloadResp.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: "updated", characterId: target.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo importar desde Nivel20" },
      { status: 500 },
    );
  }
}
