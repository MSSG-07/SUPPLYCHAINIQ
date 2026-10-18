import type { NextRequest } from "next/server";

/** Resolve the internal service binding only when a route handler runs. */
export async function proxyBackend(request: NextRequest, path: string): Promise<Response> {
  const base = process.env.BACKEND_URL;
  if (!base) {
    return Response.json({ detail: "Backend binding is unavailable." }, { status: 503 });
  }

  const target = new URL(path.replace(/^\//, ""), `${base.replace(/\/$/, "")}/`);
  const accept = request.headers.get("accept");
  try {
    const upstream = await fetch(target, {
      headers: accept ? { accept } : undefined,
      cache: "no-store",
    });
    const headers = new Headers({ "Cache-Control": "no-store" });
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ detail: "Backend service is unavailable." }, { status: 502 });
  }
}
