import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const appSessionToken = new URL(request.url).searchParams.get("appSessionToken")?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });
    const supabase = createServerSupabase();
    const resp = await supabase.rpc("list_character_level_snapshots_for_session", {
      p_token: appSessionToken,
      p_character_id: id,
    });
    if (resp.error) return NextResponse.json({ error: resp.error.message }, { status: 400 });
    return NextResponse.json({ levels: resp.data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { appSessionToken?: string; level?: number };
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });
    if (!body.level) return NextResponse.json({ error: "Falta nivel" }, { status: 400 });
    const supabase = createServerSupabase();
    const resp = await supabase.rpc("activate_character_level_snapshot_for_session", {
      p_token: appSessionToken,
      p_character_id: id,
      p_level: body.level,
    });
    if (resp.error) return NextResponse.json({ error: resp.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
