-- Rode no Supabase: SQL Editor → cole e execute (ou `supabase db push`)

-- ============ DIÁRIO ============
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default '',
  content text not null default '',          -- markdown cru
  entry_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_user_date_idx on public.entries (user_id, entry_date desc);
create index if not exists entries_fts_idx on public.entries
  using gin (to_tsvector('portuguese', coalesce(title,'') || ' ' || content));

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_updated_at on public.entries;
create trigger entries_updated_at before update on public.entries
  for each row execute function public.set_updated_at();

-- ============ ACERVO ============
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  kind text not null default 'other' check (kind in ('book','movie','other')),
  title text not null default '',
  description text,
  image_url text,
  site_name text,
  status text not null default 'quero' check (status in ('quero','andamento','concluido')),
  rating int check (rating between 1 and 5),
  notes text,                                 -- markdown
  created_at timestamptz not null default now()
);

create index if not exists library_user_idx on public.library_items (user_id, created_at desc);

-- ============ RLS ============
alter table public.entries enable row level security;
alter table public.library_items enable row level security;

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own library" on public.library_items;
create policy "own library" on public.library_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ STORAGE (imagens coladas no diário) ============
insert into storage.buckets (id, name, public)
values ('diary-images', 'diary-images', true)
on conflict (id) do nothing;

-- cada usuário só grava na pasta com o próprio id: diary-images/<user_id>/arquivo.png
drop policy if exists "upload own images" on storage.objects;
create policy "upload own images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own images" on storage.objects;
create policy "delete own images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'diary-images' and (storage.foldername(name))[1] = auth.uid()::text);
