import { AutoLinkPlugin } from "@lexical/react/LexicalAutoLinkPlugin";
import { createLinkMatcherWithRegExp } from "@lexical/link";

const HTTP_URL_MATCHER = createLinkMatcherWithRegExp(/\bhttps?:\/\/[^\s<>"'`[\]{}|\\^]+/i);

/**
 * Lexical plugin that automatically converts URLs starting with http/https into clickable links.
 *
 * @returns AutoLink plugin configured for HTTP(S) detection
 */
export function UrlAutoLinkPlugin() {
  return <AutoLinkPlugin matchers={[HTTP_URL_MATCHER]} />;
}
