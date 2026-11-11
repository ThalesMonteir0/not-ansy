# not-ansy

Diário em Markdown (estilo Obsidian) + acervo de livros e filmes a partir de links.

## Como rodar

1. Crie um projeto grátis em https://supabase.com
2. No painel: **SQL Editor** → cole e execute `supabase/migrations/0001_init.sql`
3. **Authentication → URL Configuration**: adicione `http://localhost:3000/auth/callback` em *Redirect URLs*
4. Copie `.env.local.example` para `.env.local` e preencha URL e anon key (Project Settings → API)
5. `npm install && npm run dev` → http://localhost:3000

## Como os dados são salvos

- **Diário**: cada entrada é uma linha em `entries`, com o **Markdown cru** na coluna `content`
  (autosave 1s após parar de digitar; Ctrl/⌘+S força). Imagens coladas/arrastadas vão para o
  bucket `diary-images` do Supabase Storage. "Exportar tudo" baixa um .zip de arquivos `.md`
  com front-matter — dá para abrir direto como vault no Obsidian.
- **Acervo**: `library_items`. Ao colar um link, `/api/unfurl` lê as tags Open Graph da página
  (título, capa, descrição, site) no servidor e sugere se é livro ou filme. Tudo pode ser
  editado antes de salvar — alguns sites (ex.: Amazon) às vezes bloqueiam a leitura.
- RLS garante que cada usuário só vê os próprios dados.

## Atalhos
- Ctrl/⌘ + E — alterna editar/visualizar
- Ctrl/⌘ + S — salva na hora
