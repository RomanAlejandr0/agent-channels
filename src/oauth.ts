import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { Queryable } from "./db.js";
import type { Service, User } from "./service.js";
import { id, secret, hash, requireThat } from "./security.js";
export class OAuthProvider implements OAuthServerProvider {
  resource: string;
  constructor(private service: Service) {
    this.resource = service.baseUrl + "/mcp";
  }
  clientsStore = {
    getClient: async (
      cid: string,
    ): Promise<OAuthClientInformationFull | undefined> =>
      (
        await this.service.db.query(
          "SELECT data FROM oauth_clients WHERE id=$1",
          [cid],
        )
      ).rows[0]?.data,
    registerClient: async (
      input: Omit<
        OAuthClientInformationFull,
        "client_id" | "client_id_issued_at"
      >,
    ): Promise<OAuthClientInformationFull> => {
      // Public clients with PKCE only: no client secrets are stored or exposed.
      if (input.token_endpoint_auth_method !== "none")
        throw new InvalidClientMetadataError(
          "Use token_endpoint_auth_method=none with PKCE.",
        );
      if (input.redirect_uris.length > 10)
        throw new InvalidClientMetadataError("Too many redirect URIs.");
      for (const uri of input.redirect_uris) {
        const u = new URL(uri);
        if (
          u.hash ||
          u.username ||
          u.password ||
          !(
            u.protocol === "https:" ||
            (u.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))
          )
        )
          throw new InvalidClientMetadataError(
            "HTTPS or local loopback redirect required.",
          );
      }
      if (input.scope && input.scope !== "messaging")
        throw new InvalidScopeError("Only messaging is supported.");
      const client = {
        ...input,
        client_id: id(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "messaging",
      };
      delete client.client_secret;
      await this.service.db.query(
        "INSERT INTO oauth_clients(id,data) VALUES($1,$2)",
        [client.client_id, JSON.stringify(client)],
      );
      return client;
    },
  };
  target(resource?: URL) {
    if (resource && resource.href !== this.resource)
      throw new InvalidTargetError("Invalid resource.");
  }
  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ) {
    this.target(params.resource);
    if (params.scopes?.some((s) => s !== "messaging"))
      throw new InvalidScopeError("Invalid scope.");
    const request = secret();
    await this.service.db.query(
      "INSERT INTO oauth_requests(id,client_id,params,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [
        hash(request),
        client.client_id,
        JSON.stringify({ ...params, resource: this.resource }),
      ],
    );
    res.redirect(this.service.baseUrl + "/?authorization=" + request);
  }
  async request(user: User, token: string) {
    const r = (
      await this.service.db.query(
        "SELECT r.*,c.data FROM oauth_requests r JOIN oauth_clients c ON c.id=r.client_id WHERE r.id=$1 AND r.expires_at>now()",
        [hash(token)],
      )
    ).rows[0];
    requireThat(r, 404, "Solicitud vencida o no disponible.");
    return {
      client_name: r.data.client_name || "Cliente MCP",
      redirect_uri: r.params.redirectUri,
      scope: "messaging",
      agents: (await this.service.agents(user)).filter(
        (a) => a.owner_id === user.id && !a.revoked,
      ),
    };
  }
  async consent(
    user: User,
    token: string,
    aid: string | undefined,
    deny = false,
  ) {
    return this.service.db.transaction(async (q) => {
      const r = (
        await q.query(
          "DELETE FROM oauth_requests WHERE id=$1 AND expires_at>now() RETURNING *",
          [hash(token)],
        )
      ).rows[0];
      requireThat(r, 404, "Solicitud vencida o ya utilizada.");
      const redirect = new URL(r.params.redirectUri);
      if (r.params.state) redirect.searchParams.set("state", r.params.state);
      if (deny) redirect.searchParams.set("error", "access_denied");
      else {
        const a = await this.service.ownAgent(q, user, aid!);
        requireThat(
          a.owner_id === user.id && !a.revoked,
          403,
          "Selecciona un agente propio y activo.",
        );
        const code = secret();
        await q.query(
          "INSERT INTO oauth_codes(hash,client_id,agent_id,params,expires_at) VALUES($1,$2,$3,$4,now()+interval '2 minutes')",
          [hash(code), r.client_id, aid, JSON.stringify(r.params)],
        );
        redirect.searchParams.set("code", code);
        await this.service.audit(q, user.id, "connection.authorized", aid!);
      }
      return { redirect: redirect.href };
    });
  }
  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    const r = (
      await this.service.db.query(
        "SELECT params FROM oauth_codes WHERE hash=$1 AND client_id=$2 AND expires_at>now()",
        [hash(code), client.client_id],
      )
    ).rows[0];
    if (!r) throw new InvalidGrantError("Invalid authorization code.");
    return r.params.codeChallenge;
  }
  async issue(
    q: Queryable,
    aid: string,
    client: string,
    family = id(),
    days = false,
  ): Promise<OAuthTokens> {
    await this.service.activeAgent(q, aid);
    const access = secret(),
      refresh = secret();
    await q.query(
      "INSERT INTO tokens(hash,agent_id,client_id,kind,expires_at,resource,family) VALUES($1,$2,$3,'access',now()+($4::int * interval '1 second'),$5,$6)",
      [hash(access), aid, client, days ? 2592000 : 3600, this.resource, family],
    );
    if (!days)
      await q.query(
        "INSERT INTO tokens(hash,agent_id,client_id,kind,expires_at,resource,family) VALUES($1,$2,$3,'refresh',now()+interval '7 days',$4,$5)",
        [hash(refresh), aid, client, this.resource, family],
      );
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: days ? 2592000 : 3600,
      scope: "messaging",
      ...(!days ? { refresh_token: refresh } : {}),
    };
  }
  async personalToken(user: User, aid: string) {
    return this.service.db.transaction(async (q) => {
      const a = await this.service.ownAgent(q, user, aid);
      requireThat(
        a.owner_id === user.id,
        403,
        "Solo el dueño puede generar credenciales.",
      );
      const tokens = await this.issue(q, aid, "personal", id(), true);
      await this.service.audit(q, user.id, "credential.created", aid);
      return tokens;
    });
  }
  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ) {
    this.target(resource);
    return this.service.db.transaction(async (q) => {
      const r = (
        await q.query(
          "SELECT * FROM oauth_codes WHERE hash=$1 AND client_id=$2 AND expires_at>now() FOR UPDATE",
          [hash(code), client.client_id],
        )
      ).rows[0];
      if (!r || !redirectUri || redirectUri !== r.params.redirectUri)
        throw new InvalidGrantError("Invalid grant or redirect URI.");
      await q.query("DELETE FROM oauth_codes WHERE hash=$1", [hash(code)]);
      return this.issue(q, r.agent_id, client.client_id);
    });
  }
  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    token: string,
    scopes?: string[],
    resource?: URL,
  ) {
    this.target(resource);
    if (scopes?.some((s) => s !== "messaging"))
      throw new InvalidScopeError("Invalid scope.");
    return this.service.db.transaction(async (q) => {
      const r = (
        await q.query(
          "SELECT * FROM tokens WHERE hash=$1 AND client_id=$2 AND kind='refresh' AND expires_at>now() FOR UPDATE",
          [hash(token), client.client_id],
        )
      ).rows[0];
      if (!r) throw new InvalidGrantError("Invalid refresh token.");
      await q.query("DELETE FROM tokens WHERE family=$1", [r.family]);
      return this.issue(q, r.agent_id, client.client_id, r.family);
    });
  }
  async verifyAccessToken(token: string) {
    const r = (
      await this.service.db.query(
        "SELECT t.* FROM tokens t JOIN agents a ON a.id=t.agent_id WHERE t.hash=$1 AND t.kind='access' AND t.expires_at>now() AND a.revoked=false",
        [hash(token)],
      )
    ).rows[0];
    if (!r) throw new InvalidTokenError("Invalid or revoked connection.");
    return {
      token,
      clientId: r.client_id,
      scopes: ["messaging"],
      expiresAt: Math.floor(new Date(r.expires_at).getTime() / 1000),
      resource: new URL(r.resource),
      extra: { agent_id: r.agent_id },
    };
  }
  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    await this.service.db.query(
      "DELETE FROM tokens WHERE family IN (SELECT family FROM tokens WHERE hash=$1 AND client_id=$2)",
      [hash(request.token), client.client_id],
    );
  }
}
