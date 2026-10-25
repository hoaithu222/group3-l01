/**
 * Bốn lỗi hỏng ÂM THẦM — không ném ngoại lệ, chỉ cho ra kết quả sai.
 *
 * Chúng gom vào một file vì cùng một tính chất: `tsc` xanh, lint xanh, giao
 * diện vẫn render, chỉ có nội dung là sai. Đúng loại lỗi phải khoá bằng bài
 * kiểm, vì không có gì khác bắt được.
 */

import { describe, expect, it } from 'vitest';

import { decodeJwtPayload } from '@/shared/utils/browser/jwt.utils';
import { formatRelativeTime } from '@/shared/utils/format/format.utils';
import { labelInt, fmt3 } from '@/shared/charts/utils/chart-tokens';

/** Dựng một JWT giả — chỉ phần payload là thật, chữ ký không dùng tới. */
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(payload))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${b64}.signature`;
}

describe('decodeJwtPayload — claim tiếng Việt', () => {
  it('giữ nguyên dấu', () => {
    // `atob` trả latin1 (mỗi ký tự = một byte) nên đọc thẳng sẽ ra
    // "Nguyá»…n VÄƒn A". Và `JSON.parse` KHÔNG ném lỗi — hỏng hoàn toàn im lặng.
    const token = fakeJwt({ name: 'Nguyễn Văn A', sub: '42' });
    expect(decodeJwtPayload<{ name: string }>(token)?.name).toBe('Nguyễn Văn A');
  });

  it('token rỗng / hỏng trả null, không ném', () => {
    expect(decodeJwtPayload(null)).toBeNull();
    expect(decodeJwtPayload('khong-phai-jwt')).toBeNull();
  });
});

describe('nhãn biểu đồ không được in ra chữ "NaN"', () => {
  it('labelInt', () => {
    // Guard cũ `v == null` KHÔNG bắt NaN: `NaN == null` là false. Nguồn phổ
    // biến nhất là Recharts gọi formatter lúc chưa có payload.
    expect(labelInt(Number.NaN)).toBe('');
    expect(labelInt(Number.POSITIVE_INFINITY)).toBe('');
    expect(labelInt(1234)).toBe('1.234'); // vi-VN dùng dấu chấm
  });

  it('fmt3', () => {
    expect(fmt3(Number.NaN)).toBe('');
    expect(fmt3(Number.NEGATIVE_INFINITY)).toBe('');
  });
});

describe('formatRelativeTime với mốc TƯƠNG LAI', () => {
  it('không đọc hạn còn 3 ngày thành "Vừa xong"', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(future)).not.toBe('Vừa xong');
  });

  it('mốc vừa xảy ra vẫn là "Vừa xong"', () => {
    expect(formatRelativeTime(new Date())).toBe('Vừa xong');
  });
});

describe('showErrorToast với lỗi KHÔNG phải của axios', () => {
  it('lỗi ném tay hiện đúng câu của nó, không thành "lỗi mạng"', async () => {
    const { showErrorToast } = await import('@/shared/utils/toast.utils');
    const { useToastStore } = await import('@/shared/ui/overlays/toast-store');

    useToastStore.setState({ toasts: [] });
    // `throw new Error(...)` là pattern mà `form-validation.md §4` DẠY dùng để
    // giữ modal mở khi trùng mã. Bản trước ép kiểu thẳng sang `AxiosError`, mà
    // `Error` thường không có `.response` → `extractErrorMessage` hiểu nhầm là
    // đứt mạng và hiện "Không thể kết nối đến máy chủ".
    showErrorToast(new Error('Mã đã được sử dụng'));

    const messages = useToastStore.getState().toasts.map((t) => t.title);
    expect(messages).toContain('Mã đã được sử dụng');
    expect(messages.join(' ')).not.toContain('kết nối');
  });

  it('null / chuỗi không làm ném lỗi ngay trong lúc xử lý lỗi', async () => {
    const { showErrorToast } = await import('@/shared/utils/toast.utils');
    // `error.response` trên `null` ném TypeError — tức là hỏng khi đang chữa hỏng.
    expect(() => showErrorToast(null, 'Dự phòng')).not.toThrow();
    expect(() => showErrorToast('Câu lỗi dạng chuỗi')).not.toThrow();
  });
});
