import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unfurl } from "@/lib/unfurl";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { url } = await request.json().catch(() => ({ url: null }));
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "Informe um link" }, { status: 400 });
  }
  try {
    return NextResponse.json(await unfurl(url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao ler o link";
    return NextResponse.json(
      { error: msg.includes("aborted") || msg.includes("timeout") ? "O site demorou demais" : msg },
      { status: 422 },
    );
  }
}
