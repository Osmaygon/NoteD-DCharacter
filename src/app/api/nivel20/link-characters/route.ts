import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";
import { listNivel20CampaignCharacters } from "@/lib/nivel20";

type CharacterRow = { id: string; name: string; source_payload?: Record<string, unknown> | null };
type CookieRow = { cookie?: string | null };
type Nivel20Row = { id: string; name: string; path: string };

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z0-9ñÑ]+/g, " ")
    .toLowerCase()
    .trim();
}

function scoreMatch(localName: string, remoteName: string): number {
  const local = normalizeName(localName);
  const remote = normalizeName(remoteName);
  if (!local || !remote) return 0;
  if (local === remote) return 100;
  if (local.includes(remote) || remote.includes(local)) return 85;
  const localWords = new Set(local.split(/\s+/).filter((word) => word.length > 2));
  const remoteWords = new Set(remote.split(/\s+/).filter((word) => word.length > 2));
  const shared = [...localWords].filter((word) => remoteWords.has(word)).length;
  return shared ? Math.round((shared / Math.max(localWords.size, remoteWords.size)) * 75) : 0;
}

function bestMatch(character: CharacterRow, nivel20Characters: Nivel20Row[], used: Set<string>) {
  return nivel20Characters
    .filter((row) => !used.has(row.id))
    .map((row) => ({ row, score: scoreMatch(character.name, row.name) }))
    .sort((a, b) => b.score - a.score)[0];
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { appSessionToken?: string; dryRun?: boolean };
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });

    const supabase = createServerSupabase();
    const cookieResp = await supabase.rpc("get_nivel20_session_cookie_for_session", { p_token: appSessionToken });
    if (cookieResp.error) return NextResponse.json({ error: cookieResp.error.message }, { status: 401 });
    const cookie = ((cookieResp.data as CookieRow[] | null) ?? [])[0]?.cookie;
    if (!cookie) return NextResponse.json({ error: "Cookie de Nivel20 no guardada" }, { status: 400 });

    const localResp = await supabase.rpc("list_all_characters_for_session", { p_token: appSessionToken });
    if (localResp.error) return NextResponse.json({ error: localResp.error.message }, { status: 400 });
    const locals = (localResp.data as CharacterRow[] | null) ?? [];

    const campaignPath = process.env.NIVEL20_CAMPAIGN_PATH || "/games/dnd-5/campaigns/110040-reino-de-chatelenz";
    const remotes = await listNivel20CampaignCharacters(campaignPath, cookie);
    const used = new Set<string>();
    const results: Array<{ characterId: string; name: string; nivel20Name?: string; nivel20Id?: string; score?: number; status: string }> = [];

    for (const local of locals) {
      const detailResp = await supabase.rpc("get_character_detail_for_session", {
        p_token: appSessionToken,
        p_character_id: local.id,
      });
      if (detailResp.error) {
        results.push({ characterId: local.id, name: local.name, status: detailResp.error.message });
        continue;
      }
      const detail = ((detailResp.data as CharacterRow[] | null) ?? [])[0];
      const currentPayload = detail?.source_payload ?? {};
      const match = bestMatch(local, remotes, used);
      if (!match || match.score < 45) {
        results.push({ characterId: local.id, name: local.name, score: match?.score ?? 0, status: "sin coincidencia clara" });
        continue;
      }
      used.add(match.row.id);
      const nextPayload = {
        ...currentPayload,
        external_source: "nivel20",
        external_id: match.row.id,
        external_path: match.row.path,
        linked_at: new Date().toISOString(),
      };

      if (!body.dryRun) {
        const updateResp = await supabase.rpc("update_character_source_payload_for_session", {
          p_token: appSessionToken,
          p_character_id: local.id,
          p_source_payload: nextPayload,
        });
        if (updateResp.error) {
          results.push({ characterId: local.id, name: local.name, nivel20Name: match.row.name, nivel20Id: match.row.id, score: match.score, status: updateResp.error.message });
          continue;
        }
      }

      results.push({ characterId: local.id, name: local.name, nivel20Name: match.row.name, nivel20Id: match.row.id, score: match.score, status: body.dryRun ? "candidato" : "vinculado" });
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
