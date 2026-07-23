import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

const PUBLIC_RPC_ALLOWLIST = new Set([
  "create_app_user",
  "login_app_user",
  "get_user_by_session",
  "update_app_user_nickname",
  "change_app_user_password",
  "logout_app_session",
  "list_campaigns_for_session",
  "create_campaign_for_session",
  "join_campaign_by_code_for_session",
  "get_campaign_detail_for_session",
  "update_campaign_for_session",
  "update_campaign_story_for_session",
  "delete_campaign_for_session",
  "list_campaign_members_for_session",
  "set_campaign_member_role_for_session",
  "list_campaign_journal_entries_for_session",
  "upsert_campaign_journal_entry_for_session",
  "delete_campaign_journal_entry_for_session",
  "list_characters_for_session",
  "list_all_characters_for_session",
  "list_hidden_characters_for_session",
  "create_character_for_session",
  "join_character_by_code_for_session",
  "import_character_from_payload_for_session",
  "get_character_detail_for_session",
  "update_character_detail_for_session",
  "update_character_ammunition_for_session",
  "search_status_effects",
  "list_active_status_effects_for_session",
  "set_character_status_effect_active_for_session",
  "update_character_inventory_for_session",
  "update_character_spell_slots_for_session",
  "update_character_source_payload_for_session",
  "delete_character_for_session",
]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; args?: Record<string, unknown> };
    if (!body.name || !/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(body.name) || !PUBLIC_RPC_ALLOWLIST.has(body.name)) {
      return NextResponse.json({ error: "RPC no permitida" }, { status: 403 });
    }
    const db = createServerSupabase();
    const result = await db.rpc(body.name, body.args ?? {});
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
