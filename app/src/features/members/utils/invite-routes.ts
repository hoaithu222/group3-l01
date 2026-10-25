import type { Href } from 'expo-router';

import type { ParsedInvite } from './parse-invite-input';

/**
 * Đích của một mã mời đã bóc — CÙNG hai route mà deep link đang dùng (`app/invite/[code].tsx`,
 * `app/invite/e/[token].tsx`), nên màn xem trước/tham gia không biết mã đến từ deep link hay từ ô dán/quét.
 *
 * ⚠️ Tên tham số của hai route KHÁC nhau (`code` và `token`) — nhầm là màn đích nhận `undefined` và hiện
 * "Liên kết không hợp lệ" dù mã đúng. Typed routes bắt được ca gõ sai tên.
 */
export function inviteHref({ kind, token }: ParsedInvite): Href {
  return kind === 'EMAIL'
    ? { params: { token }, pathname: '/invite/e/[token]' }
    : { params: { code: token }, pathname: '/invite/[code]' };
}
