import { NextResponse } from "next/server";
import { fetchNivel20CharacterJson, normalizeNivel20Character } from "@/lib/nivel20";
import { createServerSupabase } from "@/lib/server-supabase";

type ReqBody = {
  characterPath?: string;
  appSessionToken?: string;
};

function normalizePath(path: string): string {
  const clean = path.trim();
  if (!clean.startsWith("/games/dnd-5/campaigns/")) {
    throw new Error("Ruta de personaje no valida");
  }
  if (!clean.includes("/characters/")) {
    throw new Error("Ruta de personaje no valida");
  }
  return clean.replace(/\.json$/, "");
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReqBody;
    const characterPath = body.characterPath ? normalizePath(body.characterPath) : "";
    const appSessionToken = body.appSessionToken?.trim() || "";
    if (!characterPath) {
      return NextResponse.json({ error: "Falta characterPath" }, { status: 400 });
    }
    if (!appSessionToken) {
      return NextResponse.json({ error: "Falta appSessionToken" }, { status: 401 });
    }

    const supabase = createServerSupabase();
    const userResp = await supabase.rpc("get_user_by_session", { p_token: appSessionToken });
    if (userResp.error) {
      return NextResponse.json({ error: userResp.error.message }, { status: 401 });
    }
    const user = (userResp.data as Array<{ user_id: string; email: string }> | null)?.[0];
    if (!user?.user_id) {
      return NextResponse.json({ error: "Sesion invalida" }, { status: 401 });
    }

    const nivel20Json = await fetchNivel20CharacterJson(characterPath);
    const normalized = normalizeNivel20Character(nivel20Json, characterPath);

    const importResp = await supabase.rpc("import_character_from_payload", {
      p_user_id: user.user_id,
      p_payload: normalized,
    });
    if (importResp.error) {
      return NextResponse.json({ error: importResp.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, imported: importResp.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo importar desde Nivel20" },
      { status: 500 },
    );
  }
}
