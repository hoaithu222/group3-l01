/**
 * Đuôi tệp mã nguồn (README p3-01 §7 `LIMITS.resource.codeExtensions`) → ngôn
 * ngữ Prism.
 *
 * ⚠️ `prism-react-renderer` đóng gói SẴN một bộ ngôn ngữ cố định; thêm ngôn ngữ
 * ngoài bộ đó phải cài `prismjs` (chưa có trong `package.json` — điều phối viên
 * cài nếu muốn). Nên: `java`/`cs`/`php` rơi về `clike` (chú thích `//`, chuỗi,
 * từ khoá chung) và `scss` về `css`; `rb`/`sh` rơi về `plain` vì `clike` không
 * biết chú thích `#` — tô sai còn tệ hơn không tô.
 */
export const CODE_EXTENSIONS = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'kt',
  'c',
  'h',
  'cpp',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'swift',
  'sql',
  'md',
  'json',
  'yaml',
  'yml',
  'xml',
  'sh',
  'css',
  'scss',
] as const;

const PRISM_BY_EXTENSION: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  java: 'clike',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cs: 'clike',
  go: 'go',
  rs: 'rust',
  rb: 'plain',
  php: 'clike',
  swift: 'swift',
  sql: 'sql',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'markup',
  sh: 'plain',
  css: 'css',
  scss: 'css',
};

/** Đuôi viết thường, không dấu chấm; `undefined` khi tên không có đuôi. */
export function extensionOf(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return undefined;
  return fileName.slice(dot + 1).toLowerCase();
}

export function isCodeExtension(extension: string | null | undefined): boolean {
  return Boolean(
    extension && (CODE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase()),
  );
}

/**
 * Tên ngôn ngữ Prism cho một tệp. `language` do server suy (`typescript`, `python`…)
 * được tin trước, rồi mới tới đuôi; không biết ⇒ `plain` (hiện chữ trần, không tô).
 */
export function prismLanguageFor(file: {
  extension: string | null;
  language: string | null;
  name: string;
}): string {
  const fromServer = file.language?.toLowerCase();
  if (fromServer && fromServer !== 'plain') return PRISM_BY_EXTENSION[fromServer] ?? fromServer;
  const extension = (file.extension ?? extensionOf(file.name))?.toLowerCase();
  return (extension && PRISM_BY_EXTENSION[extension]) || 'plain';
}
