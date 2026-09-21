type D1Statement = {
  first<T>(): Promise<T | null>;
};

type D1Database = {
  prepare(query: string): D1Statement;
};

type ProbeEnvironment = {
  DB?: D1Database;
};

type ProbeContext = {
  request: Request;
  env: ProbeEnvironment;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

/**
 * Checks the Site authentication boundary and the D1 binding without reading application data.
 *
 * @param context Sites request context containing the request and D1 environment
 * @returns Probe response with the contract-defined readiness result
 */
export async function onRequestGet({ request, env }: ProbeContext): Promise<Response> {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email");

  if (!authenticatedEmail?.trim()) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (!env.DB) {
    return jsonResponse({ error: "storage_unavailable" }, 503);
  }

  try {
    const result = await env.DB.prepare("SELECT 1").first<Record<string, unknown>>();

    if (!result) {
      return jsonResponse({ error: "storage_unavailable" }, 503);
    }
  } catch {
    return jsonResponse({ error: "storage_unavailable" }, 503);
  }

  return jsonResponse({ ready: true }, 200);
}
