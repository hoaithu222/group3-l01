import { parseDeepLink } from '@/shell/deeplink';

/**
 * SHL-02 — bộ phân tích liên kết (p0-12 README §5): mọi dạng hợp lệ (https/scheme, có/không query) → ý định có kiểu;
 * link lạ/hỏng → `null` (nơi gọi mở màn chính, KHÔNG crash).
 */

const DOMAIN = 'https://superapp.vcijsc.com';
const CONV = '5f8d0d55b54764421b7156c3';

describe('parseDeepLink — dạng hợp lệ', () => {
  it.each([
    // [tên, url, kỳ vọng]
    [
      'mời (link chung), https',
      `${DOMAIN}/invite/AbC123`,
      { code: 'AbC123', kind: 'LINK', type: 'INVITE' },
    ],
    [
      'mời (link chung), scheme riêng',
      'superapp://invite/AbC123',
      { code: 'AbC123', kind: 'LINK', type: 'INVITE' },
    ],
    [
      'mời đích danh theo email',
      `${DOMAIN}/invite/e/tok_123-x`,
      { code: 'tok_123-x', kind: 'EMAIL', type: 'INVITE' },
    ],
    ['mã họp', `${DOMAIN}/m/abc-defg-hjk`, { code: 'abc-defg-hjk', type: 'MEETING_CODE' }],
    [
      'mã họp gõ HOA được chuẩn hoá',
      `${DOMAIN}/m/ABC-DEFG-HJK`,
      { code: 'abc-defg-hjk', type: 'MEETING_CODE' },
    ],
    [
      'hội thoại (link cũ /m/<ObjectId>)',
      `${DOMAIN}/m/${CONV}`,
      { conversationId: CONV, type: 'CONVERSATION' },
    ],
    ['hội thoại /c/', `${DOMAIN}/c/${CONV}`, { conversationId: CONV, type: 'CONVERSATION' }],
    [
      'hội thoại /c/ kèm tin',
      `${DOMAIN}/c/${CONV}?m=msg_1`,
      { conversationId: CONV, messageId: 'msg_1', type: 'CONVERSATION' },
    ],
    [
      'tin trong kênh',
      `${DOMAIN}/w/ws1/c/ch1?m=msg1`,
      { chId: 'ch1', messageId: 'msg1', type: 'MESSAGE_LINK', wsId: 'ws1' },
    ],
    [
      'kênh (không có tin)',
      'superapp://w/ws1/c/ch1',
      { chId: 'ch1', type: 'MESSAGE_LINK', wsId: 'ws1' },
    ],
    ['cuộc gọi', 'superapp://call/call_123', { callId: 'call_123', type: 'CALL' }],
    ['dấu / cuối', `${DOMAIN}/c/${CONV}/`, { conversationId: CONV, type: 'CONVERSATION' }],
    [
      'scheme viết HOA + fragment',
      `SUPERAPP://invite/x1#phan-doan`,
      { code: 'x1', kind: 'LINK', type: 'INVITE' },
    ],
  ])('%s', (_name, url, expected) => {
    expect(parseDeepLink(url)).toEqual(expected);
  });

  it('chỉ giữ tham số `m`; mọi tham số khác (token, code…) bị bỏ — không mang bí mật đi cùng', () => {
    const intent = parseDeepLink(`${DOMAIN}/c/${CONV}?m=msg_1&token=BI-MAT&code=999`);

    expect(intent).toEqual({ conversationId: CONV, messageId: 'msg_1', type: 'CONVERSATION' });
    expect(JSON.stringify(intent)).not.toContain('BI-MAT');
  });

  it('`m` sai dạng (chèn ký tự lạ) bị bỏ, link vẫn mở được', () => {
    expect(parseDeepLink(`${DOMAIN}/c/${CONV}?m=../../etc`)).toEqual({
      conversationId: CONV,
      type: 'CONVERSATION',
    });
  });
});

describe('parseDeepLink — link lạ / hỏng ⇒ null', () => {
  it.each([
    ['không phải URL', 'not-a-url'],
    ['rỗng', ''],
    ['javascript:', 'javascript:alert(1)'],
    ['trang khác của app', `${DOMAIN}/login`],
    ['đặt lại mật khẩu (mang token)', `${DOMAIN}/reset-password?token=t`],
    ['/invite thiếu mã', `${DOMAIN}/invite`],
    ['/invite quá sâu', `${DOMAIN}/invite/a/b/c`],
    ['/m/ mã lạ (không phải mã họp, không phải ObjectId)', `${DOMAIN}/m/xyz`],
    ['mã họp có ký tự ngoài bảng (i, l, o)', `${DOMAIN}/m/abc-defg-hij`],
    ['đi lên thư mục cha', `${DOMAIN}/c/../login`],
    ['mã hoá phần trăm', `${DOMAIN}/c/%2e%2e`],
    ['khoảng trắng trong đoạn', `${DOMAIN}/w/a b/c/x`],
    ['/w/ thiếu kênh', `${DOMAIN}/w/ws1/c`],
    ['// ở giữa', `${DOMAIN}/c//x`],
    ['quá dài', `${DOMAIN}/c/${'a'.repeat(2100)}`],
    ['host có userinfo (lừa host)', 'https://superapp.vcijsc.com@evil.com/invite/x'],
  ])('%s', (_name, url) => {
    expect(parseDeepLink(url)).toBeNull();
  });
});

describe('parseDeepLink — giới hạn miền / scheme (link bấm TRONG app)', () => {
  const options = { hosts: ['superapp.vcijsc.com'], schemes: ['superapp'] };

  it('nhận đúng miền (không phân biệt hoa/thường) và đúng scheme', () => {
    expect(parseDeepLink('https://SuperApp.VCIJSC.com/c/abc', options)).toMatchObject({
      type: 'CONVERSATION',
    });
    expect(parseDeepLink('superapp://c/abc', options)).toMatchObject({ type: 'CONVERSATION' });
  });

  it('miền lạ KHÔNG bao giờ được coi là lời mời/hội thoại của app', () => {
    expect(parseDeepLink('https://ke-xau.com/invite/abc', options)).toBeNull();
    expect(parseDeepLink('https://superapp.vcijsc.com.ke-xau.com/invite/abc', options)).toBeNull();
  });

  it('scheme lạ bị từ chối khi có khai danh sách scheme', () => {
    expect(parseDeepLink('otherapp://c/abc', options)).toBeNull();
  });
});
