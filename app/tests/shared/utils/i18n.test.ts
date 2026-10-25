import {
  createTranslator,
  formatString,
  pluralize,
  registerStrings,
  t,
  tCommon,
} from '@/shared/utils/i18n';

/**
 * `t(key, params)` không thư viện, cấu trúc khoá sẵn cho i18next (p0-12 README §2 "Chuỗi").
 */

describe('t — chuỗi chung (không gian tên `common`)', () => {
  it('tra khoá phân cấp', () => {
    expect(t('common.action.retry')).toBe('Thử lại');
    expect(t('common.state.error.title')).toBe('Không tải được dữ liệu');
  });

  it('thế tham số {tên}; tham số thiếu thì GIỮ NGUYÊN {tên} (lộ ra là quên truyền)', () => {
    expect(t('common.rateLimit.wait', { seconds: 42 })).toBe('Thử lại sau 42s');
    expect(t('common.rateLimit.wait')).toBe('Thử lại sau {seconds}s');
  });

  it('khoá thiếu ⇒ trả CHÍNH KHOÁ và cảnh báo MỘT lần', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(t('common.khong.ton.tai')).toBe('common.khong.ton.tai');
    expect(t('common.khong.ton.tai')).toBe('common.khong.ton.tai');
    expect(t('khong-gian-ten-la.x')).toBe('khong-gian-ten-la.x');

    expect(warn).toHaveBeenCalledTimes(2); // một lần cho mỗi khoá khác nhau, không lặp
    warn.mockRestore();
  });

  it('khoá trỏ vào một NHÁNH (không phải lá) ⇒ coi như thiếu', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(t('common.action')).toBe('common.action');
    warn.mockRestore();
  });
});

describe('số nhiều', () => {
  it('chọn zero / one / other theo `count`; `one` thiếu thì rơi về `other`', () => {
    const forms = { zero: 'Không có ai', one: 'Một người', other: '{count} người' };

    expect(pluralize(forms, 0)).toBe('Không có ai');
    expect(pluralize(forms, 1)).toBe('Một người');
    expect(pluralize(forms, 5)).toBe('{count} người');
    expect(pluralize({ other: '{count} người' }, 0)).toBe('{count} người');
    expect(pluralize({ other: '{count} người' }, 1)).toBe('{count} người');
  });

  it('t() dùng `count` để chọn dạng rồi thế tham số', () => {
    expect(t('common.count.others', { count: 0 })).toBe('');
    expect(t('common.count.others', { count: 2 })).toBe('2 người khác');
  });
});

describe('createTranslator — chuỗi của một feature, khoá kiểm kiểu', () => {
  const tx = createTranslator({
    chat: {
      title: 'Tin nhắn của {name}',
      unread: { zero: 'Không có tin mới', other: '{count} tin mới' },
    },
    plain: 'Xin chào',
  });

  it('tra khoá lá, tham số và số nhiều', () => {
    expect(tx('plain')).toBe('Xin chào');
    expect(tx('chat.title', { name: 'An' })).toBe('Tin nhắn của An');
    expect(tx('chat.unread', { count: 0 })).toBe('Không có tin mới');
    expect(tx('chat.unread', { count: 3 })).toBe('3 tin mới');
  });

  it('tCommon là bộ dịch của chuỗi chung', () => {
    expect(tCommon('offline.banner')).toBe('Bạn đang ngoại tuyến');
  });
});

describe('registerStrings — không gian tên của feature cho t()', () => {
  it('đăng ký rồi tra `<không-gian-tên>.<khoá>`', () => {
    registerStrings('thu-nghiem', { loi: { chao: 'Chào {ten}' } });

    expect(t('thu-nghiem.loi.chao', { ten: 'Bình' })).toBe('Chào Bình');
  });
});

describe('formatString', () => {
  it('thế nhiều tham số, số cũng được', () => {
    expect(formatString('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
  });
});
