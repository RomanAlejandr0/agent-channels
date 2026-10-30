export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
};
export type Channel = {
  id: string;
  name: string;
  description: string;
  paused: boolean;
};
export type Agent = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  revoked: boolean;
  permission?: "read" | "write";
};
export type Person = { id: string; name: string; email?: string };
export type Message = {
  id: string;
  seq: string | number;
  author: string;
  author_type: string;
  agent_id: string | null;
  user_id: string | null;
  body: string;
  reply_to: string | null;
  created_at: string;
  recipients: number;
  received: number;
};
export type Members = { humans: Person[]; agents: Agent[] };
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    method: options.method || "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      ...(options.csrf ? { "X-CSRF-Token": options.csrf } : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No se pudo completar la solicitud.");
  return data;
}
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
