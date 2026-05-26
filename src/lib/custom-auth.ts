import { supabase } from "@/lib/supabase";

const SESSION_KEY = "ndc_session_token";

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

export async function getCurrentAppUser(): Promise<{ user_id: string; email: string } | null> {
  if (!supabase) throw new Error("Supabase no configurado");
  const token = getStoredSessionToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc("get_user_by_session", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const row = (data as { user_id: string; email: string }[] | null)?.[0];
  return row ?? null;
}

export async function signOutAppUser(): Promise<void> {
  if (!supabase) throw new Error("Supabase no configurado");
  const token = getStoredSessionToken();
  if (!token) return;
  await supabase.rpc("logout_app_session", { p_token: token });
  clearStoredSessionToken();
}
