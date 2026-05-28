import { supabase } from "@/lib/supabase";

const SESSION_KEY = "ndc_session_token";

export type AppUser = {
  user_id: string;
  email: string;
  nickname: string | null;
};

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SESSION_KEY);
}

export function clearStoredSessionToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SESSION_KEY);
}

async function storeToken(token: string): Promise<void> {
  localStorage.setItem(SESSION_KEY, token);
}

export async function signUpAppUser(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("create_app_user", {
    p_email: email,
    p_password: password,
  });
  if (error) throw new Error(error.message);
  await storeToken(data as string);
}

export async function signInAppUser(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.rpc("login_app_user", {
    p_email: email,
    p_password: password,
  });
  if (error) throw new Error(error.message);
  await storeToken(data as string);
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  if (!supabase) throw new Error("Supabase no configurado");
  const token = getStoredSessionToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc("get_user_by_session", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const row = (data as AppUser[] | null)?.[0];
  return row ?? null;
}

export async function updateNickname(nickname: string): Promise<AppUser> {
  if (!supabase) throw new Error("Supabase no configurado");
  const token = getStoredSessionToken();
  if (!token) throw new Error("Sesion no encontrada");
  const { data, error } = await supabase.rpc("update_app_user_nickname", {
    p_token: token,
    p_nickname: nickname,
  });
  if (error) throw new Error(error.message);
  const row = (data as AppUser[] | null)?.[0];
  if (!row) throw new Error("No se pudo actualizar el perfil");
  return row;
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const token = getStoredSessionToken();
  if (!token) throw new Error("Sesion no encontrada");
  const { error } = await supabase.rpc("change_app_user_password", {
    p_token: token,
    p_current_password: currentPassword,
    p_new_password: nextPassword,
  });
  if (error) throw new Error(error.message);
}

export async function signOutAppUser(): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const token = getStoredSessionToken();
  if (!token) return;
  await supabase.rpc("logout_app_session", { p_token: token });
  clearStoredSessionToken();
}
