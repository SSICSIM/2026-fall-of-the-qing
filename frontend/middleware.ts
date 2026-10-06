import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  // api/backend is excluded here because it enforces its own auth check and
  // returns a 401 JSON response — a redirect to /login would otherwise hand
  // callers an HTML page where they expect JSON.
  matcher: ["/((?!api/auth|api/backend|api/public|display|_next/static|_next/image|login|favicon).*)"],
};
