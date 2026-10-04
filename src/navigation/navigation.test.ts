import { formatHashFromPath, normalizePath } from "./index";
import { formatHashLocation, parseHashLocation } from "./route";
import { DEFAULT_PAGE_PATH, QUERY_PAGE_PATH } from "./constants";

describe("normalizePath", () => {
  it("末尾のスラッシュを削除する", () => {
    expect(normalizePath("/pages/foo/")).toBe("/pages/foo");
    expect(normalizePath("/pages/foo///")).toBe("/pages/foo");
  });

  it("先頭にスラッシュを付ける", () => {
    expect(normalizePath("pages/foo")).toBe("/pages/foo");
  });

  it("空の入力をルートパスに正規化する", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("ルートパスをそのまま保持する", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("ドットで指定された相対パスを安全に解決する", () => {
    expect(normalizePath("/pages/foo/../bar")).toBe("/pages/bar");
    expect(normalizePath("/pages/foo/./baz")).toBe("/pages/foo/baz");
    expect(normalizePath("/pages/foo/../../secret")).toBe("/secret");
  });

  it("無効な文字の削除によって空になったパス要素を除去する", () => {
    expect(normalizePath("/pages/\u0000\u0001/valid")).toBe("/pages/valid");
  });

  it("不要な文字を除去した結果が親ディレクトリ指定になる場合に親パスへ解決する", () => {
    expect(normalizePath("/pages/alpha/.. \u0000/beta")).toBe("/pages/beta");
  });

  it("パス要素に含まれる改行文字を削除する", () => {
    expect(normalizePath("/pages/line\nbreak")).toBe("/pages/linebreak");
  });

  it("パス要素に日本語の文字を使用できる", () => {
    expect(normalizePath("/pages/資料/下書き")).toBe("/pages/資料/下書き");
  });

  it("Windows形式の区切り文字を正規化する", () => {
    expect(normalizePath("pages\\ideas\\今日")).toBe("/pages/ideas/今日");
  });

  it("パス要素に含まれる制御文字を削除する", () => {
    expect(normalizePath("/pages/\u0002draft")).toBe("/pages/draft");
  });

  it("親ディレクトリへの移動を解決してルートパスに正規化する", () => {
    expect(normalizePath("/pages/foo/../..")).toBe("/");
  });
});

describe("parseHashLocation", () => {
  it("パーセントエンコードされた値を復号してノートのルートに変換する", () => {
    expect(parseHashLocation("#%2Fpages%2Falpha")).toEqual({
      type: "note",
      path: "/pages/alpha",
    });
  });

  it("ハッシュが空の場合にnullを返す", () => {
    expect(parseHashLocation("")).toBeNull();
  });

  it("ハッシュが検索用パスに一致する場合に検索のルートを返す", () => {
    expect(parseHashLocation(`#${QUERY_PAGE_PATH}`)).toEqual({ type: "query" });
  });

  it("復号に失敗した場合に元のハッシュを使用する", () => {
    expect(parseHashLocation("#/%E0%A4%A")).toEqual({
      type: "note",
      path: "/%E0%A4%A",
    });
  });
});

describe("formatHashFromPath", () => {
  it("パス要素をエンコードするときにスラッシュを保持する", () => {
    expect(formatHashFromPath(DEFAULT_PAGE_PATH)).toBe(`#${DEFAULT_PAGE_PATH}`);
  });

  it("パス要素に含まれる空白をエンコードする", () => {
    expect(formatHashFromPath("/pages/My notes/Idea 01")).toBe("#/pages/My%20notes/Idea%2001");
  });

  it("ルートパスをルートのハッシュに変換する", () => {
    expect(formatHashFromPath("/")).toBe("#/");
  });

  it("空の入力をルートのハッシュに正規化する", () => {
    expect(formatHashFromPath("")).toBe("#/");
  });

  it("親ディレクトリ指定と制御文字を取り除いてからハッシュに変換する", () => {
    expect(formatHashFromPath("/pages/../\u0001unsafe")).toBe("#/unsafe");
  });

  it("不要な文字の除去後にルートになるパスをルートのハッシュに変換する", () => {
    expect(formatHashFromPath("\u0000..\u0001\\\\")).toBe("#/");
  });
});

describe("formatHashLocation", () => {
  it("ノートのルートをエンコード済みのパス要素でハッシュに変換する", () => {
    expect(formatHashLocation({ type: "note", path: "/pages/My notes" })).toBe(
      "#/pages/My%20notes",
    );
  });

  it("検索のルートを固定の検索用ハッシュに変換する", () => {
    expect(formatHashLocation({ type: "query" })).toBe(`#${QUERY_PAGE_PATH}`);
  });
});
