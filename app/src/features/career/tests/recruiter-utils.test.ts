import { AxiosError } from 'axios';

import { addRole } from '../schemas/career-settings.schemas';
import { hasOfferActions, matchesGroup, needsAttention } from '../utils/offer-format';
import {
  isNetworkFailure,
  isOfferChanged,
  isOfferGone,
  isThreadClosed,
  RECRUITER_ERROR_MESSAGES,
  recruiterErrorMessage,
} from '../utils/recruiter-errors';
import { splitLinks } from '../utils/split-links';
import { httpError } from './jobs-fixtures';

/** Hàm THUẦN của Recruiter board (p6-08): mã `RECR_*` → tiếng Việt, nhóm lọc, tách liên kết, thêm vị trí. Vá cache theo socket: `recruiter-cache.test.ts`. */

describe('mã lỗi RECR_* → tiếng Việt', () => {
  it('đủ RECR_001..012, mỗi mã một câu tiếng Việt không rỗng', () => {
    for (let n = 1; n <= 12; n += 1) {
      const code = `RECR_${String(n).padStart(3, '0')}`;
      expect(RECRUITER_ERROR_MESSAGES[code]).toEqual(expect.stringMatching(/\S{2,}/));
    }
    expect(Object.keys(RECRUITER_ERROR_MESSAGES)).toHaveLength(12);
  });

  it('recruiterErrorMessage ưu tiên câu RECR_*; mã lạ rơi về bộ dịch chung (vẫn là chuỗi có nghĩa)', () => {
    expect(recruiterErrorMessage(httpError(409, 'RECR_009'))).toBe(
      RECRUITER_ERROR_MESSAGES.RECR_009,
    );
    expect(recruiterErrorMessage(httpError(403, 'RECR_008'))).toBe(
      RECRUITER_ERROR_MESSAGES.RECR_008,
    );
    expect(recruiterErrorMessage(new Error('boom')).length).toBeGreaterThan(0);
  });

  it('các bộ nhận diện: đổi trạng thái (RECR_009), thread đóng (RECR_008), không còn (404/CFG_005), lỗi mạng (không có phản hồi)', () => {
    expect(isOfferChanged(httpError(409, 'RECR_009'))).toBe(true);
    expect(isOfferChanged(httpError(409, 'RECR_006'))).toBe(false);
    expect(isThreadClosed(httpError(403, 'RECR_008'))).toBe(true);
    expect(isOfferGone(httpError(404, 'RES_001'))).toBe(true);
    expect(isOfferGone(httpError(403, 'CFG_005'))).toBe(true);
    expect(isOfferGone(httpError(500, 'SYS_500'))).toBe(false);
    expect(isNetworkFailure(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(true);
    expect(isNetworkFailure(httpError(500, 'SYS_500'))).toBe(false);
    expect(isNetworkFailure(new Error('không phải axios'))).toBe(false);
  });
});

describe('nhóm lọc hộp thư', () => {
  it('Mới = SENT + READ (chưa trả lời); Quan tâm = INTERESTED; Đã đóng = DECLINED/WITHDRAWN/EXPIRED; Tất cả = mọi thứ', () => {
    expect(matchesGroup('SENT', 'new')).toBe(true);
    expect(matchesGroup('READ', 'new')).toBe(true);
    expect(matchesGroup('INTERESTED', 'new')).toBe(false);
    expect(matchesGroup('INTERESTED', 'interested')).toBe(true);
    for (const closed of ['DECLINED', 'WITHDRAWN', 'EXPIRED'] as const) {
      expect(matchesGroup(closed, 'closed')).toBe(true);
      expect(matchesGroup(closed, 'all')).toBe(true);
      expect(matchesGroup(closed, 'new')).toBe(false);
    }
    expect(matchesGroup('READ', 'closed')).toBe(false);
  });

  it('cần chú ý = chưa mở HOẶC có tin chưa đọc; thanh hành động chỉ khi chờ trả lời hoặc Quan tâm + thread mở', () => {
    expect(needsAttention({ status: 'SENT', unreadMessages: 0 })).toBe(true);
    expect(needsAttention({ status: 'READ', unreadMessages: 0 })).toBe(false);
    expect(needsAttention({ status: 'INTERESTED', unreadMessages: 1 })).toBe(true);
    expect(hasOfferActions({ status: 'READ', threadOpen: false })).toBe(true);
    expect(hasOfferActions({ status: 'INTERESTED', threadOpen: true })).toBe(true);
    expect(hasOfferActions({ status: 'INTERESTED', threadOpen: false })).toBe(false);
    expect(hasOfferActions({ status: 'WITHDRAWN', threadOpen: false })).toBe(false);
  });
});

describe('splitLinks', () => {
  it('chỉ http(s) thành liên kết; dấu câu cuối trả lại làm chữ thường', () => {
    expect(splitLinks('Xem https://a.vn/jd. Cảm ơn')).toEqual([
      { link: false, text: 'Xem ' },
      { link: true, text: 'https://a.vn/jd' },
      { link: false, text: '.' },
      { link: false, text: ' Cảm ơn' },
    ]);
    expect(splitLinks('(https://a.vn)')).toEqual([
      { link: false, text: '(' },
      { link: true, text: 'https://a.vn' },
      { link: false, text: ')' },
    ]);
  });

  it('scheme khác (javascript:, tel:, intent:) không bao giờ thành liên kết', () => {
    for (const text of ['javascript:alert(1)', 'tel:0900000000', 'intent://x#Intent;end']) {
      expect(splitLinks(text).every((part) => !part.link)).toBe(true);
    }
  });
});

describe('addRole (chip vị trí mong muốn)', () => {
  it('bỏ trùng không phân biệt hoa/thường, cắt khoảng trắng, chặn quá ngắn/dài/quá 5', () => {
    expect(addRole([], '  Front   end ')).toEqual({ error: null, roles: ['Front end'] });
    expect(addRole(['Frontend'], 'frontend')).toEqual({ error: null, roles: ['Frontend'] });
    expect(addRole([], 'A').error).toMatch(/ít nhất 2/);
    expect(addRole([], 'x'.repeat(41)).error).toMatch(/tối đa 40/);
    const five = ['a1', 'b2', 'c3', 'd4', 'e5'];
    expect(addRole(five, 'f6')).toEqual({ error: 'Tối đa 5 vị trí', roles: five });
    expect(addRole(['a1'], '   ')).toEqual({ error: null, roles: ['a1'] });
  });
});
