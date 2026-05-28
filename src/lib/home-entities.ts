import { supabase } from "@/lib/supabase";

export type HomeEntity = {
  id: string;
  name: string;
  join_code: string;
  created_at?: string;
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
