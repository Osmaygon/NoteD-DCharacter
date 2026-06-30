import { NextResponse } from "next/server";
import { listNivel20CampaignCharacters } from "@/lib/nivel20";
import { createServerSupabase } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const appSessionToken = new URL(request.url).searchParams.get("appSessionToken")?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });

    const supabase = createServerSupabase();
    const userResp = await supabase.rpc("get_user_by_session", { p_token: appSessionToken });
    if (userResp.error) return NextResponse.json({ error: userResp.error.message }, { status: 401 });
    const user = (userResp.data as Array<{ user_id: string }> | null)?.[0];
    if (!user?.user_id) return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });

    const campaignPath = process.env.NIVEL20_CAMPAIGN_PATH || "/games/dnd-5/campaigns/110040-reino-de-chatelenz";
    const characters = await listNivel20CampaignCharacters(campaignPath);
    return NextResponse.json({ campaignPath, characters });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar Nivel20" },
      { status: 500 },
    );
  }
}
