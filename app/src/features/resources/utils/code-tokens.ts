import { normalizeTokens, Prism } from 'prism-react-renderer';

/**
 * Vai trò MÀU của một token — ánh xạ sang token màu ở `CodePreview`
 * (`useThemeColors`), KHÔNG mang mã màu: theme Prism có sẵn là hex thô, đổi
 * sáng/tối không theo và vi phạm luật "không màu thô".
 */
export type CodeTokenKind =
  'comment' | 'function' | 'keyword' | 'number' | 'plain' | 'punctuation' | 'string';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const KIND_BY_TYPE: Record<string, CodeTokenKind> = {
  comment: 'comment',
  prolog: 'comment',
  doctype: 'comment',
  cdata: 'comment',
  keyword: 'keyword',
  atrule: 'keyword',
  selector: 'keyword',
  tag: 'keyword',
  boolean: 'keyword',
  string: 'string',
  char: 'string',
  'attr-value': 'string',
  regex: 'string',
  number: 'number',
  constant: 'number',
  symbol: 'number',
  function: 'function',
  'class-name': 'function',
  builtin: 'function',
  'attr-name': 'function',
  property: 'function',
  operator: 'punctuation',
  punctuation: 'punctuation',
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

/**
 * Chia mã thành DÒNG × TOKEN thuần dữ liệu (không React) — `CodePreview` chỉ
 * việc vẽ. Ngôn ngữ không có trong `Prism.languages` ⇒ chữ trần, không ném lỗi.
 */
export function tokenizeCode(code: string, prismLanguage: string): CodeToken[][] {
  const grammar = Prism.languages[prismLanguage];
  if (!grammar || prismLanguage === 'plain') return plainLines(code);
  const lines = normalizeTokens(Prism.tokenize(code, grammar));
  return lines.map((line) =>
    line
      .filter((token) => token.content !== '')
      .map((token) => ({ kind: kindOf(token.types), text: token.content })),
  );
}

export type CodePreviewVerdict = 'ok' | 'too-large';

/**
 * `CodePreview` có được phép TẢI/VẼ không (README §2 "Xem mã": 2.000 dòng /
 * 500 KB rồi "Tải về"). Kiểm `size` TRƯỚC khi tải để không kéo cả tệp lớn về
 * chỉ để từ chối; số dòng chỉ biết sau khi có nội dung nên kiểm thêm ở đó.
 */
export function evaluateCodePreview(input: {
  lineCount?: number;
  maxBytes: number;
  maxLines: number;
  size: number;
}): CodePreviewVerdict {
  if (input.size > input.maxBytes) return 'too-large';
  if (input.lineCount !== undefined && input.lineCount > input.maxLines) return 'too-large';
  return 'ok';
}

export function countLines(text: string): number {
  if (text === '') return 0;
  const newlines = text.split('\n').length;
  return text.endsWith('\n') ? newlines - 1 : newlines;
}
