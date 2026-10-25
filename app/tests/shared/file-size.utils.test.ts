import { formatFileSize } from '@/shared/utils/format/file-size.utils';

/**
 * Dung lượng tệp — MỘT hàm chung thay cho năm bản tự viết của từng feature. Ba bản cũ dùng `toFixed(1)` nên hiện
 * `3.4 MB` (dấu chấm — người Việt đọc là "ba nghìn bốn trăm") trong khi hai bản kia hiện `3,4 MB`.
 */
describe('formatFileSize', () => {
  it('dấu PHẨY thập phân, bậc 1024, nhãn KB/MB/GB', () => {
    expect(formatFileSize(1536)).toBe('1,5 KB');
    expect(formatFileSize(3.4 * 1024 * 1024)).toBe('3,4 MB');
    expect(formatFileSize(1024 ** 3)).toBe('1 GB');
  });

  it('không hiện ",0" — và từ 100 trở lên bỏ phần lẻ', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(2 * 1024 ** 3)).toBe('2 GB');
    expect(formatFileSize(128.6 * 1024 * 1024)).toBe('129 MB');
  });

  it('dưới 1 KB thì hiện đúng số byte', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('⛔ giá trị không dùng được ⇒ chuỗi rỗng (hoặc `fallback`), KHÔNG bịa "0 B" và không lòi NaN', () => {
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('');
    expect(formatFileSize(null, { fallback: '—' })).toBe('—');
  });
});
