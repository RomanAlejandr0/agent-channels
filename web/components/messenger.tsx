"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowUp,
  CheckCheck,
  ChevronDown,
  Hash,
  LogOut,
  MoreHorizontal,
  Plus,
  Reply,
  Search,
  Settings,
  Users,
  Plug,
  Pause,
  Play,
  Copy,
  Trash2,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  api,
  initials,
  type User,
  type Channel,
  type Agent,
  type Message,
  type Members,
  type Person,
} from "@/lib/api";
import { AuthScreen } from "./auth-screen";
type Session = { user: User; csrf: string };
type Modal =
  "channel" | "members" | "invite" | "connections" | "activity" | null;
type Draft = {
  text: string;
  operation: string;
  reply?: Message;
  mention: string;
};
const emptyMembers: Members = { humans: [], agents: [] };
const newDraft = (): Draft => ({
  text: "",
  operation: crypto.randomUUID(),
  mention: "",
});
function PersonAvatar({ name }: { name: string }) {
  return (
    <Avatar className="size-10 shrink-0">
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
function ModalFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {title} del espacio privado.
        </DialogDescription>
      </DialogHeader>
      {children}
    </>
  );
}
export function Messenger() {
  const [boot, setBoot] = useState<
      "loading" | "setup" | "login" | "invite" | "ready"
    >("loading"),
    [session, setSession] = useState<Session | null>(null),
    [invite, setInvite] = useState<string>(),
    [authorization, setAuthorization] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]),
    [agents, setAgents] = useState<Agent[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [members, setMembers] = useState<Members>(emptyMembers),
    [messages, setMessages] = useState<Message[]>([]),
    [query, setQuery] = useState(""),
    [mobileChannels, setMobileChannels] = useState(false),
    [modal, setModal] = useState<Modal>(null),
    [busy, setBusy] = useState(false),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [secret, setSecret] = useState<{ title: string; text: string } | null>(
      null,
    ),
    [people, setPeople] = useState<Person[]>([]),
    [activity, setActivity] = useState<
      { seq: number; action: string; created_at: string }[]
    >([]),
    [hasOlder, setHasOlder] = useState(false);
  const box = useRef<HTMLDivElement>(null),
    sessionRef = useRef(session),
    selectedRef = useRef(selected);
  sessionRef.current = session;
  selectedRef.current = selected;
  const channel = channels.find((c) => c.id === selected),
    draft = selected ? drafts[selected] : undefined,
    admin = session?.user.role === "admin";
  const request = useCallback(
    <T,>(path: string, method = "GET", body?: unknown) =>
      api<T>(path, { method, body, csrf: sessionRef.current?.csrf }),
    [],
  );
  const report = (error: unknown) =>
    toast.error(
      error instanceof Error
        ? error.message
        : "No se pudo completar la solicitud.",
    );
  const refresh = useCallback(async () => {
    const [c, a] = await Promise.all([
      request<Channel[]>("/channels"),
      request<Agent[]>("/agents"),
    ]);
    setChannels(c);
    setAgents(a);
    setSelected((old) =>
      c.some((ch) => ch.id === old) ? old : c[0]?.id || null,
    );
  }, [request]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const params = new URLSearchParams(location.search);
        setAuthorization(params.get("authorization"));
        const token = params.get("invite");
        setInvite(token || undefined);
        const status = await api<{ needs_setup: boolean }>("/status");
        if (!alive) return;
        if (status.needs_setup) {
          setBoot("setup");
          return;
        }
        if (token) {
          setBoot("invite");
          return;
        }
        try {
          const me = await api<Session>("/me");
          if (alive) {
            setSession(me);
            setBoot("ready");
          }
        } catch {
          if (alive) setBoot("login");
        }
      } catch (error) {
        if (alive) {
          setBoot("login");
          report(error);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (session) refresh().catch(report);
  }, [session, refresh]);
  useEffect(() => {
    if (!selected || !session) return;
    let alive = true;
    const cid = selected;
    setMessages([]);
    setMembers(emptyMembers);
    setDrafts((old) => (old[cid] ? old : { ...old, [cid]: newDraft() }));
    (async () => {
      try {
        const [m, p] = await Promise.all([
          request<Message[]>(`/channels/${cid}/messages`),
          request<Members>(`/channels/${cid}/members`),
        ]);
        if (alive) {
          setMessages(m);
          setMembers(p);
          setHasOlder(m.length === 100);
          requestAnimationFrame(() => {
            if (box.current) box.current.scrollTop = box.current.scrollHeight;
          });
        }
      } catch (e) {
        if (alive) report(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selected, session, request]);
  useEffect(() => {
    if (!selected || !session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const cid = selected;
    async function poll() {
      try {
        if (document.visibilityState === "visible") {
          const [latest, c, p] = await Promise.all([
            request<Message[]>(`/channels/${cid}/messages`),
            request<Channel[]>("/channels"),
            request<Members>(`/channels/${cid}/members`),
          ]);
          if (cancelled || selectedRef.current !== cid) return;
          const nearBottom = box.current
            ? box.current.scrollHeight -
                box.current.scrollTop -
                box.current.clientHeight <
              100
            : true;
          setMessages((old) => {
            const map = new Map(old.map((m) => [m.id, m]));
            latest.forEach((m) => map.set(m.id, m));
            return [...map.values()].sort(
              (a, b) => Number(a.seq) - Number(b.seq),
            );
          });
          setChannels(c);
          setMembers(p);
          if (!c.some((ch) => ch.id === cid)) setSelected(c[0]?.id || null);
          if (nearBottom)
            requestAnimationFrame(() => {
              if (box.current) box.current.scrollTop = box.current.scrollHeight;
            });
        }
      } catch {
        /* foreground operations surface errors */
      } finally {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    }
    timer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selected, session, request]);
  function updateDraft(patch: Partial<Draft>) {
    if (selected)
      setDrafts((old) => ({
        ...old,
        [selected]: {
          ...(old[selected] || newDraft()),
          ...patch,
          operation: crypto.randomUUID(),
        },
      }));
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function openModal(value: Modal) {
    setModal(value);
    try {
      if (value === "members") {
        const [allAgents, allPeople] = await Promise.all([
          request<Agent[]>("/agents"),
          admin ? request<Person[]>("/people") : Promise.resolve([]),
        ]);
        setAgents(allAgents);
        setPeople(allPeople);
      }
      if (value === "connections") setAgents(await request<Agent[]>("/agents"));
      if (value === "activity") setActivity(await request("/audit"));
    } catch (e) {
      report(e);
    }
  }
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!channel || !draft?.text.trim() || busy) return;
    await action(async () => {
      const sent = await request<Message>("/messages", "POST", {
        channel_id: channel.id,
        body: draft.text,
        operation_id: draft.operation,
        mentions: draft.mention ? [draft.mention] : [],
        ...(draft.reply ? { reply_to: draft.reply.id } : {}),
      });
      setMessages((old) =>
        old.some((m) => m.id === sent.id)
          ? old
          : [
              ...old,
              {
                ...sent,
                author: session!.user.name,
                author_type: "human",
                recipients: members.agents.filter((a) => !a.revoked).length,
                received: 0,
              },
            ],
      );
      setDrafts((old) => ({ ...old, [channel.id]: newDraft() }));
      requestAnimationFrame(() => {
        if (box.current) box.current.scrollTop = box.current.scrollHeight;
      });
    });
  }
  async function loadOlder() {
    if (!channel || !messages.length) return;
    await action(async () => {
      const older = await request<Message[]>(
        `/channels/${channel.id}/messages?before=${messages[0].seq}`,
      );
      setMessages((old) => [...older, ...old]);
      setHasOlder(older.length === 100);
    });
  }
  async function changePermission(aid: string, permission: string) {
    if (!channel) return;
    await action(async () => {
      await request(`/channels/${channel.id}/agents`, "PUT", {
        agent_id: aid,
        permission,
      });
      setMembers(await request(`/channels/${channel.id}/members`));
      toast.success("Permiso actualizado");
    });
  }
  async function changePerson(uid: string, remove: boolean) {
    if (!channel) return;
    await action(async () => {
      await request(`/channels/${channel.id}/people`, "PUT", {
        user_id: uid,
        remove,
      });
      setMembers(await request(`/channels/${channel.id}/members`));
    });
  }
  function login(user: User, csrf: string) {
    setSession({ user, csrf });
    setBoot("ready");
  }
  if (boot === "loading")
    return (
      <main className="loading-state" aria-label="Cargando">
        Canales
        <span className="loading-dot" />
      </main>
    );
  if (boot !== "ready" || !session)
    return (
      <>
        <AuthScreen
          mode={
            boot === "setup" ? "setup" : boot === "invite" ? "invite" : "login"
          }
          invite={invite}
          onLogin={login}
        />
        <Toaster theme="dark" />
      </>
    );
  if (authorization)
    return (
      <>
        <Consent
          requestId={authorization}
          request={request}
          onBack={() => {
            setAuthorization(null);
            history.replaceState(null, "", "/");
          }}
        />
        <Toaster theme="dark" />
      </>
    );
  const filtered = channels.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="messenger-shell">
      <aside
        className={`channel-sidebar ${mobileChannels ? "mobile-open" : ""}`}
      >
        <header className="sidebar-header">
          <h1>Canales</h1>
          {admin ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Crear canal"
              onClick={() => setModal("channel")}
            >
              <Plus />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="mobile-only"
            aria-label="Cerrar canales"
            onClick={() => setMobileChannels(false)}
          >
            <ArrowLeft />
          </Button>
        </header>
        <div className="search-wrap">
          <Search size={17} />
          <Input
            aria-label="Buscar canales"
            placeholder="Buscar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <nav aria-label="Canales" className="channel-list">
          {filtered.map((c) => (
            <button
              key={c.id}
              className={`channel-row ${c.id === selected ? "selected" : ""}`}
              onClick={() => {
                setSelected(c.id);
                setMobileChannels(false);
              }}
            >
              <Hash size={19} />
              <span>{c.name}</span>
              {c.paused ? <Pause size={12} className="muted-icon" /> : null}
            </button>
          ))}
          {!filtered.length ? (
            <p className="channel-empty">
              {query ? "Sin resultados" : "Sin canales"}
            </p>
          ) : null}
        </nav>
        <footer className="sidebar-account">
          <PersonAvatar name={session.user.name} />
          <span>{session.user.name}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Ajustes" />
              }
            >
              <Settings size={18} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end">
              <DropdownMenuItem onClick={() => openModal("connections")}>
                <Plug />
                Conexiones
              </DropdownMenuItem>
              {admin ? (
                <DropdownMenuItem onClick={() => openModal("activity")}>
                  Actividad
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  action(async () => {
                    await request("/logout", "POST", {});
                    setSession(null);
                    setBoot("login");
                  })
                }
              >
                <LogOut />
                Salir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </footer>
      </aside>
      <main className="conversation">
        <header className="conversation-header">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-only"
            aria-label="Abrir canales"
            onClick={() => setMobileChannels(true)}
          >
            <ArrowLeft />
          </Button>
          <h2>
            {channel ? (
              <>
                <Hash size={22} />
                {channel.name}
              </>
            ) : (
              "Canales"
            )}
          </h2>
          {channel ? (
            <>
              <Button
                variant="ghost"
                className="member-shortcut"
                aria-label="Participantes"
                onClick={() => openModal("members")}
              >
                <Users size={18} />
                <span>
                  {members.humans.length +
                    members.agents.filter((a) => !a.revoked).length}
                </span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Opciones del canal"
                    />
                  }
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openModal("members")}>
                    <Users />
                    Participantes
                  </DropdownMenuItem>
                  {admin ? (
                    <DropdownMenuItem onClick={() => setModal("invite")}>
                      Invitar a una persona
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => openModal("connections")}>
                    <Plug />
                    Conexiones
                  </DropdownMenuItem>
                  {admin ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          action(async () => {
                            await request(
                              `/channels/${channel.id}/pause`,
                              "PUT",
                              { paused: !channel.paused },
                            );
                            await refresh();
                          })
                        }
                      >
                        {channel.paused ? <Play /> : <Pause />}
                        {channel.paused ? "Reanudar canal" : "Pausar canal"}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
        </header>
        {!channel ? (
          <div className="empty-conversation">
            <Hash size={32} />
            {admin ? (
              <Button variant="outline" onClick={() => setModal("channel")}>
                Crear canal
              </Button>
            ) : (
              <p>Sin canales</p>
            )}
          </div>
        ) : (
          <>
            <div
              className="message-scroll"
              ref={box}
              role="log"
              aria-label="Mensajes"
              aria-live="polite"
            >
              {hasOlder ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="history-button"
                  disabled={busy}
                  onClick={loadOlder}
                >
                  Mensajes anteriores
                </Button>
              ) : null}
              {messages.map((m) => (
                <article
                  key={m.id}
                  id={`message-${m.id}`}
                  className="message-row"
                >
                  <PersonAvatar name={m.author || "…"} />
                  <div className="message-main">
                    <div className="message-heading">
                      <strong>{m.author}</strong>
                      <time dateTime={m.created_at}>
                        {new Date(m.created_at).toLocaleTimeString("es-MX", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    {m.reply_to ? (
                      <button
                        className="message-quote"
                        onClick={() =>
                          document
                            .getElementById(`message-${m.reply_to}`)
                            ?.scrollIntoView({
                              block: "center",
                              behavior: "smooth",
                            })
                        }
                      >
                        {messages
                          .find((p) => p.id === m.reply_to)
                          ?.body.slice(0, 110) || "Mensaje anterior"}
                      </button>
                    ) : null}
                    <p>{m.body}</p>
                    <div className="message-tools">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Responder a ${m.author}`}
                        onClick={() => updateDraft({ reply: m })}
                      >
                        <Reply size={15} />
                      </Button>
                      {m.received > 0 ? (
                        <span title={`${m.received}/${m.recipients} recibidos`}>
                          <CheckCheck size={14} />
                        </span>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <form className="composer-wrap" onSubmit={send}>
              {draft?.reply ? (
                <div className="reply-draft">
                  <span>
                    ↳ {draft.reply.author}: {draft.reply.body.slice(0, 100)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => updateDraft({ reply: undefined })}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : null}
              <div className="composer">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Mencionar agente"
                        type="button"
                      />
                    }
                  >
                    <span className="at-icon">@</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top">
                    <DropdownMenuItem
                      onClick={() => updateDraft({ mention: "" })}
                    >
                      Sin mención
                    </DropdownMenuItem>
                    {members.agents
                      .filter((a) => !a.revoked)
                      .map((a) => (
                        <DropdownMenuItem
                          key={a.id}
                          onClick={() => updateDraft({ mention: a.id })}
                        >
                          {a.name}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Textarea
                  name="message"
                  aria-label="Mensaje"
                  placeholder={
                    channel.paused
                      ? "Canal pausado"
                      : `Mensaje en #${channel.name}`
                  }
                  value={draft?.text || ""}
                  onChange={(e) => updateDraft({ text: e.target.value })}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  maxLength={8000}
                  disabled={channel.paused || busy}
                />
                <Button
                  className="send-button"
                  type="submit"
                  size="icon"
                  aria-label="Enviar mensaje"
                  disabled={busy || channel.paused || !draft?.text.trim()}
                >
                  <ArrowUp size={20} />
                </Button>
              </div>
              {draft?.mention ? (
                <button
                  type="button"
                  className="mention-draft"
                  onClick={() => updateDraft({ mention: "" })}
                >
                  @{members.agents.find((a) => a.id === draft.mention)?.name} ×
                </button>
              ) : null}
            </form>
          </>
        )}
      </main>
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
      >
        <DialogContent className="control-dialog">
          {modal === "channel" ? (
            <ModalFrame title="Crear canal">
              <SimpleForm
                busy={busy}
                submitLabel="Crear canal"
                fields={[
                  {
                    name: "name",
                    label: "Nombre del canal",
                    required: true,
                    maxLength: 80,
                  },
                  { name: "description", label: "Descripción", maxLength: 400 },
                ]}
                onSubmit={(data) =>
                  action(async () => {
                    const c = await request<Channel>("/channels", "POST", data);
                    await refresh();
                    setSelected(c.id);
                    setModal(null);
                  })
                }
              />
            </ModalFrame>
          ) : null}
          {modal === "invite" ? (
            <ModalFrame title="Invitar a una persona">
              <p className="quiet">Podrá leer el historial del canal.</p>
              <SimpleForm
                busy={busy}
                submitLabel="Crear invitación"
                fields={[
                  {
                    name: "email",
                    label: "Correo electrónico",
                    type: "email",
                    required: true,
                  },
                ]}
                onSubmit={(data) =>
                  action(async () => {
                    const result = await request<{ url: string }>(
                      "/invites",
                      "POST",
                      { ...data, channel_id: selected },
                    );
                    setModal(null);
                    setSecret({ title: "Invitación creada", text: result.url });
                  })
                }
              />
            </ModalFrame>
          ) : null}
          {modal === "members" ? (
            <ModalFrame title="Participantes">
              <div className="control-list">
                {(admin ? people : members.humans).map((p) => {
                  const joined = members.humans.some((h) => h.id === p.id);
                  return (
                    <div key={p.id} className="control-row">
                      <PersonAvatar name={p.name} />
                      <div className="control-name">{p.name}</div>
                      {admin && p.id !== session.user.id ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => changePerson(p.id, joined)}
                        >
                          {joined ? "Quitar" : "Añadir"}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
                {(admin ? agents : members.agents)
                  .filter((a) => !a.revoked)
                  .map((a) => (
                    <div key={a.id} className="control-row">
                      <PersonAvatar name={a.name} />
                      <div className="control-name">
                        {a.name}
                        <span>{a.owner_name}</span>
                      </div>
                      {admin ? (
                        <select
                          aria-label={`Permiso de ${a.name}`}
                          className="native-select"
                          value={
                            members.agents.find((m) => m.id === a.id)
                              ?.permission || "none"
                          }
                          disabled={busy}
                          onChange={(e) =>
                            changePermission(a.id, e.target.value)
                          }
                        >
                          <option value="none">Sin acceso</option>
                          <option value="read">Solo lectura</option>
                          <option value="write">Leer y escribir</option>
                        </select>
                      ) : null}
                    </div>
                  ))}
              </div>
            </ModalFrame>
          ) : null}
          {modal === "connections" ? (
            <ModalFrame title="Conexiones">
              <SimpleForm
                busy={busy}
                submitLabel="Registrar agente"
                fields={[
                  {
                    name: "name",
                    label: "Nombre del agente",
                    required: true,
                    maxLength: 80,
                  },
                ]}
                onSubmit={(data) =>
                  action(async () => {
                    await request("/agents", "POST", data);
                    await refresh();
                  })
                }
              />
              <div className="control-list">
                {agents.map((a) => (
                  <div key={a.id} className="connection-row">
                    <div className="control-row">
                      <PersonAvatar name={a.name} />
                      <div className="control-name">
                        {a.name}
                        <span>{a.revoked ? "Revocado" : a.owner_name}</span>
                      </div>
                      {!a.revoked ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Revocar ${a.name}`}
                          onClick={() => {
                            if (
                              confirm(
                                `¿Revocar todas las conexiones de ${a.name}?`,
                              )
                            )
                              action(async () => {
                                await request(`/agents/${a.id}`, "DELETE", {});
                                await refresh();
                              });
                          }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      ) : null}
                    </div>
                    {!a.revoked && a.owner_id === session.user.id ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            const result = await request<{
                              access_token: string;
                            }>(`/agents/${a.id}/token`, "POST", {});
                            setModal(null);
                            setSecret({
                              title: `Conectar ${a.name}`,
                              text: result.access_token,
                            });
                          })
                        }
                      >
                        Generar credencial
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="quiet break-all">
                {typeof location !== "undefined" ? location.origin : ""}/mcp
              </p>
            </ModalFrame>
          ) : null}
          {modal === "activity" ? (
            <ModalFrame title="Actividad">
              <div className="control-list">
                {activity.map((a) => (
                  <div key={a.seq} className="audit-row">
                    <span>{a.action}</span>
                    <time>
                      {new Date(a.created_at).toLocaleString("es-MX")}
                    </time>
                  </div>
                ))}
              </div>
            </ModalFrame>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!secret}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
      >
        <DialogContent>
          <ModalFrame title={secret?.title || ""}>
            <p className="quiet">
              Se muestra una sola vez. Guárdala de forma privada.
            </p>
            <pre className="secret-text">{secret?.text}</pre>
            <Button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret?.text || "");
                  toast.success("Copiado");
                } catch (e) {
                  report(e);
                }
              }}
            >
              <Copy size={15} />
              Copiar
            </Button>
          </ModalFrame>
        </DialogContent>
      </Dialog>
      <Toaster theme="dark" position="bottom-center" />
    </div>
  );
}
function SimpleForm({
  fields,
  busy,
  submitLabel,
  onSubmit,
}: {
  fields: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    maxLength?: number;
  }[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (data: Record<string, FormDataEntryValue>) => Promise<void>;
}) {
  return (
    <form
      className="simple-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await onSubmit(Object.fromEntries(new FormData(form)));
        form.reset();
      }}
    >
      {fields.map((f) => (
        <label key={f.name}>
          {f.label}
          <Input
            name={f.name}
            type={f.type || "text"}
            required={f.required}
            maxLength={f.maxLength}
          />
        </label>
      ))}
      <Button disabled={busy} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
function Consent({
  requestId,
  request,
  onBack,
}: {
  requestId: string;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  onBack: () => void;
}) {
  const [data, setData] = useState<{
      client_name: string;
      redirect_uri: string;
      agents: Agent[];
    } | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    request<typeof data>("/authorization/" + requestId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [requestId, request]);
  async function decide(deny = false) {
    setBusy(true);
    try {
      const result = await request<{ redirect: string }>(
        "/authorization/" + requestId,
        "POST",
        deny ? { deny: true } : { agent_id: selected },
      );
      location.assign(result.redirect);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-form">
        <h1>Conectar {data?.client_name || "cliente"}</h1>
        {data ? (
          <>
            <p className="quiet break-all">{data.redirect_uri}</p>
            <label>
              Agente
              <select
                className="native-select w-full"
                aria-label="Agente a conectar"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Seleccionar agente</option>
                {data.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            {!data.agents.length ? (
              <Button variant="outline" onClick={onBack}>
                Registrar un agente
              </Button>
            ) : null}
            <Button disabled={!selected || busy} onClick={() => decide()}>
              Autorizar conexión
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => decide(true)}
            >
              Denegar
            </Button>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
