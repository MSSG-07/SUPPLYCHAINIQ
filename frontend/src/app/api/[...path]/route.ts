import type { NextRequest } from "next/server";

async function proxy(request: NextRequest): Promise<Response> {
  const base = process.env.BACKEND_URL;
  if (!base) {
    return Response.json(
      { detail: "Backend binding is unavailable. Set BACKEND_URL for local Next.js development." },
      { status: 503 },
    );
  }

  // Keep the FastAPI /api prefix; Vercel's binding URL is the service base.
  const target = new URL(
    request.nextUrl.pathname.replace(/^\//, "") + request.nextUrl.search,
    `${base.replace(/\/$/, "")}/`,
  );
  const headers = new Headers();
  for (const name of ["accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);
    const location = upstream.headers.get("location");
    if (location) {
      const redirected = new URL(location, target);
      responseHeaders.set(
        "Location",
        redirected.origin === target.origin
          ? redirected.pathname + redirected.search
          : location,
      );
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ detail: "Backend service is unavailable." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE, proxy as HEAD, proxy as OPTIONS };
