const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function authenticationError(request: Request): Response | null {
  const authenticatedEmail = request.headers.get("oai-authenticated-user-email");
  return authenticatedEmail?.trim() ? null : jsonResponse({ error: "unauthorized" }, 401);
}
