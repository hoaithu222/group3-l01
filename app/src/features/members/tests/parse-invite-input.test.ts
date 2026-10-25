import { parseInviteInput } from '../utils/parse-invite-input';

/**
 * `parseInviteInput` — cửa vào DUY NHẤT của mã mời khi người dùng dán/gõ/quét (máy ảo Android không bấm
 * được link). Sai ở đây là câm lặng: link hợp lệ bị báo sai, hoặc token bị đổi chữ hoa/thường rồi BE trả 404.
 */

/** 43 ký tự base64url, đủ hoa/thường/số/`_`/`-` — đúng độ dài token BE sinh (32 byte, không đệm). */
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-aBcDe';
const OTHER = 'ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210-_AbCdE';
/** Token bắt đầu bằng `-` và kết thúc bằng `_` — hai ký tự biên dễ bị regex "ăn" mất. */
const EDGE = `-${'aZ'.repeat(20)}9_`;

const link = (token = TOKEN) => ({ kind: 'LINK', token });
const email = (token = TOKEN) => ({ kind: 'EMAIL', token });

describe('parseInviteInput', () => {
  it('token mẫu đúng 43 ký tự (mọi ca dưới đây dựa vào con số này)', () => {
    expect([TOKEN.length, OTHER.length, EDGE.length]).toEqual([43, 43, 43]);
  });

  it.each([
    ['https prod', `https://superapp.vcijsc.com/invite/${TOKEN}`],
    ['http localhost dev', `http://localhost:8081/invite/${TOKEN}`],
    ['scheme riêng — `invite` là HOST', `superapp://invite/${TOKEN}`],
    ['đường dẫn tương đối', `/invite/${TOKEN}`],
    ['không có dấu / đầu', `invite/${TOKEN}`],
    ['dấu / cuối', `https://x.y/invite/${TOKEN}/`],
    ['có query', `https://x.y/invite/${TOKEN}?utm=zalo&ref=1`],
    ['có hash', `https://x.y/invite/${TOKEN}#top`],
    ['/ + query + hash', `https://x.y/invite/${TOKEN}/?a=1#b`],
    ['scheme/host/đường dẫn viết hoa', `HTTPS://SUPERAPP.VCIJSC.COM/Invite/${TOKEN}`],
  ])('link mời chung → LINK: %s', (_name, input) => {
    expect(parseInviteInput(input)).toEqual(link());
  });

  it.each([
    ['https', `https://superapp.vcijsc.com/invite/e/${TOKEN}`],
    ['scheme riêng', `superapp://invite/e/${TOKEN}`],
    ['đường dẫn tương đối', `/invite/e/${TOKEN}`],
    ['query + hash + /', `http://localhost:8081/invite/e/${TOKEN}/?a=1#b`],
  ])('lời mời email đích danh → EMAIL: %s', (_name, input) => {
    expect(parseInviteInput(input)).toEqual(email());
  });

  it('token bắt đầu bằng chữ `e` KHÔNG bị nhầm với đoạn `e/` của lời mời email', () => {
    const token = `e${TOKEN.slice(1)}`;
    expect(parseInviteInput(`https://x.y/invite/${token}`)).toEqual(link(token));
  });

  it.each([
    ['khoảng trắng + xuống dòng thừa', `  \n\t https://x.y/invite/${TOKEN} \r\n\n`],
    ['ngoặc tròn', `(https://x.y/invite/${TOKEN})`],
    ['ngoặc vuông/nhọn', `[<https://x.y/invite/${TOKEN}>]`],
    ['nháy kép và đơn', `"'https://x.y/invite/${TOKEN}'"`],
    ['nháy cong và «»', `“«https://x.y/invite/${TOKEN}»”`],
    ['chữ "Link mời: " đứng trước', `Link mời: https://x.y/invite/${TOKEN}`],
    ['dính liền dấu hai chấm', `Link mời:https://x.y/invite/${TOKEN}`],
    ['câu tiếng Việt bao quanh', `Chào bạn, vào nhóm nhé: https://x.y/invite/${TOKEN}. Cảm ơn!`],
    ['ký tự rộng 0 đứng trước', `\u200bhttps://x.y/invite/${TOKEN}\u200b`],
  ])('chịu được rác bao quanh: %s', (_name, input) => {
    expect(parseInviteInput(input)).toEqual(link());
  });

  it.each([
    ['trần', TOKEN],
    ['có khoảng trắng/xuống dòng thừa', `\n  ${TOKEN}  \n`],
    ['trong nháy', `"${TOKEN}"`],
    ['sau "Mã mời: "', `Mã mời: ${TOKEN}`],
    ['sau dấu hai chấm liền', `Mã mời:${TOKEN}`],
    ['cuối câu có dấu chấm', `Mã của bạn là ${TOKEN}.`],
  ])('token trần → LINK: %s', (_name, input) => {
    expect(parseInviteInput(input)).toEqual(link());
  });

  it('⛔ token PHÂN BIỆT hoa/thường — trả NGUYÊN VĂN, không hạ chữ', () => {
    const parsed = parseInviteInput(`HTTPS://X.Y/invite/${TOKEN}`);
    expect(parsed?.token).toBe(TOKEN);
    expect(parsed?.token).not.toBe(TOKEN.toLowerCase());
    expect(parseInviteInput(TOKEN.toLowerCase())?.token).toBe(TOKEN.toLowerCase());
  });

  it('ký tự biên `-` đầu và `_` cuối vẫn thuộc token, ở cả link lẫn token trần', () => {
    expect(parseInviteInput(`https://x.y/invite/${EDGE}`)).toEqual(link(EDGE));
    expect(parseInviteInput(`https://x.y/invite/e/${EDGE}`)).toEqual(email(EDGE));
    expect(parseInviteInput(EDGE)).toEqual(link(EDGE));
    expect(parseInviteInput(`"${EDGE}"`)).toEqual(link(EDGE));
  });

  it.each([
    ['chuỗi rỗng', ''],
    ['chỉ có khoảng trắng', ' \n\t '],
    ['văn bản thường', 'xin chào cả nhà'],
    ['URL không phải link mời', 'https://example.com/hoc-tap'],
    ['thiếu token', 'https://x.y/invite/'],
    ['thiếu token (email)', 'https://x.y/invite/e/'],
    ['token 42 ký tự (link)', `https://x.y/invite/${TOKEN.slice(1)}`],
    ['token 42 ký tự (trần)', TOKEN.slice(1)],
    ['token 44 ký tự (link)', `https://x.y/invite/${TOKEN}x`],
    ['token 44 ký tự (trần)', `${TOKEN}x`],
    ['hai token dính liền', `https://x.y/invite/${TOKEN}${OTHER}`],
    ['token có đệm "="', `${TOKEN.slice(0, 42)}=`],
    ['ký tự lạ "+" giữa token', `${TOKEN.slice(0, 20)}+${TOKEN.slice(21)}`],
    ['dấu cách giữa token', `${TOKEN.slice(0, 20)} ${TOKEN.slice(21)}`],
    ['dấu chấm giữa token', `https://x.y/invite/${TOKEN.slice(0, 20)}.${TOKEN.slice(21)}`],
    ['chữ có dấu trong token', `https://x.y/invite/${TOKEN.slice(0, 20)}ế${TOKEN.slice(21)}`],
    ['token nằm trong đường dẫn KHÁC', `https://x.y/w/${TOKEN}`],
    ['token là tham số query của URL khác', `https://x.y/s?code=${TOKEN}`],
    ['scheme riêng, route khác', `superapp://live/${TOKEN}`],
  ])('⛔ sai độ dài/ký tự lạ/không phải link mời → null: %s', (_name, input) => {
    expect(parseInviteInput(input)).toBeNull();
  });

  it('nhiều đoạn: lấy đoạn hợp lệ ĐỨNG TRƯỚC, bỏ qua đoạn hỏng', () => {
    const both = `https://x.y/invite/${TOKEN} và https://x.y/invite/e/${OTHER}`;
    expect(parseInviteInput(both)).toEqual(link());
    const brokenFirst = `invite/${TOKEN.slice(1)} rồi /invite/e/${OTHER}`;
    expect(parseInviteInput(brokenFirst)).toEqual(email(OTHER));
    expect(parseInviteInput(`${OTHER} https://x.y/invite/${TOKEN}`)).toEqual(link(OTHER));
  });
});
