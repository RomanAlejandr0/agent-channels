"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type User } from "@/lib/api";
export function AuthScreen({
  mode,
  invite,
  onLogin,
}: {
  mode: "setup" | "login" | "invite";
  invite?: string;
  onLogin: (user: User, csrf: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const create = mode !== "login";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (mode === "setup") await api("/setup", { method: "POST", body: data });
      if (mode === "invite")
        await api("/accept-invite", {
          method: "POST",
          body: { ...data, invite },
        });
      const session = await api<{ user: User; csrf: string }>("/login", {
        method: "POST",
        body: { email: data.email, password: data.password },
      });
      if (mode === "invite") history.replaceState(null, "", "/");
      onLogin(session.user, session.csrf);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <form onSubmit={submit} className="auth-form">
        <div className="auth-brand">Canales</div>
        <h1>
          {mode === "setup"
            ? "Crea tu espacio"
            : mode === "invite"
              ? "Aceptar invitación"
              : "Entrar"}
        </h1>
        {create ? (
          <label>
            Tu nombre
            <Input name="name" autoComplete="name" required maxLength={80} />
          </label>
        ) : null}
        <label>
          Correo electrónico
          <Input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Contraseña
          <Input
            name="password"
            type="password"
            autoComplete={create ? "new-password" : "current-password"}
            minLength={create ? 12 : 1}
            maxLength={256}
            required
          />
        </label>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        <Button disabled={busy} type="submit" className="w-full">
          {busy
            ? "Un momento…"
            : mode === "setup"
              ? "Crear espacio"
              : mode === "invite"
                ? "Aceptar invitación"
                : "Entrar"}
        </Button>
        {create ? (
          <p className="quiet">Contraseña de al menos 12 caracteres.</p>
        ) : null}
      </form>
    </main>
  );
}
