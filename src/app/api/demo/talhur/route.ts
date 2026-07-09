import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerSupabase();
    const resp = await supabase.rpc("get_public_demo_character");
    if (resp.error) return NextResponse.json({ error: resp.error.message }, { status: 500 });
    const row = (resp.data as unknown[] | null)?.[0] ?? null;
    if (!row) return NextResponse.json({ error: "Demo no encontrada" }, { status: 404 });
    return NextResponse.json({ character: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
}
