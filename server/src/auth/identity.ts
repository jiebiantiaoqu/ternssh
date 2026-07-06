import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  ensureDefaultUser,
  upsertUserFromAccessSub,
  upsertUserFromEmail,
} from "../db/users";
import type { User } from "../types";

const DEFAULT_USER: User = {
  id: "default",
  email: null,
  display_name: "Default",
  created_at: "",
  updated_at: "",
};

function isAccessEnabled(env: Env): boolean {
  return String(env.ACCESS_ENABLED).toLowerCase() === "true";
}

function normalizeTeamDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function normalizeAud(raw: string): string {
  return raw.trim();
}

async function verifyAccessJwt(
  token: string,
  env: Env,
): Promise<{ email: string | null; sub: string | null; isServiceToken: boolean }> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new IdentityError(
      "ACCESS_TEAM_DOMAIN and ACCESS_AUD must be configured",
      500,
    );
  }

  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = normalizeAud(env.ACCESS_AUD);
  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/cdn-cgi/access/certs`),
  );

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
    });

    const email = typeof payload.email === "string" ? payload.email : null;
    const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : null;
    const commonName =
      typeof payload.common_name === "string" ? payload.common_name : null;
    const isServiceToken = Boolean(commonName && !email && !sub);

    return { email, sub, isServiceToken };
  } catch (error) {
    if (error instanceof IdentityError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Access JWT verification failed";
    throw new IdentityError(`Access JWT verification failed: ${message}`, 401);
  }
}

async function resolveUserFromAccessClaims(
  db: D1Database,
  claims: { email: string | null; sub: string | null; isServiceToken: boolean },
): Promise<User> {
  if (claims.isServiceToken) {
    throw new IdentityError(
      "Access service tokens are not supported; sign in with an identity provider (email login)",
      401,
    );
  }

  if (claims.email) {
    return upsertUserFromEmail(db, claims.email);
  }

  if (claims.sub) {
    return upsertUserFromAccessSub(db, claims.sub);
  }

  throw new IdentityError(
    "Access JWT missing email and sub claims; check your identity provider sends an email attribute",
    401,
  );
}

export async function resolveUser(request: Request, env: Env): Promise<User> {
  if (!isAccessEnabled(env)) {
    return ensureDefaultUser(env.DB);
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) {
    throw new IdentityError("Missing Cf-Access-Jwt-Assertion header", 401);
  }

  const claims = await verifyAccessJwt(token, env);
  return resolveUserFromAccessClaims(env.DB, claims);
}

export class IdentityError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

export function getAuthMode(env: Env): "open" | "access" {
  return isAccessEnabled(env) ? "access" : "open";
}

export async function getDefaultUserSnapshot(env: Env): Promise<User> {
  if (isAccessEnabled(env)) {
    return DEFAULT_USER;
  }
  return ensureDefaultUser(env.DB);
}
