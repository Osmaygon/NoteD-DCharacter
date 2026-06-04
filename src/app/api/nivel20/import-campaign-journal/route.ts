import { NextResponse } from "next/server";
import { fetchNivel20CampaignJournal } from "@/lib/nivel20";
import { createServerSupabase } from "@/lib/server-supabase";

type ReqBody = {
  campaignPath?: string;
  campaignId?: string;
  appSessionToken?: string;
};

type CampaignRow = {
  id: string;
  name: string;
  can_edit?: boolean;
  source_payload?: Record<string, unknown>;
};

type JournalRow = {
  id: string;
  source_payload?: Record<string, unknown>;
};

function normalizePath(path: string): string {
  const clean = path.trim() || process.env.NIVEL20_CAMPAIGN_PATH || "/games/dnd-5/campaigns/110040-reino-de-chatelenz";
  if (!clean.startsWith("/games/dnd-5/campaigns/")) throw new Error("Ruta de campaña no valida");
  return clean.replace(/\/characters$|\/details$|\/log$|\/tracking_log$/i, "").replace(/\/$/, "");
}

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReqBody;
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!appSessionToken) return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });

    const campaignPath = normalizePath(body.campaignPath ?? "");
    const supabase = createServerSupabase();
    const userResp = await supabase.rpc("get_user_by_session", { p_token: appSessionToken });
    if (userResp.error) return NextResponse.json({ error: userResp.error.message }, { status: 401 });
    const user = (userResp.data as Array<{ user_id: string; email: string }> | null)?.[0];
    if (!user?.user_id) return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });

    const imported = await fetchNivel20CampaignJournal(campaignPath);
    const campaignSourcePayload = {
      nivel20: {
        path: imported.path,
        log_path: imported.logPath,
        source: "nivel20",
        last_synced_at: imported.importedAt,
        sync_hash: stableStringify({ description: imported.description, entries: imported.entries }),
      },
    };

    let campaignId = body.campaignId?.trim() || "";
    if (!campaignId) {
      const listResp = await supabase.rpc("list_campaigns_for_user", { p_user_id: user.user_id });
      if (listResp.error) return NextResponse.json({ error: listResp.error.message }, { status: 500 });
      const campaigns = (listResp.data ?? []) as CampaignRow[];
      const importedName = normalizeName(imported.name);
      const match = campaigns.find((campaign) => {
        const source = campaign.source_payload ?? {};
        const nivel20 = source.nivel20 as Record<string, unknown> | undefined;
        return String(nivel20?.path ?? "") === imported.path || normalizeName(campaign.name) === importedName;
      });
      if (match) {
        campaignId = match.id;
      } else {
        const createResp = await supabase.rpc("create_campaign_for_user", { p_user_id: user.user_id, p_name: imported.name });
        if (createResp.error) return NextResponse.json({ error: createResp.error.message }, { status: 500 });
        campaignId = ((createResp.data ?? []) as Array<{ id: string }>)[0]?.id ?? "";
      }
    }

    if (!campaignId) return NextResponse.json({ error: "No se pudo crear o localizar la campaña" }, { status: 500 });

    const storyResp = await supabase.rpc("update_campaign_story_for_user", {
      p_user_id: user.user_id,
      p_campaign_id: campaignId,
      p_description: imported.description,
      p_source_payload: campaignSourcePayload,
    });
    if (storyResp.error) return NextResponse.json({ error: storyResp.error.message }, { status: 500 });

    const currentResp = await supabase.rpc("list_campaign_journal_entries_for_user", {
      p_user_id: user.user_id,
      p_campaign_id: campaignId,
    });
    if (currentResp.error) return NextResponse.json({ error: currentResp.error.message }, { status: 500 });
    const currentEntries = (currentResp.data ?? []) as JournalRow[];

    let created = 0;
    let updated = 0;
    for (const entry of imported.entries) {
      const existing = currentEntries.find((row) => {
        const nivel20 = row.source_payload?.nivel20 as Record<string, unknown> | undefined;
        return String(nivel20?.id ?? "") === entry.externalId;
      });
      const entrySourcePayload = {
        ...entry.sourcePayload,
        nivel20: {
          ...((entry.sourcePayload.nivel20 as Record<string, unknown> | undefined) ?? {}),
          id: entry.externalId,
          path: imported.logPath,
          source: "nivel20",
          last_synced_at: imported.importedAt,
        },
      };
      const upsertResp = await supabase.rpc("upsert_campaign_journal_entry_for_user", {
        p_user_id: user.user_id,
        p_campaign_id: campaignId,
        p_entry_id: existing?.id ?? null,
        p_title: entry.title,
        p_session_date: entry.sessionDate,
        p_blocks: entry.blocks,
        p_source_payload: entrySourcePayload,
      });
      if (upsertResp.error) return NextResponse.json({ error: upsertResp.error.message }, { status: 500 });
      if (existing) updated += 1;
      else created += 1;
    }

    return NextResponse.json({ ok: true, campaignId, campaignName: imported.name, entries: imported.entries.length, created, updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo importar el diario de campaña" },
      { status: 500 },
    );
  }
}
