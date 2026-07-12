import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type CharacterDetailRow = {
  name: string;
  class_name: string | null;
  level: number | null;
  race: string | null;
  background: string | null;
  hp: number | null;
  ac: number | null;
  speed: number | null;
  notes: string | null;
  source_payload: Record<string, unknown> | null;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { appSessionToken?: string };
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });

    const supabase = createServerSupabase();
    const detailResp = await supabase.rpc("get_character_detail_for_session", {
      p_token: appSessionToken,
      p_character_id: id,
    });
    if (detailResp.error) return NextResponse.json({ error: detailResp.error.message }, { status: 400 });

    const detail = ((detailResp.data as CharacterDetailRow[] | null) ?? [])[0];
    if (!detail) return NextResponse.json({ error: "Personaje no encontrado" }, { status: 404 });
    if (!detail.level) return NextResponse.json({ error: "El personaje no tiene nivel detectado" }, { status: 400 });

    const upsertResp = await supabase.rpc("upsert_character_level_snapshot_for_session", {
      p_token: appSessionToken,
      p_character_id: id,
      p_name: detail.name,
      p_class_name: detail.class_name ?? "",
      p_level: detail.level,
      p_race: detail.race ?? "",
      p_background: detail.background ?? "",
      p_hp: detail.hp ?? null,
      p_ac: detail.ac ?? null,
      p_speed: detail.speed ?? null,
      p_notes: detail.notes ?? "",
      p_source_payload: detail.source_payload ?? {},
    });
    if (upsertResp.error) return NextResponse.json({ error: upsertResp.error.message }, { status: 400 });

    return NextResponse.json({ ok: true, level: detail.level });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
