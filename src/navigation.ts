export type WikiLink = {
  path: string;
  display: string;
};

/**
 * location.hashからノートパスを取り出して正規化前の文字列として返す。
 *
 * @returns ハッシュに指定されたパス。未指定時はnull
 */
export function parseHashPath(): string | null {
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) {
    return null;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * ノートパスを#/pages/foo形式のハッシュ値へフォーマットし、セグメント単位でエンコードする。
 *
 * @param path ノートの絶対パス
 * @returns window.location.hashへ代入できる文字列
 */
export function formatHashFromPath(path: string): string {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (!segments.length) {
    return "#/";
  }
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return `#/${encodedSegments.join("/")}`;
}

/**
 * パス表記を`/pages/foo`のような安全な絶対パスへ正規化し、`.`や`..`を除去する。
 *
 * @param path ユーザー入力やWikiリンク由来の生パス
 * @returns 正規化された絶対パス。空文字ならルート"/"
 */
export function normalizePath(path: string): string {
  const decoded = ensureLeadingSlash(path);
  const trimmed = trimTrailingSlashes(decoded);
  const normalizedSlashes = normalizeSeparators(trimmed);
  const normalizedSegments = buildNormalizedSegments(normalizedSlashes);
  if (!normalizedSegments.length) {
    return "/";
  }
  return `/${normalizedSegments.join("/")}`;
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

/**
 * ルート「/」を除いて末尾の不要なスラッシュを取り除く
 */
function trimTrailingSlashes(value: string): string {
  if (value === "/") {
    return value;
  }
  return value.replace(/\/+$/, "");
}

/**
 * Windows風のバックスラッシュを正規のスラッシュへ置き換える
 */
function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * "." や ".." を解決し空要素を捨てて安全なセグメント配列に変換する
 */
function buildNormalizedSegments(value: string): string[] {
  const segments = value.split("/");
  const normalizedSegments: string[] = [];
  for (const rawSegment of segments) {
    if (!rawSegment || rawSegment === ".") {
      continue;
    }
    if (rawSegment === "..") {
      normalizedSegments.pop();
      continue;
    }
    const sanitized = sanitizePathSegment(rawSegment);
    if (!sanitized || sanitized === ".") {
      continue;
    }
    if (sanitized === "..") {
      normalizedSegments.pop();
      continue;
    }
    normalizedSegments.push(sanitized);
  }
  return normalizedSegments;
}

/**
 * 制御文字やスラッシュを削除しつつUnicode文字は保持したままセグメントを整える
 */
function sanitizePathSegment(segment: string): string {
  let result = "";
  for (const char of segment) {
    const code = char.codePointAt(0);
    if (!code) continue;
    if (code <= 0x1f || char === "/") {
      continue;
    }
    result += char;
  }
  return result.trim();
}

/**
 * Markdown本文から`[[Label]]`形式のリンクを抽出し、重複除去して返す。
 *
 * @param body Wikiリンクを含む可能性のあるMarkdown本文
 * @returns 抽出したリンクの配列（pathと表示名）
 */
export function extractWikiLinks(body: string): WikiLink[] {
  const matches = [...body.matchAll(/\[\[([^[\]]+)\]\]/g)];
  const seen = new Set<string>();
  return matches
    .map((match) => match[1].trim())
    .filter((text) => text.length > 0)
    .filter((text) => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .map((text) => {
      const normalized = normalizePath(`/pages/${text}`);
      return { normalized, display: text };
    })
    .map(({ normalized, display }) => ({
      path: normalized,
      display,
    }));
}
