import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";
import { fetchNivel20CharacterJson, listNivel20CampaignCharacters, normalizeNivel20Character } from "@/lib/nivel20";

type CharacterRow = { id: string; name: string; source_payload?: Record<string, unknown> | null };
type CookieRow = { cookie?: string | null };

function externalIdFromPayload(payload: Record<string, unknown> | null | undefined): string {
  const source = payload?.source_payload as Record<string, unknown> | undefined;
  return String(source?.external_id ?? "");
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { appSessionToken?: string };
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });

    const supabase = createServerSupabase();
    const cookieResp = await supabase.rpc("get_nivel20_session_cookie_for_session", { p_token: appSessionToken });
    if (cookieResp.error) return NextResponse.json({ error: cookieResp.error.message }, { status: 401 });
    const cookie = ((cookieResp.data as CookieRow[] | null) ?? [])[0]?.cookie;
    if (!cookie) return NextResponse.json({ error: "Cookie de Nivel20 no guardada" }, { status: 400 });

    const currentResp = await supabase.rpc("list_all_characters_for_session", { p_token: appSessionToken });
    if (currentResp.error) return NextResponse.json({ error: currentResp.error.message }, { status: 400 });
    const current = (currentResp.data as CharacterRow[] | null) ?? [];

    const campaignPath = process.env.NIVEL20_CAMPAIGN_PATH || "/games/dnd-5/campaigns/110040-reino-de-chatelenz";
    const nivel20Characters = await listNivel20CampaignCharacters(campaignPath, cookie);
    const byExternalId = new Map(nivel20Characters.map((entry) => [entry.id, entry]));
    const results: Array<{ characterId: string; name: string; level?: number; status: string }> = [];

    for (const character of current) {
      const detailResp = await supabase.rpc("get_character_detail_for_session", {
        p_token: appSessionToken,
        p_character_id: character.id,
      });
      if (detailResp.error) {
        results.push({ characterId: character.id, name: character.name, status: detailResp.error.message });
        continue;
      }
      const detail = ((detailResp.data as CharacterRow[] | null) ?? [])[0];
      const externalId = externalIdFromPayload(detail?.source_payload);
      const nivel20 = externalId ? byExternalId.get(externalId) : undefined;
      if (!nivel20) {
        results.push({ characterId: character.id, name: character.name, status: "sin enlace Nivel20" });
        continue;
      }

      const raw = await fetchNivel20CharacterJson(nivel20.path, cookie);
      const normalized = normalizeNivel20Character(raw, nivel20.path) as {
        name?: string;
        class_name?: string;
        level?: number | null;
        race?: string;
        background?: string;
        hp?: number | null;
        ac?: number | null;
        speed?: number | null;
        notes?: string;
        source_payload?: Record<string, unknown>;
      };
      const upsertResp = await supabase.rpc("upsert_character_level_snapshot_for_session", {
        p_token: appSessionToken,
        p_character_id: character.id,
        p_name: normalized.name ?? character.name,
        p_class_name: normalized.class_name ?? "",
        p_level: normalized.level,
        p_race: normalized.race ?? "",
        p_background: normalized.background ?? "",
        p_hp: normalized.hp ?? null,
        p_ac: normalized.ac ?? null,
        p_speed: normalized.speed ?? null,
        p_notes: normalized.notes ?? "",
        p_source_payload: normalized.source_payload ?? {},
      });
      if (upsertResp.error) {
        results.push({ characterId: character.id, name: character.name, status: upsertResp.error.message });
      } else {
        results.push({ characterId: character.id, name: normalized.name ?? character.name, level: normalized.level ?? undefined, status: "guardado" });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
