import { supabase } from "@/lib/supabase";

export type HomeEntity = {
  id: string;
  name: string;
  join_code: string;
  created_at?: string;
  role?: string;
  can_edit?: boolean;
  description?: string;
  source_payload?: Record<string, unknown>;
};

export type CampaignMember = {
  user_id: string;
  email: string;
  nickname: string | null;
  role: "owner" | "admin" | "editor" | "player";
  can_edit: boolean;
  created_at?: string;
};

export type JournalBlock = {
  id?: string;
  title: string;
  content: string;
};

export type CampaignJournalEntry = {
  id: string;
  campaign_id: string;
  title: string;
  session_date: string | null;
  blocks: JournalBlock[];
  source_payload: Record<string, unknown>;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StatusEffect = {
  id: string;
  name: string;
  category: string;
  source: string;
  description: string;
  rules: Record<string, unknown>;
  note?: string;
  created_at?: string;
};

export type CharacterDetail = {
  id: string;
  name: string;
  join_code: string;
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
  spell_slots_spent: Record<string, number> | null;
  ammunition: Record<string, unknown> | null;
  inventory: Record<string, unknown> | null;
};

export async function listCampaigns(userId: string): Promise<HomeEntity[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("list_campaigns_for_user", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return (data ?? []) as HomeEntity[];
}

export async function listCharacters(userId: string): Promise<HomeEntity[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("list_characters_for_user", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return (data ?? []) as HomeEntity[];
}

export async function listHiddenCharacters(userId: string): Promise<HomeEntity[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("list_hidden_characters_for_user", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return (data ?? []) as HomeEntity[];
}

export async function setCharacterVisibility(userId: string, characterId: string, isVisible: boolean): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("set_character_visibility_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
    p_is_visible: isVisible,
  });
  if (error) throw new Error(error.message);
}

export async function createCampaign(userId: string, name: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("create_campaign_for_user", {
    p_user_id: userId,
    p_name: name,
  });
  if (error) throw new Error(error.message);
}

export async function joinCampaign(userId: string, code: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("join_campaign_by_code", {
    p_user_id: userId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
}

export async function getCampaignDetail(userId: string, campaignId: string): Promise<HomeEntity | null> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("get_campaign_detail_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as HomeEntity[])[0] ?? null;
}

export async function updateCampaign(
  userId: string,
  campaignId: string,
  input: { name: string; description: string; source_payload?: Record<string, unknown> },
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_campaign_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_name: input.name,
    p_description: input.description,
    p_source_payload: input.source_payload ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function updateCampaignStory(
  userId: string,
  campaignId: string,
  description: string,
  sourcePayload: Record<string, unknown> = {},
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_campaign_story_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_description: description,
    p_source_payload: sourcePayload,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCampaign(userId: string, campaignId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("delete_campaign_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
}

export async function listCampaignMembers(userId: string, campaignId: string): Promise<CampaignMember[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("list_campaign_members_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignMember[];
}

export async function setCampaignMemberRole(userId: string, campaignId: string, targetUserId: string, role: CampaignMember["role"]): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("set_campaign_member_role_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_target_user_id: targetUserId,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function listCampaignJournalEntries(userId: string, campaignId: string): Promise<CampaignJournalEntry[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("list_campaign_journal_entries_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignJournalEntry[];
}

export async function upsertCampaignJournalEntry(
  userId: string,
  campaignId: string,
  input: {
    id?: string | null;
    title: string;
    session_date: string | null;
    blocks: JournalBlock[];
    source_payload?: Record<string, unknown>;
  },
): Promise<string | null> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("upsert_campaign_journal_entry_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_entry_id: input.id ?? null,
    p_title: input.title,
    p_session_date: input.session_date || null,
    p_blocks: input.blocks,
    p_source_payload: input.source_payload ?? {},
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
}

export async function deleteCampaignJournalEntry(userId: string, campaignId: string, entryId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("delete_campaign_journal_entry_for_user", {
    p_user_id: userId,
    p_campaign_id: campaignId,
    p_entry_id: entryId,
  });
  if (error) throw new Error(error.message);
}

export async function createCharacter(userId: string, name: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("create_character_for_user", {
    p_user_id: userId,
    p_name: name,
  });
  if (error) throw new Error(error.message);
}

export async function joinCharacter(userId: string, code: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("join_character_by_code", {
    p_user_id: userId,
    p_code: code,
  });
  if (error) throw new Error(error.message);
}

export async function importCharacterFromPayload(userId: string, payload: Record<string, unknown>): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("import_character_from_payload", {
    p_user_id: userId,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
}

export async function getCharacterDetail(userId: string, characterId: string): Promise<CharacterDetail | null> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("get_character_detail_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CharacterDetail[])[0] ?? null;
}

export async function updateCharacterDetail(
  userId: string,
  characterId: string,
  input: {
    name: string;
    class_name: string;
    level: number | null;
    race: string;
    background: string;
    hp: number | null;
    current_hp: number | null;
    temp_hp: number | null;
    shields: number | null;
    ac: number | null;
    speed: number | null;
    notes: string;
  },
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_character_detail_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
    p_name: input.name,
    p_class_name: input.class_name,
    p_level: input.level,
    p_race: input.race,
    p_background: input.background,
    p_hp: input.hp,
    p_current_hp: input.current_hp,
    p_temp_hp: input.temp_hp,
    p_shields: input.shields,
    p_ac: input.ac,
    p_speed: input.speed,
    p_notes: input.notes,
  });
  if (error) throw new Error(error.message);
}

export async function updateCharacterAmmunition(
  userId: string,
  characterId: string,
  ammunition: Record<string, unknown>,
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_character_ammunition_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
    p_ammunition: ammunition,
  });
  if (error) throw new Error(error.message);
}

export async function searchStatusEffects(query: string): Promise<StatusEffect[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("search_status_effects", { p_query: query });
  if (error) throw new Error(error.message);
  return (data ?? []) as StatusEffect[];
}

export async function listActiveStatusEffects(userId: string, characterId: string): Promise<StatusEffect[]> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("list_active_status_effects_for_character", {
    p_user_id: userId,
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as StatusEffect[];
}

export async function setCharacterStatusEffectActive(
  userId: string,
  characterId: string,
  statusId: string,
  active: boolean,
  note = "",
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("set_character_status_effect_active", {
    p_user_id: userId,
    p_character_id: characterId,
    p_status_id: statusId,
    p_active: active,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

export async function updateCharacterInventory(
  userId: string,
  characterId: string,
  inventory: Record<string, unknown>,
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_character_inventory_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
    p_inventory: inventory,
  });
  if (error) throw new Error(error.message);
}

export async function updateCharacterSpellSlots(
  userId: string,
  characterId: string,
  spellSlotsSpent: Record<string, number>,
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_character_spell_slots_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
    p_spell_slots_spent: spellSlotsSpent,
  });
  if (error) throw new Error(error.message);
}

export async function updateCharacterSourcePayload(
  userId: string,
  characterId: string,
  sourcePayload: Record<string, unknown>,
): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("update_character_source_payload_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
    p_source_payload: sourcePayload,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCharacter(userId: string, characterId: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { error } = await supabase.rpc("delete_character_for_user", {
    p_user_id: userId,
    p_character_id: characterId,
  });
  if (error) throw new Error(error.message);
}
