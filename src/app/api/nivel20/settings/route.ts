import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";
import { listNivel20CampaignCharacters } from "@/lib/nivel20";

export const dynamic = "force-dynamic";

type SettingsRow = { has_cookie: boolean; updated_at: string | null; cookie?: string | null };

async function getCookieRow(appSessionToken: string): Promise<SettingsRow | null> {
  const supabase = createServerSupabase();
  const resp = await supabase.rpc("get_nivel20_session_cookie_for_session", { p_token: appSessionToken });
  if (resp.error) throw new Error(resp.error.message);
  return ((resp.data as SettingsRow[] | null) ?? [])[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const appSessionToken = new URL(request.url).searchParams.get("appSessionToken")?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });
    const row = await getCookieRow(appSessionToken);
    return NextResponse.json({ hasCookie: Boolean(row?.has_cookie), updatedAt: row?.updated_at ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { appSessionToken?: string; cookie?: string; test?: boolean };
    const appSessionToken = body.appSessionToken?.trim() || "";
    const cookie = body.cookie?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });
    if (!cookie) return NextResponse.json({ error: "Falta cookie" }, { status: 400 });

    if (body.test) {
      const campaignPath = process.env.NIVEL20_CAMPAIGN_PATH || "/games/dnd-5/campaigns/110040-reino-de-chatelenz";
      const characters = await listNivel20CampaignCharacters(campaignPath, cookie);
      return NextResponse.json({ ok: true, characters: characters.length });
    }

    const supabase = createServerSupabase();
    const resp = await supabase.rpc("set_nivel20_session_cookie_for_session", { p_token: appSessionToken, p_cookie: cookie });
    if (resp.error) return NextResponse.json({ error: resp.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
