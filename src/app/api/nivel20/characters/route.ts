import { NextResponse } from "next/server";
import { listNivel20CampaignCharacters } from "@/lib/nivel20";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
