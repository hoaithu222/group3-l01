import { decodeJwtPayload, isTokenFresh } from '@/shared/utils/jwt.utils';

/** Dựng một JWT giả (chữ ký rác — hàm này cố ý KHÔNG kiểm chữ ký). */
function makeToken(payload: Record<string, unknown>): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.chu-ky-gia`;
}

describe('decodeJwtPayload', () => {
  it('đọc được payload thường', () => {
    expect(decodeJwtPayload(makeToken({ sub: '1', exp: 123 }))).toEqual({ sub: '1', exp: 123 });
  });

  /**
   * ⛔ Ca QUAN TRỌNG NHẤT của hàm này.
   *
   * Tên người dùng trong token gần như luôn có dấu tiếng Việt, mà mỗi ký tự có
   * dấu chiếm 2–3 byte UTF-8. Giải base64 xong mà không giải tiếp UTF-8 thì
   * "Nguyễn" ra "NguyÃªn" — và nó hiện thẳng lên đầu màn hình, chỗ dễ thấy nhất.
   */
  it('giải đúng UTF-8 — tên tiếng Việt không bị vỡ chữ', () => {
    const payload = decodeJwtPayload<{ name: string }>(
      makeToken({ name: 'Nguyễn Văn Ạ — Phòng Kỹ thuật' }),
    );
    expect(payload?.name).toBe('Nguyễn Văn Ạ — Phòng Kỹ thuật');
  });

  it('token rác trả null thay vì ném lỗi', () => {
    expect(decodeJwtPayload('khong-phai-jwt')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
    expect(decodeJwtPayload('a.b.c')).toBeNull();
  });
});

describe('isTokenFresh', () => {
  const inSeconds = (offset: number) => Math.floor(Date.now() / 1000) + offset;

  it('token còn hạn xa ⇒ true', () => {
    expect(isTokenFresh(makeToken({ exp: inSeconds(3600) }), 60_000)).toBe(true);
  });

  it('token đã hết hạn ⇒ false', () => {
    expect(isTokenFresh(makeToken({ exp: inSeconds(-10) }), 60_000)).toBe(false);
  });

  it('token sắp hết hạn TRONG biên an toàn ⇒ false (để refresh chủ động)', () => {
    expect(isTokenFresh(makeToken({ exp: inSeconds(30) }), 60_000)).toBe(false);
  });

  /**
   * Đoán sai theo hướng "hết hạn" thì client TỰ đăng xuất một phiên vẫn tốt —
   * người dùng mất việc đang làm dở. Đoán sai theo hướng "còn hạn" thì cùng lắm
   * một request ăn 401 và luồng refresh xử lý tiếp. Nên mặc định là "còn hạn".
   */
  it('token không đọc được / không khai exp ⇒ coi là CÒN hạn', () => {
    expect(isTokenFresh(makeToken({ sub: '1' }), 60_000)).toBe(true);
    expect(isTokenFresh('khong-phai-jwt', 60_000)).toBe(true);
  });

  it('không có token ⇒ false', () => {
    expect(isTokenFresh(null, 60_000)).toBe(false);
  });
});
