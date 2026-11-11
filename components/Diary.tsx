"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { useDarkMode } from "@/lib/useDarkMode";
import MarkdownPreview from "./MarkdownPreview";

const MarkdownEditor = dynamic(() => import("./MarkdownEditor"), { ssr: false });

type Entry = {
  id: string;
  title: string;
  content: string;
  entry_date: string;
  updated_at: string;
};

type SaveState = "saved" | "dirty" | "saving" | "error";

function slug(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "sem-titulo"
  );
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Diary() {
  const supabase = useMemo(() => createClient(), []);
  const dark = useDarkMode();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Entry | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [save, setSave] = useState<SaveState>("saved");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (q = "") => {
      let query = supabase
        .from("entries")
        .select("id,title,content,entry_date,updated_at")
        .order("entry_date", { ascending: false })
        .order("updated_at", { ascending: false });
      // remove caracteres que quebram a sintaxe do filtro do PostgREST
      const term = q.replace(/[,()%*\\]/g, " ").trim();
      if (term) {
        query = query.or(`title.ilike.%${term}%,content.ilike.%${term}%`);
      }
      const { data } = await query;
      setEntries(data ?? []);
      setLoading(false);
      return data ?? [];
    },
    [supabase],
  );

  useEffect(() => {
    load().then((data) => {
      if (data.length) {
        setSelectedId(data[0].id);
        setDraft(data[0]);
      }
    });
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const persist = useCallback(
    async (entry: Entry) => {
      setSave("saving");
      const { error } = await supabase
        .from("entries")
        .update({ title: entry.title, content: entry.content, entry_date: entry.entry_date })
        .eq("id", entry.id);
      setSave(error ? "error" : "saved");
      if (!error) {
        setEntries((list) => list.map((e) => (e.id === entry.id ? { ...e, ...entry } : e)));
      }
    },
    [supabase],
  );

  function updateDraft(patch: Partial<Entry>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSave("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(next), 1000);
  }

  async function flush() {
    if (saveTimer.current && draft && save === "dirty") {
      clearTimeout(saveTimer.current);
      await persist(draft);
    }
  }

  async function select(entry: Entry) {
    await flush();
    setSelectedId(entry.id);
    setDraft(entry);
    setSidebarOpen(false);
  }

  async function createEntry() {
    await flush();
    const { data, error } = await supabase
      .from("entries")
      .insert({ title: "", content: "" })
      .select("id,title,content,entry_date,updated_at")
      .single();
    if (error || !data) return;
    setEntries((list) => [data, ...list]);
    setSelectedId(data.id);
    setDraft(data);
    setMode("edit");
    setSidebarOpen(false);
  }

  async function deleteEntry() {
    if (!draft || !confirm("Apagar esta entrada? Não dá para desfazer.")) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await supabase.from("entries").delete().eq("id", draft.id);
    const rest = entries.filter((e) => e.id !== draft.id);
    setEntries(rest);
    setSelectedId(rest[0]?.id ?? null);
    setDraft(rest[0] ?? null);
    setSave("saved");
  }

  const uploadImage = useCallback(
    async (file: File) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("diary-images").upload(path, file);
      if (error) {
        alert("Falha ao enviar imagem: " + error.message);
        return null;
      }
      return supabase.storage.from("diary-images").getPublicUrl(path).data.publicUrl;
    },
    [supabase],
  );

  async function exportZip() {
    await flush();
    const { data } = await supabase
      .from("entries")
      .select("title,content,entry_date")
      .order("entry_date");
    const zip = new JSZip();
    const used = new Set<string>();
    (data ?? []).forEach((e) => {
      let name = `${e.entry_date} ${slug(e.title)}`;
      let n = 2;
      while (used.has(name)) name = `${e.entry_date} ${slug(e.title)}-${n++}`;
      used.add(name);
      const body = `---\ndate: ${e.entry_date}\ntitle: "${(e.title || "").replace(/"/g, '\\"')}"\n---\n\n${e.content}`;
      zip.file(`${name}.md`, body);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `diario-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        setMode((m) => (m === "edit" ? "preview" : "edit"));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const saveLabel = { saved: "Salvo", dirty: "Editando…", saving: "Salvando…", error: "Erro ao salvar" }[save];

  return (
    <div className="flex min-h-[calc(100vh-57px)]">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "flex" : "hidden"} fixed inset-0 top-[57px] z-20 w-full flex-col border-r border-line bg-surface md:static md:flex md:w-72`}
      >
        <div className="flex gap-2 p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="input flex-1"
          />
          <button onClick={createEntry} className="btn-primary px-3" title="Nova entrada">
            +
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-3">
          {loading && <li className="px-3 py-2 text-sm text-muted">Carregando…</li>}
          {!loading && entries.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              {search ? "Nada encontrado." : "Nenhuma entrada ainda."}
            </li>
          )}
          {entries.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => select(e)}
                className={`w-full rounded-md px-3 py-2 text-left transition ${
                  e.id === selectedId ? "bg-accent-soft" : "hover:bg-hover"
                }`}
              >
                <div className="truncate text-sm font-medium">{e.title || "Sem título"}</div>
                <div className="text-xs text-muted">{formatDate(e.entry_date)}</div>
              </button>
            </li>
          ))}
        </ul>
        <button onClick={exportZip} className="m-3 text-sm text-muted hover:text-fg">
          ⬇ Exportar tudo (.md)
        </button>
      </aside>

      {/* Editor */}
      <section className="flex-1 px-4 py-6 md:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center gap-3 text-sm">
            <button onClick={() => setSidebarOpen(true)} className="btn-ghost md:hidden">
              ☰ Entradas
            </button>
            {draft && (
              <>
                <input
                  type="date"
                  value={draft.entry_date}
                  onChange={(e) => updateDraft({ entry_date: e.target.value })}
                  className="rounded-md border border-line bg-transparent px-2 py-1 text-muted"
                />
                <span className={`text-xs ${save === "error" ? "text-red-500" : "text-muted"}`}>
                  {saveLabel}
                </span>
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
                    className="btn-ghost"
                    title="Ctrl/⌘ + E"
                  >
                    {mode === "edit" ? "👁 Visualizar" : "✎ Editar"}
                  </button>
                  <button onClick={deleteEntry} className="btn-ghost text-red-500">
                    Apagar
                  </button>
                </div>
              </>
            )}
          </div>

          {draft ? (
            <>
              <input
                value={draft.title}
                onChange={(e) => updateDraft({ title: e.target.value })}
                placeholder="Título"
                className="mb-2 w-full bg-transparent text-3xl font-bold outline-none placeholder:text-muted"
              />
              {mode === "edit" ? (
                <MarkdownEditor
                  key={draft.id}
                  value={draft.content}
                  onChange={(content) => updateDraft({ content })}
                  onImage={uploadImage}
                  dark={dark}
                />
              ) : (
                <div className="py-3">
                  <MarkdownPreview content={draft.content} />
                </div>
              )}
            </>
          ) : (
            !loading && (
              <div className="py-24 text-center text-muted">
                <p className="mb-4">Seu diário está vazio.</p>
                <button onClick={createEntry} className="btn-primary">
                  Escrever a primeira entrada
                </button>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
