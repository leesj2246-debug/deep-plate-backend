import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt) as (password: string, salt: string, length: number) => Promise<Buffer>;
const tokenLifetimeSeconds = 60 * 60 * 24 * 7;

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createSignedToken(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const unsignedToken = `${header}.${encodedPayload}`;
  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

function verifySignedToken(token: string, secret: string, now: number): Record<string, unknown> | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const [header, payload, signature] = segments;
  if (!header || !payload || !signature) return null;

  const expected = sign(`${header}.${payload}`, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: unknown; typ?: unknown };
    const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT") return null;
    if (typeof decodedPayload.sub !== "string" || typeof decodedPayload.exp !== "number" || decodedPayload.exp <= now) return null;
    return decodedPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) return false;

  const expected = Buffer.from(encodedHash, "hex");
  if (expected.length !== 64) return false;
  const actual = await deriveKey(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

export function createAccessToken(userId: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  return createSignedToken({ sub: userId, iat: now, exp: now + tokenLifetimeSeconds }, secret);
}

export function verifyAccessToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): string | null {
  const payload = verifySignedToken(token, secret, now);
  return payload && payload.scope === undefined ? payload.sub as string : null;
}

export function createCheckoutAccessToken(orderId: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  return createSignedToken({ sub: orderId, scope: "checkout", iat: now, exp: now + tokenLifetimeSeconds }, secret);
}

export function verifyCheckoutAccessToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): string | null {
  const payload = verifySignedToken(token, secret, now);
  return payload?.scope === "checkout" ? payload.sub as string : null;
}
