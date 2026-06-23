import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "session-token";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret) throw new Error("SESSION_JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email?: string;
  [key: string]: unknown;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret());
  if (typeof payload.userId !== "string") throw new Error("Invalid session token");
  return { userId: payload.userId, email: typeof payload.email === "string" ? payload.email : undefined };
}

export { SESSION_COOKIE, SESSION_TTL_SECONDS };
