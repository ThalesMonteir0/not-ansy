"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-4">
      <h1 className="mb-2 text-2xl font-semibold">Entrar</h1>
      <p className="mb-6 text-sm text-muted">
        Enviaremos um link mágico para o seu e-mail.
      </p>
      {status === "sent" ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm">
          Pronto! Confira sua caixa de entrada em <b>{email}</b>.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com"
            className="input"
          />
          <button className="btn-primary" disabled={status === "sending"}>
            {status === "sending" ? "Enviando…" : "Enviar link"}
          </button>
          {status === "error" && <p className="text-sm text-red-500">{message}</p>}
        </form>
      )}
    </main>
  );
}
