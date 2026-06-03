import { supabase } from "@/lib/supabase";

export type HomeEntity = {
  id: string;
  name: string;
  join_code: string;
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
