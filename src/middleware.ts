import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, getSessionFromRequest } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas que no requieren auth
  const publicPaths = ["/login", "/api/auth", "/api/menu/print", "/api/menu/print/en", "/api/menu/print/ru"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (isPublic) {
    return NextResponse.next();
  }

  // Verificar sesión
  const token = getSessionFromRequest(request);

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const session = await verifySession(token);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Inyectar x-pathname para que server components/layouts conozcan el path actual.
  // El control granular de permisos por sección se hace en:
  //  - /administracion/layout.tsx (vía requirePermission del path)
  //  - /api/erp/*/route.ts (vía requirePermissionApi)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
};
