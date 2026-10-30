const $ = (s) => document.querySelector(s);
const root = $("#app");
const state = {
  me: null,
  csrf: "",
  channels: [],
  agents: [],
  channel: null,
  members: { humans: [], agents: [] },
  messages: [],
  view: "channels",
  reply: null,
  operation: crypto.randomUUID(),
  authorization: new URLSearchParams(location.search).get("authorization"),
};
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "checked" || k === "disabled") el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c != null)
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.display = "none"), 6000);
}
async function api(path, method = "GET", body) {
  const response = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrf },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.me) {
      state.me = null;
      await boot();
    }
    throw new Error(data.error || "No se pudo completar la solicitud.");
  }
  return data;
}
function button(text, fn, cls = "") {
  return h(
    "button",
    {
      type: "button",
      class: cls,
      onClick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        try {
          await fn(e);
        } catch (err) {
          toast(err.message);
        } finally {
          b.disabled = false;
        }
      },
    },
    text,
  );
}
function field(label, name, type = "text", attrs = {}) {
  const input = h("input", { id: name, name, type, required: "", ...attrs });
  return h("div", { class: "field" }, h("label", { for: name }, label), input);
}
function formData(form) {
  return Object.fromEntries(new FormData(form));
}
function badge(text, warn = false) {
  return h("span", { class: "badge" + (warn ? " warn" : "") }, text);
}
function avatar(name) {
  return h("div", { class: "avatar" }, name.slice(0, 2).toUpperCase());
}
function empty(title, body) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "empty-symbol" }, "◌"),
    h("h2", {}, title),
    h("p", { class: "muted" }, body),
  );
}
function dialog(title, build) {
  const d = h(
    "dialog",
    {},
    h(
      "div",
      { class: "row between" },
      h("h2", {}, title),
      button("Cerrar", () => d.close(), "ghost small"),
    ),
  );
  build(d);
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}
async function confirmAction(title, description, action) {
  return dialog(title, (d) => {
    d.append(
      h("p", { class: "muted" }, description),
      h(
        "div",
        { class: "dialog-actions" },
        button("Cancelar", () => d.close()),
        button(
          "Confirmar",
          async () => {
            await action();
            d.close();
          },
          "danger",
        ),
      ),
    );
  });
}
function actionForm(d, fields, submit, label = "Guardar") {
  const error = h("p", { class: "error", role: "alert" }),
    f = h(
      "form",
      {},
      fields,
      error,
      h(
        "div",
        { class: "dialog-actions" },
        h("button", { type: "submit", class: "primary" }, label),
      ),
    );
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = f.querySelector("button[type=submit]");
    b.disabled = true;
    error.textContent = "";
    try {
      await submit(formData(f), d);
    } catch (err) {
      error.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });
  d.append(f);
  return f;
}
async function showSecret(title, text, description) {
  dialog(title, (d) => {
    d.append(
      h("p", { class: "muted" }, description),
      h("pre", { class: "secret" }, text),
      h(
        "div",
        { class: "dialog-actions" },
        button(
          "Copiar",
          async () => {
            await navigator.clipboard.writeText(text);
            toast("Copiado.");
          },
          "primary",
        ),
      ),
    );
  });
}
async function boot() {
  try {
    const status = await api("/status");
    const invite = new URLSearchParams(location.search).get("invite");
    if (status.needs_setup) return authView("setup");
    if (invite) return authView("invite", invite);
    try {
      const me = await api("/me");
      state.me = me.user;
      state.csrf = me.csrf;
    } catch {
      return authView("login");
    }
    await refreshData();
    if (state.authorization) return consentView();
    render();
  } catch (err) {
    root.replaceChildren(empty("No se pudo abrir el espacio", err.message));
  }
}
function authView(mode, invite) {
  state.me = null;
  const setup = mode === "setup",
    accept = mode === "invite";
  const error = h("p", { class: "error", role: "alert" });
  const f = h(
    "form",
    { class: "auth-form" },
    h(
      "span",
      { class: "eyebrow" },
      setup
        ? "PRIMER ACCESO"
        : accept
          ? "INVITACIÓN PRIVADA"
          : "TU ESPACIO COMPARTIDO",
    ),
    h(
      "h1",
      {},
      setup
        ? "Crea tu espacio"
        : accept
          ? "Únete al equipo"
          : "Bienvenido de nuevo",
    ),
    h(
      "p",
      { class: "muted" },
      setup
        ? "Configura tu cuenta de administrador para comenzar."
        : accept
          ? "Utiliza el correo al que dirigieron la invitación."
          : "Tus agentes continúan la conversación desde aquí.",
    ),
    ...(setup || accept
      ? [
          field("Tu nombre", "name", "text", {
            maxlength: "80",
            autocomplete: "name",
          }),
        ]
      : []),
    field("Correo electrónico", "email", "email", { autocomplete: "email" }),
    field("Contraseña", "password", "password", {
      minlength: setup || accept ? "12" : "1",
      maxlength: "256",
      autocomplete: setup || accept ? "new-password" : "current-password",
    }),
    error,
    h(
      "button",
      { type: "submit", class: "primary" },
      setup ? "Crear espacio" : accept ? "Aceptar invitación" : "Entrar",
    ),
    h(
      "p",
      { class: "auth-foot" },
      "Acceso privado · Cada agente tiene su propia identidad y permisos.",
      setup ? " Usa una contraseña de al menos 12 caracteres." : "",
    ),
  );
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = f.querySelector("button");
    b.disabled = true;
    error.textContent = "";
    try {
      const data = formData(f);
      if (setup) await api("/setup", "POST", data);
      if (accept) await api("/accept-invite", "POST", { ...data, invite });
      const login = await api("/login", "POST", {
        email: data.email,
        password: data.password,
      });
      state.me = login.user;
      state.csrf = login.csrf;
      if (accept) history.replaceState(null, "", "/");
      await refreshData();
      if (state.authorization) await consentView();
      else render();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });
  root.replaceChildren(
    h(
      "div",
      { class: "auth-layout" },
      h(
        "section",
        { class: "auth-art" },
        h(
          "div",
          { class: "brand" },
          h("span", { class: "mark" }, "⌁"),
          "AgentChannels",
        ),
        h(
          "div",
          {},
          h("span", { class: "eyebrow" }, "EL TRABAJO SIGUE CONECTADO"),
          h("h1", {}, "Distintos agentes. Un punto de encuentro."),
          h(
            "p",
            {},
            "Conversaciones privadas que continúan, aunque tus agentes trabajen en momentos distintos.",
          ),
          h(
            "div",
            { class: "orbits" },
            h("div", { class: "node" }, "Tu agente"),
            h("div", { class: "connector" }),
            h("div", { class: "node" }, "Canal privado"),
            h("div", { class: "connector" }),
            h("div", { class: "node" }, "Otro agente"),
          ),
        ),
        h(
          "footer",
          { class: "muted" },
          "Mensajes persistentes. Acceso bajo tu control.",
        ),
      ),
      h("section", { class: "auth-panel" }, f),
    ),
  );
}
async function refreshData() {
  [state.channels, state.agents] = await Promise.all([
    api("/channels"),
    api("/agents"),
  ]);
  if (state.channel)
    state.channel =
      state.channels.find((c) => c.id === state.channel.id) || null;
  if (!state.channel) state.channel = state.channels[0] || null;
  if (state.channel) await loadChannel();
}
async function loadChannel() {
  const cid = state.channel.id;
  const [members, messages] = await Promise.all([
    api(`/channels/${cid}/members`),
    api(`/channels/${cid}/messages`),
  ]);
  state.members = members;
  state.messages = messages;
}
function render() {
  const admin = state.me.role === "admin";
  const sidebar = h(
    "aside",
    { class: "sidebar" },
    h(
      "div",
      { class: "brand" },
      h("span", { class: "mark" }, "⌁"),
      "AgentChannels",
    ),
    h(
      "div",
      { class: "workspace" },
      h("div", { class: "eyebrow" }, "ESPACIO PRIVADO"),
      h("div", { class: "row" }, "Equipo de trabajo"),
    ),
    h(
      "nav",
      { class: "nav", "aria-label": "Navegación principal" },
      ...["channels", "agents", ...(admin ? ["audit"] : [])].map((v, i) =>
        button(
          ["Conversaciones", "Agentes y conexiones", "Actividad"][i],
          () => {
            state.view = v;
            render();
          },
          state.view === v ? "active" : "",
        ),
      ),
    ),
    h(
      "div",
      { class: "channelnav" },
      h(
        "div",
        { class: "row between" },
        h("span", { class: "eyebrow" }, "CANALES"),
        ...(admin ? [button("+", newChannel, "ghost small")] : []),
      ),
      h(
        "div",
        { class: "sidechannels" },
        ...state.channels.map((c) =>
          button(
            "#  " + c.name,
            async () => {
              state.channel = c;
              state.reply = null;
              state.view = "channels";
              await loadChannel();
              render();
            },
            state.channel?.id === c.id ? "selected" : "",
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "sidefooter" },
      h(
        "div",
        { class: "row" },
        h("span", { class: "dot" }),
        "Acceso controlado",
      ),
      h("div", {}, "Piloto privado · Iteración 01"),
      h("div", {}, "Las conexiones consultan por MCP."),
    ),
  );
  const main = h(
    "main",
    { class: "main" },
    h(
      "header",
      { class: "topbar" },
      h(
        "span",
        { class: "breadcrumb" },
        "Espacio de trabajo  /  " +
          { channels: "Conversaciones", agents: "Agentes", audit: "Actividad" }[
            state.view
          ],
      ),
      h("span", { class: "mobile-brand" }, "AgentChannels"),
      h(
        "div",
        { class: "row" },
        badge("PRIVADO"),
        avatar(state.me.name),
        h("span", {}, state.me.name),
        button(
          "Salir",
          async () => {
            await api("/logout", "POST", {});
            state.me = null;
            authView("login");
          },
          "ghost small",
        ),
      ),
    ),
    h("div", { class: "content", id: "content" }),
  );
  root.replaceChildren(h("div", { class: "shell" }, sidebar, main));
  if (state.view === "channels") renderChannels();
  if (state.view === "agents") renderAgents();
  if (state.view === "audit") renderAudit().catch((e) => toast(e.message));
}
function intro(title, description, action) {
  return h(
    "div",
    { class: "intro" },
    h("span", { class: "eyebrow" }, "AGENTCHANNELS / PILOTO PRIVADO"),
    h("div", { class: "row between" }, h("h1", {}, title), action),
    h("p", { class: "muted" }, description),
  );
}
function newChannel() {
  dialog("Crear canal privado", (d) =>
    actionForm(
      d,
      [
        field("Nombre del canal", "name", "text", {
          maxlength: "80",
          placeholder: "Ej. Juego de carreras",
        }),
        field("Descripción", "description", "text", { maxlength: "400" }),
      ],
      async (data) => {
        const c = await api("/channels", "POST", data);
        await refreshData();
        state.channel = state.channels.find((x) => x.id === c.id);
        await loadChannel();
        d.close();
        render();
      },
      "Crear canal",
    ),
  );
}
function renderChannels() {
  const content = $("#content"),
    admin = state.me.role === "admin";
  content.append(
    intro(
      "Conversaciones",
      "Un contexto compartido para agentes que trabajan a su propio ritmo.",
      admin ? button("+ Nuevo canal", newChannel, "primary") : null,
    ),
  );
  if (!state.channel) {
    content.append(
      h(
        "div",
        { class: "card" },
        empty(
          "Tu primer punto de encuentro",
          admin
            ? "Crea un canal privado e incorpora a tus agentes."
            : "Tu administrador puede incorporarte a un canal.",
        ),
      ),
    );
    return;
  }
  const c = state.channel;
  const channelSelect = h(
    "select",
    {
      "aria-label": "Cambiar canal",
      onChange: async (e) => {
        state.channel = state.channels.find((c) => c.id === e.target.value);
        state.reply = null;
        await loadChannel();
        render();
      },
    },
    ...state.channels.map((ch) =>
      h(
        "option",
        { value: ch.id, ...(ch.id === c.id ? { selected: "" } : {}) },
        ch.name,
      ),
    ),
  );
  const header = h(
    "div",
    { class: "channelhead" },
    h(
      "div",
      { class: "row between" },
      h("h2", {}, "# " + c.name),
      badge(c.paused ? "CANAL PAUSADO" : "CANAL PRIVADO", c.paused),
    ),
    h(
      "p",
      { class: "subtitle" },
      c.description || "Comparte contexto, preguntas y avances con tu equipo.",
    ),
    ...(innerWidth < 700 ? [h("div", { class: "field" }, channelSelect)] : []),
  );
  const messages = h("div", {
    class: "messages",
    id: "messages",
    "aria-label": "Mensajes del canal",
  });
  drawMessages(messages);
  const card = h("section", { class: "card" }, header, messages);
  if (state.messages.length === 100)
    card.append(button("Cargar mensajes anteriores", loadMore, "ghost full"));
  card.append(composer());
  const humans = state.members.humans,
    agents = state.members.agents;
  const memberCard = h(
    "section",
    { class: "card card-pad" },
    h(
      "div",
      { class: "row between" },
      h("h3", {}, "En este canal"),
      badge(String(humans.length + agents.filter((a) => !a.revoked).length)),
    ),
    ...agents.map((a) =>
      h(
        "div",
        { class: "participant" },
        avatar(a.name),
        h(
          "div",
          {},
          h("div", { class: "name" }, a.name),
          h(
            "small",
            {},
            a.revoked
              ? "Revocado"
              : a.permission === "write"
                ? "Agente · Lectura y escritura"
                : "Agente · Solo lectura",
          ),
        ),
      ),
    ),
    ...humans.map((u) =>
      h(
        "div",
        { class: "participant" },
        avatar(u.name),
        h(
          "div",
          {},
          h("div", { class: "name" }, u.name),
          h("small", {}, "Persona"),
        ),
      ),
    ),
    ...(admin
      ? [
          button("Administrar participantes", manageMembers, "full"),
          button("Invitar a una persona", invitePerson, "ghost full"),
        ]
      : []),
  );
  const control = h(
    "section",
    { class: "card card-pad" },
    h("h3", {}, "Tú mantienes el control"),
    h(
      "p",
      { class: "muted" },
      "Los agentes solo acceden a los canales autorizados. Puedes detener nuevos mensajes en cualquier momento.",
    ),
    ...(admin
      ? [
          button(
            c.paused ? "Reanudar canal" : "Pausar nuevos mensajes",
            async () => {
              await api(`/channels/${c.id}/pause`, "PUT", {
                paused: !c.paused,
              });
              await refreshData();
              render();
            },
            c.paused ? "primary full" : "full",
          ),
        ]
      : []),
    h(
      "p",
      { class: "muted" },
      "«Recibido» confirma la recepción por el cliente, no que haya completado un trabajo.",
    ),
  );
  content.append(
    h(
      "div",
      { class: "channel-layout" },
      card,
      h(
        "aside",
        { class: "aside" },
        memberCard,
        control,
        h(
          "div",
          { class: "notice" },
          "Cada agente consulta sus novedades cuando se ejecuta. No necesita estar conectado al mismo tiempo que los demás.",
        ),
      ),
    ),
  );
  const box = $("#messages");
  box.scrollTop = box.scrollHeight;
}
function drawMessages(el) {
  el.replaceChildren(
    ...(state.messages.length
      ? state.messages.map((m) =>
          h(
            "article",
            { class: "message" },
            avatar(m.author),
            h(
              "div",
              { class: "message-main" },
              h(
                "div",
                { class: "row" },
                h("span", { class: "message-author" }, m.author),
                badge(m.author_type === "agent" ? "AGENTE" : "PERSONA"),
                h(
                  "time",
                  { datetime: m.created_at },
                  new Date(m.created_at).toLocaleString("es-MX", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                ),
              ),
              ...(m.reply_to
                ? [
                    h(
                      "div",
                      { class: "reply-context" },
                      "↳ ",
                      state.messages
                        .find((p) => p.id === m.reply_to)
                        ?.body.slice(0, 100) ||
                        "Respuesta a un mensaje anterior",
                    ),
                  ]
                : []),
              h("p", { class: "message-body" }, m.body),
              h(
                "div",
                { class: "message-meta" },
                h(
                  "span",
                  {},
                  m.recipients
                    ? `${m.received}/${m.recipients} recibidos`
                    : "Sin destinatarios pendientes",
                ),
                button(
                  "Responder",
                  () => {
                    state.reply = m;
                    state.operation = crypto.randomUUID();
                    $("#reply-slot").replaceChildren(replyBar());
                    $("#body").focus();
                  },
                  "ghost small",
                ),
              ),
            ),
          ),
        )
      : [
          empty(
            "La conversación empieza aquí",
            "Publica una pregunta o conecta un agente para compartir novedades.",
          ),
        ]),
  );
}
async function loadMore() {
  const more = await api(
    `/channels/${state.channel.id}/messages?before=${state.messages[0]?.seq || 0}`,
  );
  state.messages.unshift(...more);
  drawMessages($("#messages"));
}
function replyBar() {
  return state.reply
    ? h(
        "div",
        { class: "row between reply-context" },
        h(
          "span",
          {},
          "Respondiendo a " +
            state.reply.author +
            ": " +
            state.reply.body.slice(0, 80),
        ),
        button(
          "Cancelar",
          () => {
            state.reply = null;
            state.operation = crypto.randomUUID();
            $("#reply-slot").replaceChildren();
          },
          "ghost small",
        ),
      )
    : h("span");
}
function composer() {
  const error = h("p", { class: "error", role: "alert" }),
    text = h("textarea", {
      id: "body",
      name: "body",
      maxlength: "8000",
      required: "",
      placeholder: "Escribe un mensaje para este canal…",
      "aria-label": "Mensaje",
      ...(state.channel.paused ? { disabled: "" } : {}),
    });
  const mentions = h(
    "select",
    { name: "mention", "aria-label": "Mencionar a un agente" },
    h("option", { value: "" }, "Mencionar a un agente"),
    ...state.members.agents
      .filter((a) => !a.revoked)
      .map((a) => h("option", { value: a.id }, a.name)),
  );
  const f = h(
    "form",
    { class: "composer" },
    h("div", { id: "reply-slot" }, replyBar()),
    text,
    h(
      "div",
      { class: "composer-bottom" },
      mentions,
      h("span", { class: "muted" }, "Texto privado · hasta 8,000 caracteres"),
      h(
        "button",
        {
          type: "submit",
          class: "primary",
          ...(state.channel.paused ? { disabled: "" } : {}),
        },
        "Enviar mensaje ↗",
      ),
    ),
    error,
  );
  text.addEventListener("input", () => (state.operation = crypto.randomUUID()));
  mentions.addEventListener(
    "change",
    () => (state.operation = crypto.randomUUID()),
  );
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = f.querySelector("button[type=submit]");
    b.disabled = true;
    error.textContent = "";
    try {
      const body = {
        channel_id: state.channel.id,
        body: text.value,
        operation_id: state.operation,
        mentions: mentions.value ? [mentions.value] : [],
        ...(state.reply ? { reply_to: state.reply.id } : {}),
      };
      await api("/messages", "POST", body);
      state.reply = null;
      state.operation = crypto.randomUUID();
      await loadChannel();
      render();
    } catch (err) {
      error.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });
  return f;
}
async function invitePerson() {
  dialog("Invitar al canal", (d) => {
    d.append(
      h(
        "p",
        { class: "notice warn" },
        "La persona invitada podrá leer el historial completo de este canal. El enlace vence en 48 horas y solo se puede usar una vez.",
      ),
    );
    actionForm(
      d,
      [field("Correo de la persona", "email", "email")],
      async (data) => {
        const invite = await api("/invites", "POST", {
          email: data.email,
          channel_id: state.channel.id,
        });
        d.close();
        showSecret(
          "Invitación creada",
          invite.url,
          "Compártela tú con la persona indicada. No se envió ningún correo.",
        );
      },
      "Crear invitación",
    );
  });
}
async function manageMembers() {
  const people = await api("/people");
  dialog("Participantes y permisos", (d) => {
    d.append(
      h(
        "p",
        { class: "notice warn" },
        "Añadir una persona o agente permite consultar el historial del canal.",
      ),
    );
    for (const person of people) {
      const joined = state.members.humans.some((u) => u.id === person.id);
      d.append(
        h(
          "div",
          { class: "row between field" },
          h(
            "div",
            {},
            h("strong", {}, person.name),
            h("p", { class: "subtitle" }, person.email),
          ),
          button(
            joined ? "Quitar" : "Añadir",
            async () => {
              await api(`/channels/${state.channel.id}/people`, "PUT", {
                user_id: person.id,
                remove: joined,
              });
              await refreshData();
              d.close();
              render();
              manageMembers();
            },
            "small",
          ),
        ),
      );
    }
    d.append(h("hr"), h("h3", {}, "Acceso de agentes"));
    for (const a of state.agents.filter((a) => !a.revoked)) {
      const current =
        state.members.agents.find((m) => m.id === a.id)?.permission || "none";
      const select = h(
        "select",
        { "aria-label": "Permiso de " + a.name },
        ...[
          ["none", "Sin acceso"],
          ["read", "Solo lectura"],
          ["write", "Lectura y escritura"],
        ].map(([v, l]) =>
          h(
            "option",
            { value: v, ...(v === current ? { selected: "" } : {}) },
            l,
          ),
        ),
      );
      d.append(
        h(
          "div",
          { class: "field" },
          h("label", {}, a.name + " · " + a.owner_name),
          h(
            "div",
            { class: "row" },
            select,
            button(
              "Guardar",
              async () => {
                await api(`/channels/${state.channel.id}/agents`, "PUT", {
                  agent_id: a.id,
                  permission: select.value,
                });
                await refreshData();
                render();
                toast("Permiso actualizado.");
              },
              "small",
            ),
          ),
        ),
      );
    }
  });
}
function renderAgents() {
  const content = $("#content");
  content.append(
    intro(
      "Agentes y conexiones",
      "Cada conexión tiene un dueño. Cada acceso se puede revocar.",
      button(
        "+ Registrar agente",
        () =>
          dialog("Registrar agente", (d) =>
            actionForm(
              d,
              [
                field("Nombre del agente", "name", "text", {
                  maxlength: "80",
                  placeholder: "Ej. Mi agente de diseño",
                }),
              ],
              async (data) => {
                await api("/agents", "POST", data);
                await refreshData();
                d.close();
                render();
              },
              "Registrar",
            ),
          ),
        "primary",
      ),
    ),
    h(
      "div",
      { class: "notice" },
      "Registra una identidad por conexión. Después, el administrador puede darle acceso a un canal. El servicio no ejecuta agentes ni utiliza una API de IA.",
    ),
  );
  const cards = h("div", { class: "cards field" });
  for (const a of state.agents) {
    cards.append(
      h(
        "section",
        { class: "card agent-card" },
        h(
          "div",
          { class: "row between" },
          avatar(a.name),
          badge(a.revoked ? "REVOCADO" : "IDENTIDAD REGISTRADA", a.revoked),
        ),
        h("h2", {}, a.name),
        h("p", { class: "muted" }, "Dueño: " + a.owner_name),
        h(
          "div",
          { class: "row actions" },
          ...(!a.revoked && a.owner_id === state.me.id
            ? [
                button(
                  "Conectar por MCP",
                  () => connectAgent(a),
                  "primary small",
                ),
              ]
            : []),
          ...(!a.revoked
            ? [
                button(
                  "Revocar",
                  () =>
                    confirmAction(
                      "Revocar agente",
                      "Todas sus credenciales dejarán de funcionar. Esta identidad no podrá volver a conectarse.",
                      async () => {
                        await api("/agents/" + a.id, "DELETE");
                        await refreshData();
                        render();
                      },
                    ),
                  "danger small",
                ),
              ]
            : []),
        ),
      ),
    );
  }
  content.append(
    state.agents.length
      ? cards
      : h(
          "div",
          { class: "card field" },
          empty(
            "Conecta tu primer agente",
            "Empieza registrando su nombre. Sus permisos se asignan por canal.",
          ),
        ),
  );
}
function connectAgent(agent) {
  dialog("Conectar " + agent.name, (d) => {
    d.append(
      h(
        "p",
        { class: "muted" },
        "Si tu cliente admite OAuth, agrega esta dirección como servidor MCP y autoriza esta identidad desde tu cuenta.",
      ),
      h("pre", { class: "secret" }, location.origin + "/mcp"),
      h(
        "p",
        { class: "muted" },
        "Para clientes que aceptan una credencial Bearer, genera una clave de acceso. Vence en 30 días y se muestra una sola vez.",
      ),
      h(
        "div",
        { class: "dialog-actions" },
        button(
          "Generar credencial",
          async () => {
            const token = await api(
              "/agents/" + agent.id + "/token",
              "POST",
              {},
            );
            d.close();
            showSecret(
              "Credencial de conexión",
              token.access_token,
              "Guárdala en el gestor de secretos de tu cliente y úsala como Authorization: Bearer. No la publiques ni la pegues en conversaciones. Para invalidarla, revoca esta identidad.",
            );
          },
          "primary",
        ),
      ),
    );
  });
}
const actions = {
  "workspace.created": "Espacio creado",
  "session.created": "Inicio de sesión",
  "invite.created": "Invitación creada",
  "invite.accepted": "Invitación aceptada",
  "channel.created": "Canal creado",
  "agent.created": "Agente registrado",
  "agent.revoked": "Agente revocado",
  "permission.changed": "Permiso actualizado",
  "participant.added": "Persona incorporada",
  "participant.removed": "Persona retirada",
  "channel.paused": "Canal pausado",
  "channel.resumed": "Canal reanudado",
  "message.posted": "Mensaje publicado",
  "messages.received": "Recepción confirmada",
  "connection.authorized": "Conexión autorizada",
  "credential.created": "Credencial generada",
  "connection.used": "Conexión MCP iniciada",
};
async function renderAudit() {
  const rows = await api("/audit"),
    content = $("#content");
  content.append(
    intro(
      "Actividad del espacio",
      "Cambios de acceso y eventos de comunicación. Los registros no incluyen el contenido de los mensajes.",
    ),
  );
  const table = h(
      "table",
      { class: "table" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", {}, "Evento"),
          h("th", {}, "Autor"),
          h("th", {}, "Fecha"),
        ),
      ),
    ),
    body = h("tbody");
  for (const r of rows)
    body.append(
      h(
        "tr",
        {},
        h("td", {}, actions[r.action] || r.action),
        h(
          "td",
          {},
          state.agents.find((a) => a.id === r.actor)?.name ||
            (r.actor === state.me.id ? state.me.name : r.actor.slice(0, 8)),
        ),
        h("td", {}, new Date(r.created_at).toLocaleString("es-MX")),
      ),
    );
  table.append(body);
  content.append(h("div", { class: "card" }, table));
}
async function consentView() {
  const data = await api("/authorization/" + state.authorization);
  const select = h(
    "select",
    { name: "agent_id", required: "", "aria-label": "Agente a conectar" },
    h("option", { value: "" }, "Selecciona tu agente"),
    ...data.agents.map((a) => h("option", { value: a.id }, a.name)),
  );
  const error = h("p", { class: "error", role: "alert" });
  const f = h(
    "form",
    { class: "auth-form" },
    h("span", { class: "eyebrow" }, "AUTORIZAR CONEXIÓN MCP"),
    h("h1", {}, "Conectar " + data.client_name),
    h(
      "p",
      { class: "muted" },
      "Este cliente podrá leer y publicar únicamente en los canales autorizados al agente que elijas.",
    ),
    h(
      "p",
      { class: "notice warn" },
      "Comprueba el cliente y la dirección de retorno antes de continuar.",
    ),
    h("pre", { class: "secret" }, data.redirect_uri),
    h("label", {}, "Identidad del agente"),
    select,
    ...(!data.agents.length
      ? [
          h(
            "p",
            { class: "muted" },
            "Registra primero un agente desde tu panel.",
          ),
          button("Ir al panel", () => {
            state.authorization = null;
            history.replaceState(null, "", "/");
            render();
          }),
        ]
      : []),
    error,
    h(
      "button",
      { type: "submit", class: "primary", disabled: !data.agents.length },
      "Autorizar conexión",
    ),
    button(
      "Denegar",
      async () => {
        const result = await api(
          "/authorization/" + state.authorization,
          "POST",
          { deny: true },
        );
        location.assign(result.redirect);
      },
      "full field",
    ),
  );
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await api(
        "/authorization/" + state.authorization,
        "POST",
        { agent_id: select.value },
      );
      location.assign(result.redirect);
    } catch (err) {
      error.textContent = err.message;
    }
  });
  root.replaceChildren(h("div", { class: "auth-panel" }, f));
}
setInterval(async () => {
  if (
    !state.me ||
    state.view !== "channels" ||
    !state.channel ||
    state.authorization ||
    document.querySelector("dialog[open]")
  )
    return;
  try {
    const cid = state.channel.id;
    const [latest, recent] = await Promise.all([
      api(`/channels/${cid}/messages?after=${state.messages.at(-1)?.seq || 0}`),
      api(`/channels/${cid}/messages`),
    ]);
    if (state.channel?.id !== cid || state.view !== "channels") return;
    const byId = new Map(recent.map((m) => [m.id, m]));
    const changed = state.messages.some(
      (m) => byId.has(m.id) && byId.get(m.id).received !== m.received,
    );
    state.messages = state.messages.map((m) => byId.get(m.id) || m);
    for (const m of latest)
      if (!state.messages.some((old) => old.id === m.id))
        state.messages.push(m);
    if (latest.length || changed) {
      const box = $("#messages");
      if (box) {
        const atBottom =
          box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        drawMessages(box);
        if (atBottom) box.scrollTop = box.scrollHeight;
      }
    }
  } catch {
    /* foreground requests show errors; polling remains quiet */
  }
}, 5000);
await boot();
