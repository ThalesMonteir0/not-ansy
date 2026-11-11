"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Kind = "book" | "movie" | "other";
type Status = "quero" | "andamento" | "concluido";

type Item = {
  id: string;
  url: string;
  kind: Kind;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  status: Status;
  rating: number | null;
  notes: string | null;
  created_at: string;
};

type Draft = Omit<Item, "id" | "created_at">;

const KIND_LABEL: Record<Kind, string> = { book: "Livro", movie: "Filme", other: "Outro" };
const STATUS_LABEL: Record<Status, string> = {
  quero: "Quero ver/ler",
  andamento: "Em andamento",
  concluido: "Concluído",
};

export default function Library() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);

  useEffect(() => {
    supabase
      .from("library_items")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems(data ?? []);
        setLoading(false);
      });
  }, [supabase]);

  async function fetchLink(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setFetching(true);
    setError(null);
    const res = await fetch("/api/unfurl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link }),
    });
    const data = await res.json();
    setFetching(false);
    const base: Draft = {
      url: link.trim(),
      kind: "other",
      title: "",
      description: null,
      image_url: null,
      site_name: null,
      status: "quero",
      rating: null,
      notes: null,
    };
    if (!res.ok) {
      // ainda deixa preencher manualmente
      setError(`${data.error ?? "Não consegui ler o link"} — preencha manualmente.`);
      setDraft(base);
    } else {
      setDraft({ ...base, ...data });
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const { data, error } = await supabase.from("library_items").insert(draft).select().single();
    if (error) return setError(error.message);
    setItems((list) => [data, ...list]);
    setDraft(null);
    setLink("");
    setError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const { id, url, kind, title, description, image_url, site_name, status, rating, notes } = editing;
    const patch = { url, kind, title, description, image_url, site_name, status, rating, notes };
    const { error } = await supabase.from("library_items").update(patch).eq("id", id);
    if (error) return alert(error.message);
    setItems((list) => list.map((i) => (i.id === id ? editing : i)));
    setEditing(null);
  }

  async function remove(item: Item) {
    if (!confirm(`Remover "${item.title}" do acervo?`)) return;
    await supabase.from("library_items").delete().eq("id", item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
    setEditing(null);
  }

  const visible = items.filter(
    (i) =>
      (kindFilter === "all" || i.kind === kindFilter) &&
      (statusFilter === "all" || i.status === statusFilter),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <form onSubmit={fetchLink} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Cole o link de um livro ou filme (IMDb, Letterboxd, Goodreads, Amazon…)"
          className="input flex-1"
        />
        <button className="btn-primary" disabled={fetching}>
          {fetching ? "Buscando…" : "Adicionar"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      {draft && (
        <ItemForm
          value={draft}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
          onSave={saveDraft}
          onCancel={() => {
            setDraft(null);
            setError(null);
          }}
          saveLabel="Salvar no acervo"
        />
      )}

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(["all", "book", "movie", "other"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`chip ${kindFilter === k ? "chip-on" : ""}`}
          >
            {k === "all" ? "Todos" : KIND_LABEL[k] + "s"}
          </button>
        ))}
        <span className="mx-1 border-l border-line" />
        {(["all", "quero", "andamento", "concluido"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`chip ${statusFilter === s ? "chip-on" : ""}`}
          >
            {s === "all" ? "Qualquer status" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-muted">
          {items.length ? "Nada com esses filtros." : "Seu acervo está vazio. Cole um link acima."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visible.map((item) => (
            <li key={item.id}>
              <button onClick={() => setEditing(item)} className="group w-full text-left">
                <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-surface">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">
                      {item.title}
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
                    {KIND_LABEL[item.kind]}
                  </span>
                  {item.status === "concluido" && (
                    <span className="absolute right-2 top-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] text-white">
                      ✓
                    </span>
                  )}
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-medium">{item.title}</div>
                <div className="text-xs text-muted">
                  {item.rating ? "★".repeat(item.rating) + " · " : ""}
                  {item.site_name}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-bg sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ItemForm
              value={editing}
              onChange={(patch) => setEditing({ ...editing, ...patch })}
              onSave={saveEdit}
              onCancel={() => setEditing(null)}
              onDelete={() => remove(editing)}
              saveLabel="Salvar"
            />
          </div>
        </div>
      )}
    </main>
  );
}

function ItemForm({
  value,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saveLabel,
}: {
  value: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:flex-row">
      <div className="w-32 shrink-0 self-center sm:self-start">
        <div className="aspect-[2/3] overflow-hidden rounded-lg border border-line bg-bg">
          {value.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.image_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 text-sm">
        <input
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Título"
          className="input text-base font-medium"
        />
        <input
          value={value.image_url ?? ""}
          onChange={(e) => onChange({ image_url: e.target.value || null })}
          placeholder="URL da imagem/capa"
          className="input"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={value.kind}
            onChange={(e) => onChange({ kind: e.target.value as Kind })}
            className="input"
          >
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select
            value={value.status}
            onChange={(e) => onChange({ status: e.target.value as Status })}
            className="input"
          >
            {Object.entries(STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select
            value={value.rating ?? ""}
            onChange={(e) => onChange({ rating: e.target.value ? Number(e.target.value) : null })}
            className="input"
          >
            <option value="">Sem nota</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{"★".repeat(n)}</option>
            ))}
          </select>
        </div>
        {value.description && <p className="line-clamp-3 text-muted">{value.description}</p>}
        <textarea
          value={value.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value || null })}
          placeholder="Suas anotações (Markdown)"
          rows={3}
          className="input"
        />
        <a href={value.url} target="_blank" rel="noreferrer" className="truncate text-xs text-accent hover:underline">
          {value.url}
        </a>
        <div className="mt-1 flex gap-2">
          <button onClick={onSave} className="btn-primary" disabled={!value.title.trim()}>
            {saveLabel}
          </button>
          <button onClick={onCancel} className="btn-ghost">Cancelar</button>
          {onDelete && (
            <button onClick={onDelete} className="btn-ghost ml-auto text-red-500">Remover</button>
          )}
        </div>
      </div>
    </div>
  );
}
