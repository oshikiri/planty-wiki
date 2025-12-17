import { beforeEach, describe, expect, it } from "vitest";
import { formatHashFromPath, normalizePath, parseHashPath } from "./navigation";

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

describe("parseHashPath", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("decodes percent-encoded values", () => {
    window.location.hash = "#%2Fpages%2Falpha";
    expect(parseHashPath()).toBe("/pages/alpha");
  });

  it("returns the hash when already normalized", () => {
    window.location.hash = "#/pages/bravo";
    expect(parseHashPath()).toBe("/pages/bravo");
  });

  it("returns null when hash is empty", () => {
    window.location.hash = "";
    expect(parseHashPath()).toBeNull();
  });

  it("falls back to raw hash on decode errors", () => {
    window.location.hash = "#/%E0%A4%A";
    expect(parseHashPath()).toBe("/%E0%A4%A");
  });
});

describe("formatHashFromPath", () => {
  it("retains slashes while encoding segments", () => {
    expect(formatHashFromPath("/pages/index")).toBe("#/pages/index");
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

  it("removes traversal and control characters before formatting", () => {
    expect(formatHashFromPath("/pages/../\u0001unsafe")).toBe("#/unsafe");
  });

  it("formats paths that become root after sanitization", () => {
    expect(formatHashFromPath("\u0000..\u0001\\\\")).toBe("#/");
  });
});
