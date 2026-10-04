import { describe, expect, it, vi } from "vitest";

import { onRequestGet } from "./probe";

function createContext(
  headers: Record<string, string> = {},
  database: { first: <T>() => Promise<T | null> } | null = {
    first: async <T>() => ({ value: 1 }) as T,
  },
) {
  return {
    request: new Request("https://example.test/api/sync/probe", { headers }),
    env: database ? { DB: { prepare: vi.fn(() => database) } } : {},
  };
}

describe("GET /api/sync/probe", () => {
  it("Siteの認証ヘッダーがないリクエストを拒否する", async () => {
    const response = await onRequestGet(createContext());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  it("認証後にD1を確認し、利用可能な状態を返す", async () => {
    const response = await onRequestGet(
      createContext({ "oai-authenticated-user-email": "member@example.com" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ready: true });
  });

  it("D1がバインドされていない場合にストレージエラーを返す", async () => {
    const response = await onRequestGet(
      createContext({ "oai-authenticated-user-email": "member@example.com" }, null),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "storage_unavailable" });
  });

  it("D1のエラーの詳細を公開しない", async () => {
    const response = await onRequestGet(
      createContext(
        { "oai-authenticated-user-email": "member@example.com" },
        {
          first: async <T>() => Promise.reject<T>(new Error("private database detail")),
        },
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.not.toContain("private database detail");
  });
});
