import { NextRequest, NextResponse } from "next/server";
import { createSession, isEmailAllowed, COOKIE_NAME } from "@/lib/auth";
import { decodeJwt } from "jose";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    // Google returned an error (user cancelled, etc.)
    if (error) {
      return NextResponse.redirect(new URL("/login?error=cancelled", request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL("/login?error=invalid", request.url));
    }

    // Verify state matches cookie (CSRF protection)
    const storedState = request.cookies.get("oauth-state")?.value;
    if (!storedState || storedState !== state) {
      return NextResponse.redirect(new URL("/login?error=invalid", request.url));
    }

    // Exchange code for tokens
    const redirectUri = getRedirectUri(request);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Google token exchange failed:", await tokenResponse.text());
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    const tokenData = await tokenResponse.json();
    const idToken = tokenData.id_token;

    if (!idToken) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    // Decode the id_token to get user info
    const claims = decodeJwt(idToken);
    const email = claims.email as string;
    const name = (claims.name as string) || email;

    if (!email) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    // Check email whitelist
    if (!isEmailAllowed(email)) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
    }

    // Create session
    const sessionToken = await createSession(email, name);

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 horas
      path: "/",
    });

    // Clean up oauth-state cookie
    response.cookies.delete("oauth-state");

    return response;
  } catch (err) {
    console.error("Auth callback error:", err);
    return NextResponse.redirect(new URL("/login?error=server", request.url));
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}

function getRedirectUri(request: NextRequest): string {
  if (process.env.NEXTAUTH_URL) {
    return `${process.env.NEXTAUTH_URL}/api/auth`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth`;
  }
  return `${request.nextUrl.origin}/api/auth`;
}
