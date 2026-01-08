import { formatHashFromPath, normalizePath } from "./index";
import { formatHashLocation, parseHashLocation } from "./route";
import { DEFAULT_PAGE_PATH, QUERY_PAGE_PATH } from "./constants";

describe("normalizePath", () => {
  it("trims trailing slashes", () => {
    expect(normalizePath("/pages/foo/")).toBe("/pages/foo");
    expect(normalizePath("/pages/foo///")).toBe("/pages/foo");
  });

  it("ensures leading slash", () => {
    expect(normalizePath("pages/foo")).toBe("/pages/foo");
  });

  it("normalizes empty input to root", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("leaves root path as-is", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("resolves dot segments safely", () => {
    expect(normalizePath("/pages/foo/../bar")).toBe("/pages/bar");
    expect(normalizePath("/pages/foo/./baz")).toBe("/pages/foo/baz");
    expect(normalizePath("/pages/foo/../../secret")).toBe("/secret");
  });

  it("drops empty segments created by invalid characters", () => {
    expect(normalizePath("/pages/\u0000\u0001/valid")).toBe("/pages/valid");
  });

  it("treats sanitized traversal markers after trimming as parent resolution", () => {
    expect(normalizePath("/pages/alpha/.. \u0000/beta")).toBe("/pages/beta");
  });

  it("strips control characters inside segments", () => {
    expect(normalizePath("/pages/line\nbreak")).toBe("/pages/linebreak");
  });

  it("allows Japanese characters within segments", () => {
    expect(normalizePath("/pages/資料/下書き")).toBe("/pages/資料/下書き");
  });

  it("normalizes Windows-style separators", () => {
    expect(normalizePath("pages\\ideas\\今日")).toBe("/pages/ideas/今日");
  });

  it("sanitizes control characters within segments", () => {
    expect(normalizePath("/pages/\u0002draft")).toBe("/pages/draft");
  });

  it("removes unsafe parent directory traversal", () => {
    expect(normalizePath("/pages/foo/../..")).toBe("/");
  });
});

describe("parseHashLocation", () => {
  it("decodes percent-encoded values into note routes", () => {
    expect(parseHashLocation("#%2Fpages%2Falpha")).toEqual({
      type: "note",
      path: "/pages/alpha",
    });
  });

  it("returns null when hash is empty", () => {
    expect(parseHashLocation("")).toBeNull();
  });

  it("returns query route when hash matches query path", () => {
    expect(parseHashLocation(`#${QUERY_PAGE_PATH}`)).toEqual({ type: "query" });
  });

  it("falls back to raw hash on decode errors", () => {
    expect(parseHashLocation("#/%E0%A4%A")).toEqual({
      type: "note",
      path: "/%E0%A4%A",
    });
  });
});

describe("formatHashFromPath", () => {
  it("retains slashes while encoding segments", () => {
    expect(formatHashFromPath(DEFAULT_PAGE_PATH)).toBe(`#${DEFAULT_PAGE_PATH}`);
  });

  it("encodes whitespace in segments", () => {
    expect(formatHashFromPath("/pages/My notes/Idea 01")).toBe("#/pages/My%20notes/Idea%2001");
  });

  it("handles root path", () => {
    expect(formatHashFromPath("/")).toBe("#/");
  });

  it("normalizes empty input to root hash", () => {
    expect(formatHashFromPath("")).toBe("#/");
  });

  it.skip("removes traversal and control characters before formatting", () => {
    expect(formatHashFromPath("/pages/../\u0001unsafe")).toBe("#/unsafe");
  });

  it("formats paths that become root after sanitization", () => {
    expect(formatHashFromPath("\u0000..\u0001\\\\")).toBe("#/");
  });
});

describe("formatHashLocation", () => {
  it("formats note routes using encoded path segments", () => {
    expect(formatHashLocation({ type: "note", path: "/pages/My notes" })).toBe(
      "#/pages/My%20notes",
    );
  });

  it("formats query routes to the fixed query hash", () => {
    expect(formatHashLocation({ type: "query" })).toBe(`#${QUERY_PAGE_PATH}`);
  });
});
