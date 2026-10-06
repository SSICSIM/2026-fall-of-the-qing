import { NextResponse } from "next/server";

// Public, read-only, GET-only pass-through for the delegate display. It has no auth
// on purpose and forwards no credentials: the backend endpoint it calls only returns
// delegate names and published efficiency scores. Never add other paths here.
const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_BASE_URL ?? "http://backend:8000";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${INTERNAL_API_BASE_URL}/public/map-scores`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ detail: "Upstream error" }, { status: 502 });
    return NextResponse.json(await res.json(), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ detail: "Backend is unreachable." }, { status: 502 });
  }
}
