import { AutoLinkPlugin } from "@lexical/react/LexicalAutoLinkPlugin";
import { createLinkMatcherWithRegExp } from "@lexical/link";

const HTTP_URL_MATCHER = createLinkMatcherWithRegExp(/\bhttps?:\/\/[^\s<>"'`[\]{}|\\^]+/i);

/**
 * http/httpsで始まるURL文字列を自動的にリンク化してクリックできるようにするLexicalプラグイン。
 *
 * @returns HTTP(S)リンク検出用AutoLinkプラグイン
 */
export function UrlAutoLinkPlugin() {
  return <AutoLinkPlugin matchers={[HTTP_URL_MATCHER]} />;
}
