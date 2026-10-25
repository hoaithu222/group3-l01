import { AxiosError } from 'axios';

import { isExpiredAt } from '../utils/announcement-status';
import {
  DEADLINE_PRESETS,
  deadlineFromPreset,
  findDeadlinePreset,
} from '../utils/deadline-presets';
import { describeAnnouncementError } from '../utils/error-info';
import { apiError } from './fixtures';

describe('hết hạn', () => {
  const now = Date.parse('2026-09-25T00:00:00.000Z');

  it('theo BE (`expired`) hoặc theo đồng hồ; không hạn thì không bao giờ hết', () => {
    expect(isExpiredAt({ deadlineAt: null, expired: false }, now)).toBe(false);
    expect(isExpiredAt({ deadlineAt: null, expired: true }, now)).toBe(true);
    expect(isExpiredAt({ deadlineAt: '2026-09-25T00:00:01.000Z', expired: false }, now)).toBe(
      false,
    );
    expect(isExpiredAt({ deadlineAt: '2026-09-25T00:00:00.000Z', expired: false }, now)).toBe(true);
  });
});

describe('mốc hạn', () => {
  it('có "Không đặt hạn" + 4 mốc, đều trong trần 30 ngày của BE', () => {
    expect(DEADLINE_PRESETS.map((preset) => preset.label)).toEqual([
      'Không đặt hạn',
      '24 giờ',
      '3 ngày',
      '7 ngày',
      '14 ngày',
    ]);
    for (const preset of DEADLINE_PRESETS) expect(preset.hours ?? 0).toBeLessThanOrEqual(30 * 24);
  });

  it('deadlineFromPreset cộng đúng số giờ vào giờ máy chủ; "không hạn" → undefined (không gửi trường)', () => {
    const now = Date.parse('2026-09-25T00:00:00.000Z');

    expect(deadlineFromPreset(findDeadlinePreset('none'), now)).toBeUndefined();
    expect(deadlineFromPreset(findDeadlinePreset('24h'), now)).toBe('2026-09-26T00:00:00.000Z');
    expect(deadlineFromPreset(findDeadlinePreset('3d'), now)).toBe('2026-09-28T00:00:00.000Z');
    expect(findDeadlinePreset('lạ').key).toBe('none');
  });
});

describe('describeAnnouncementError', () => {
  it.each([
    ['ANN_001', 400, 'Chỉ kênh thông báo mới yêu cầu xác nhận đã đọc'],
    ['ANN_002', 409, 'Kênh đang có quá nhiều thông báo cần xác nhận'],
    ['ANN_003', 410, 'Yêu cầu xác nhận đã bị huỷ hoặc hết hạn'],
    ['CH_004', 409, 'Kênh đã được lưu trữ, không thể thay đổi'],
  ])('%s → nhãn riêng của feature', (code, status, message) => {
    expect(describeAnnouncementError(apiError(status, code))).toMatchObject({ code, message });
  });

  it('ANN_003 (410) là "gone"; 403/404 là "noAccess"; lỗi khác thì không', () => {
    expect(describeAnnouncementError(apiError(410, 'ANN_003')).gone).toBe(true);
    expect(describeAnnouncementError(apiError(403, 'PERM_403')).noAccess).toBe(true);
    expect(describeAnnouncementError(apiError(404, 'RES_001')).noAccess).toBe(true);
    expect(describeAnnouncementError(apiError(409, 'ANN_002'))).toMatchObject({
      gone: false,
      noAccess: false,
    });
  });

  it('mất mạng / lỗi không phải axios → câu chung, không ném', () => {
    const offline = new AxiosError('Network Error', 'ERR_NETWORK');

    expect(describeAnnouncementError(offline).message.length).toBeGreaterThan(0);
    expect(describeAnnouncementError(new Error('boom'))).toMatchObject({
      gone: false,
      message: 'boom',
      noAccess: false,
    });
    expect(describeAnnouncementError('lạ').message.length).toBeGreaterThan(0);
  });
});
