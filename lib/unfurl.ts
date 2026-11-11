import * as cheerio from "cheerio";
import { lookup } from "node:dns/promises";
import net from "node:net";

export type Kind = "book" | "movie" | "other";

export type Unfurled = {
  url: string;
  title: string;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  kind: Kind;
};

const MAX_REDIRECTS = 4;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 6000;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")
  );
}

/** Garante que a URL é http(s) e não aponta para a rede interna (evita SSRF). */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL inválida");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use um link http ou https");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error("Endereço não permitido");
  }
  return url;
}

async function fetchHtml(raw: string): Promise<{ html: string; finalUrl: URL }> {
  let current = raw;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // UA de navegador comum: muitos sites só entregam og:tags assim
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`O site respondeu ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new Error("O link não é uma página HTML");

    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return { html: Buffer.concat(chunks).toString("utf8"), finalUrl: url };
  }
  throw new Error("Redirecionamentos demais");
}

function guessKind(host: string, ogType: string, title: string, hasIsbn = false): Kind {
  const h = host.replace(/^www\./, "");
  const t = ogType.toLowerCase();
  if (t.startsWith("video.movie") || t.startsWith("video.tv_show")) return "movie";
  if (t.startsWith("book") || t === "books.book") return "book";
  if (/(imdb\.com|letterboxd\.com|themoviedb\.org|filmow\.com|adorocinema\.com|netflix\.com|primevideo\.com|disneyplus\.com|rottentomatoes\.com)$/.test(h))
    return "movie";
  if (/(goodreads\.com|skoob\.com\.br|openlibrary\.org|books\.google\.|amazon\.|estantevirtual\.com\.br|companhiadasletras\.com\.br)/.test(h)) {
    if (hasIsbn || /livro|book|kindle|capa (comum|dura)|paperback|hardcover|ebook/i.test(title) || !h.startsWith("amazon")) return "book";
  }
  if (hasIsbn) return "book";
  return "other";
}

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`O site respondeu ${res.status}`);
  return res.json();
}

/** Sites que bloqueiam scraping mas têm endpoints JSON públicos. */
async function special(url: URL): Promise<Unfurled | null> {
  const host = url.hostname.replace(/^(www\.|m\.)/, "");

  // IMDb: endpoint de sugestões usado pelo próprio site
  const imdb = host === "imdb.com" && url.pathname.match(/\/title\/(tt\d+)/);
  if (imdb) {
    const id = imdb[1];
    const data = await fetchJson(`https://v3.sg.media-imdb.com/suggestion/x/${id}.json`);
    const hit = data?.d?.find((d: { id: string }) => d.id === id);
    if (hit) {
      return {
        url: `https://www.imdb.com/title/${id}/`,
        title: hit.y ? `${hit.l} (${hit.y})` : hit.l,
        description: hit.s ?? null,
        image_url: hit.i?.imageUrl ?? null,
        site_name: "IMDb",
        kind: "movie",
      };
    }
  }

  // Open Library: basta adicionar .json
  const ol = host === "openlibrary.org" && url.pathname.match(/^\/(works|books)\/(OL\w+)/);
  if (ol) {
    const data = await fetchJson(`https://openlibrary.org/${ol[1]}/${ol[2]}.json`);
    const desc = typeof data.description === "string" ? data.description : data.description?.value;
    return {
      url: url.toString(),
      title: data.title,
      description: desc?.slice(0, 1000) ?? null,
      image_url: data.covers?.[0] ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg` : null,
      site_name: "Open Library",
      kind: "book",
    };
  }
  return null;
}

const BLOCKED_TITLE = /human verification|just a moment|robot check|are you a robot|captcha|access denied|attention required/i;

export async function unfurl(raw: string): Promise<Unfurled> {
  const first = await assertPublicUrl(raw.trim());
  const viaApi = await special(first).catch(() => null);
  if (viaApi) return viaApi;

  const { html, finalUrl } = await fetchHtml(raw.trim());
  const $ = cheerio.load(html);
  const meta = (...keys: string[]) => {
    for (const k of keys) {
      const v =
        $(`meta[property="${k}"]`).attr("content") ?? $(`meta[name="${k}"]`).attr("content");
      if (v?.trim()) return v.trim();
    }
    return null;
  };

  const title =
    meta("og:title", "twitter:title") ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    finalUrl.hostname;

  if (BLOCKED_TITLE.test(title) || title === finalUrl.hostname) {
    throw new Error("O site bloqueou a leitura automática");
  }

  let image =
    meta("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src") ??
    $("#landingImage").attr("data-old-hires") ?? // Amazon
    $("#imgBlkFront").attr("src") ??
    $('link[rel="image_src"]').attr("href") ??
    null;
  if (image) {
    try {
      image = new URL(image, finalUrl).toString();
    } catch {
      image = null;
    }
  }

  return {
    url: finalUrl.toString(),
    title: title.slice(0, 300),
    description: meta("og:description", "twitter:description", "description")?.slice(0, 1000) ?? null,
    image_url: image,
    site_name: meta("og:site_name") ?? finalUrl.hostname.replace(/^www\./, ""),
    kind: guessKind(finalUrl.hostname, meta("og:type") ?? "", title, /\bISBN\b/.test(html)),
  };
}
