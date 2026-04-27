import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret-change-me"
);

const COOKIE_NAME = "masunori-session";

export interface SessionPayload {
  email: string;
  name: string;
}

export async function createSession(email: string, name: string): Promise<string> {
  const token = await new SignJWT({ email, name })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(SECRET);

  return token;
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { email: payload.email as string, name: payload.name as string };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export function getSessionFromRequest(
  request: NextRequest
): string | undefined {
  return request.cookies.get(COOKIE_NAME)?.value;
}

export function isEmailAllowed(email: string): boolean {
  const allowed = (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export { COOKIE_NAME };
