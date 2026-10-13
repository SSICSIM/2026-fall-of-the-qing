import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
});

export const config = {
  // api/backend is excluded here because it enforces its own auth check and
  // returns a 401 JSON response — a redirect to /login would otherwise hand
  // callers an HTML page where they expect JSON.
  matcher: ["/((?!api/auth|api/backend|_next/static|_next/image|login|favicon|robots.txt).*)"],
};
