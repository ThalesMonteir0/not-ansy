"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Nav() {
  const path = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as "light" | "dark" | null;
      if (saved) setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const isDark =
      theme === "dark" ||
      (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (path.startsWith("/login")) return null;

  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        path.startsWith(href) ? "bg-accent-soft font-medium" : "text-muted hover:bg-hover"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 flex h-[57px] items-center gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur">
      <span className="mr-2 font-semibold">not-ansy</span>
      {tab("/diario", "Diário")}
      {tab("/acervo", "Acervo")}
      <div className="ml-auto flex items-center gap-1">
        <button onClick={toggleTheme} className="btn-ghost" title="Alternar tema">◐</button>
        <button onClick={signOut} className="btn-ghost text-sm text-muted">Sair</button>
      </div>
    </header>
  );
}
