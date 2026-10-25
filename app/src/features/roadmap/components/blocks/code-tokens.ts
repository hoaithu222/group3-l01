import { normalizeTokens, Prism } from 'prism-react-renderer';

/**
 * Tô màu khối `code` của buổi học bằng `prism-react-renderer` (đã là dependency, app.md §6 "không thêm gói").
 *
 * ⚠️ File PHỤ TRỢ colocate trong `components/blocks/` (không phải `utils/` — app.md §2 khoá cứng `utils/` còn
 * đúng 3 file). Cùng nếp `components/flashcard/card-haptics.ts` của `study`: helper riêng của MỘT nhóm component,
 * đặt cạnh nơi dùng thay vì bắt cả feature phải biết tới nó.
 *
 * Vai trò MÀU của token → token màu của app ở `CodeBlock.tsx` (`useThemeColors`) — KHÔNG mang mã màu thô: theme
 * Prism có sẵn là hex cứng, không đổi theo sáng/tối (cùng lý do `resources/utils/code-tokens.ts`).
 */
export type CodeTokenKind =
  | 'comment'
  | 'function'
  | 'keyword'
  | 'number'
  | 'plain'
  | 'punctuation'
  | 'string';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const KIND_BY_TYPE: Record<string, CodeTokenKind> = {
  atrule: 'keyword',
  'attr-name': 'function',
  'attr-value': 'string',
  boolean: 'keyword',
  builtin: 'function',
  cdata: 'comment',
  char: 'string',
  'class-name': 'function',
  comment: 'comment',
  constant: 'number',
  doctype: 'comment',
  function: 'function',
  keyword: 'keyword',
  number: 'number',
  operator: 'punctuation',
  prolog: 'comment',
  property: 'function',
  punctuation: 'punctuation',
  regex: 'string',
  selector: 'keyword',
  string: 'string',
  symbol: 'number',
  tag: 'keyword',
};

function kindOf(types: readonly string[]): CodeTokenKind {
  for (let i = types.length - 1; i >= 0; i -= 1) {
    const kind = KIND_BY_TYPE[types[i] ?? ''];
    if (kind) return kind;
  }
  return 'plain';
}

function plainLines(code: string): CodeToken[][] {
  return code.split('\n').map((line) => [{ kind: 'plain' as const, text: line }]);
}

/** Chia mã thành DÒNG × TOKEN thuần dữ liệu. Ngôn ngữ không có trong `Prism.languages` (hoặc `null`) ⇒ chữ trần. */
export function tokenizeRoadmapCode(code: string, lang: string | null): CodeToken[][] {
  const grammar = lang ? Prism.languages[lang] : undefined;
  if (!grammar) return plainLines(code);
  const lines = normalizeTokens(Prism.tokenize(code, grammar));
  return lines.map((line) =>
    line
      .filter((token) => token.content !== '')
      .map((token) => ({ kind: kindOf(token.types), text: token.content })),
  );
}
