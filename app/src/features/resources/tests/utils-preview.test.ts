import { extensionOf, isCodeExtension, prismLanguageFor } from '../utils/code-language';
import { countLines, evaluateCodePreview, tokenizeCode } from '../utils/code-tokens';
import { shouldAskBeforeLoading } from '../utils/metered-gate';
import { resolvePreview } from '../utils/preview-kind';

describe('resolvePreview — cách xem theo type', () => {
  it('loại xem thẳng được dùng bản GỐC (không xin `preview`)', () => {
    expect(resolvePreview({ previewStatus: 'NATIVE', type: 'PDF' })).toEqual({
      kind: 'pdf',
      variant: 'original',
    });
    expect(resolvePreview({ previewStatus: 'NATIVE', type: 'IMAGE' }).kind).toBe('image');
    expect(resolvePreview({ previewStatus: 'NATIVE', type: 'VIDEO' }).kind).toBe('video');
    expect(resolvePreview({ previewStatus: 'NATIVE', type: 'AUDIO' }).kind).toBe('audio');
    expect(resolvePreview({ previewStatus: 'NATIVE', type: 'CODE' }).kind).toBe('code');
    expect(resolvePreview({ previewStatus: 'NATIVE', type: 'TEXT' }).kind).toBe('text');
  });

  it('Office: P0 chưa chuyển ⇒ không hỗ trợ; P1 READY ⇒ xem như PDF bản `preview`', () => {
    expect(resolvePreview({ previewStatus: 'NONE', type: 'DOC' }).kind).toBe('unsupported');
    expect(resolvePreview({ previewStatus: 'PENDING', type: 'SLIDE' }).kind).toBe('unsupported');
    expect(resolvePreview({ previewStatus: 'READY', type: 'SHEET' })).toEqual({
      kind: 'pdf',
      variant: 'preview',
    });
    expect(resolvePreview({ previewStatus: 'NONE', type: 'OTHER' }).kind).toBe('unsupported');
  });
});

describe('hỏi trước khi tải tệp lớn qua dữ liệu di động', () => {
  const MB = 1024 * 1024;

  it('chỉ hỏi khi > 5 MB + kết nối tính phí + loại nặng + chưa đồng ý', () => {
    const base = { allowed: false, expensive: true, kind: 'pdf' as const, size: 6 * MB };
    expect(shouldAskBeforeLoading(base)).toBe(true);
    expect(shouldAskBeforeLoading({ ...base, allowed: true })).toBe(false);
    expect(shouldAskBeforeLoading({ ...base, expensive: false })).toBe(false);
    expect(shouldAskBeforeLoading({ ...base, size: 5 * MB })).toBe(false);
    expect(shouldAskBeforeLoading({ ...base, kind: 'code' })).toBe(false);
  });
});

describe('ngôn ngữ mã', () => {
  it('đuôi + ngôn ngữ do server → tên Prism; không biết ⇒ plain', () => {
    expect(extensionOf('a/b/App.TSX')).toBe('tsx');
    expect(extensionOf('Makefile')).toBeUndefined();
    expect(extensionOf('.gitignore')).toBeUndefined();
    expect(isCodeExtension('py')).toBe(true);
    expect(isCodeExtension('exe')).toBe(false);
    expect(prismLanguageFor({ extension: 'ts', language: 'typescript', name: 'a.ts' })).toBe(
      'typescript',
    );
    expect(prismLanguageFor({ extension: 'yml', language: null, name: 'ci.yml' })).toBe('yaml');
    expect(prismLanguageFor({ extension: 'rb', language: null, name: 'a.rb' })).toBe('plain');
    expect(prismLanguageFor({ extension: null, language: null, name: 'README' })).toBe('plain');
  });
});

describe('tokenizeCode', () => {
  it('tô đúng vai trò: từ khoá, chuỗi, số, chú thích; số dòng khớp', () => {
    const lines = tokenizeCode('const a = "x"; // ghi chú\nlet n = 42;', 'typescript');
    expect(lines).toHaveLength(2);
    const kinds = (line: (typeof lines)[number]) => line.map((t) => t.kind);
    expect(kinds(lines[0] ?? [])).toEqual(expect.arrayContaining(['keyword', 'string', 'comment']));
    expect(kinds(lines[1] ?? [])).toEqual(expect.arrayContaining(['keyword', 'number']));
    expect((lines[0] ?? []).map((t) => t.text).join('')).toBe('const a = "x"; // ghi chú');
  });

  it('ngôn ngữ ngoài bộ Prism ⇒ chữ trần theo dòng, không ném lỗi', () => {
    expect(tokenizeCode('a\nb', 'khong-co')).toEqual([
      [{ kind: 'plain', text: 'a' }],
      [{ kind: 'plain', text: 'b' }],
    ]);
    expect(tokenizeCode('x', 'plain')).toHaveLength(1);
  });
});

describe('giới hạn xem mã (500 KB / 2.000 dòng)', () => {
  const limits = { maxBytes: 512 * 1024, maxLines: 2000 };

  it('quá dung lượng ⇒ too-large TRƯỚC khi tải nội dung', () => {
    expect(evaluateCodePreview({ ...limits, size: 512 * 1024 + 1 })).toBe('too-large');
    expect(evaluateCodePreview({ ...limits, size: 512 * 1024 })).toBe('ok');
  });

  it('quá số dòng ⇒ too-large; đếm dòng không tính dòng trống cuối', () => {
    expect(evaluateCodePreview({ ...limits, lineCount: 2001, size: 1 })).toBe('too-large');
    expect(evaluateCodePreview({ ...limits, lineCount: 2000, size: 1 })).toBe('ok');
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(countLines('')).toBe(0);
  });
});
