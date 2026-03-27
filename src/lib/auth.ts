import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback-secret-change-me"
);

const COOKIE_NAME = "masunori-session";

export async function createSession(username: string): Promise<string> {
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(SECRET);

  return token;
}

export async function verifySession(
  token: string
): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { username: payload.username as string };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ username: string } | null> {
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

export { COOKIE_NAME };
