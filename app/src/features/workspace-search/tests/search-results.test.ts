import { AxiosError } from 'axios';
import dayjs from 'dayjs';

import { WORKSPACE_SEARCH_ERROR_MESSAGES } from '../constants/workspace-search.constants';
import {
  describeFileKind,
  formatCount,
  formatFileSize,
  formatMeetingRange,
  scopeLabel,
  toPresenceState,
} from '../utils/result-format';
import { describeWorkspaceSearchError } from '../utils/search-error';
import { tabAccessibilityLabel, tabLabel } from '../utils/tab-counts';
import { apiError } from './fixtures';

/** Thuần: phân loại lỗi `SRCH_*`/404/429/mạng, nhãn tab kèm số đếm, và định dạng hiển thị của từng loại kết quả. */

describe('describeWorkspaceSearchError', () => {
  it('SRCH_104 (422): quá rộng, đúng thông điệp "Tìm kiếm quá rộng — thêm bộ lọc"', () => {
    const info = describeWorkspaceSearchError(apiError(422, 'SRCH_104'));

    expect(info).toMatchObject({
      code: 'SRCH_104',
      kind: 'too-broad',
      message: 'Tìm kiếm quá rộng — thêm bộ lọc',
    });
    expect(WORKSPACE_SEARCH_ERROR_MESSAGES.SRCH_104).toBe('Tìm kiếm quá rộng — thêm bộ lọc');
  });

  it('404 tách theo MÃ: SRCH_102 → phạm vi mất, CFG_005 → tính năng tắt (đều KHÔNG rời nhóm); 404 khác → mất quyền vào nhóm', () => {
    expect(describeWorkspaceSearchError(apiError(404, 'SRCH_102')).kind).toBe('scope-gone');
    expect(describeWorkspaceSearchError(apiError(404, 'CFG_005')).kind).toBe('feature-off');
    expect(describeWorkspaceSearchError(apiError(404, 'PERM_404')).kind).toBe('workspace-gone');
    expect(describeWorkspaceSearchError(apiError(404, 'RES_001')).kind).toBe('workspace-gone');
  });

  it('403 SRCH_103 → forbidden; 429 → rate-limited kèm retryAfterSeconds (làm tròn lên), thiếu thì 10 giây', () => {
    expect(describeWorkspaceSearchError(apiError(403, 'SRCH_103'))).toMatchObject({
      kind: 'forbidden',
      message: 'Bạn không thể tìm thành viên trong nhóm này',
    });
    expect(
      describeWorkspaceSearchError(apiError(429, 'RATE_002', { retryAfterSeconds: 2.2 })),
    ).toMatchObject({
      kind: 'rate-limited',
      retryAfterSeconds: 3,
    });
    expect(describeWorkspaceSearchError(apiError(429, 'RATE_002'))).toMatchObject({
      retryAfterSeconds: 10,
    });
  });

  it('mất mạng (không có phản hồi) → offline "Cần kết nối để tìm"; lỗi lạ → other', () => {
    const network = new AxiosError('Network Error', 'ERR_NETWORK');

    expect(describeWorkspaceSearchError(network)).toEqual({
      kind: 'offline',
      message: 'Cần kết nối để tìm',
    });
    expect(describeWorkspaceSearchError(new Error('boom')).kind).toBe('other');
    expect(describeWorkspaceSearchError(apiError(500, 'INTERNAL')).kind).toBe('other');
  });
});

describe('tab-counts', () => {
  it('"30+" khi còn trang sau, số thật khi hết; chưa biết thì để nguyên nhãn', () => {
    expect(formatCount(30, true)).toBe('30+');
    expect(formatCount(12, false)).toBe('12');
    expect(tabLabel('Tin nhắn', undefined)).toBe('Tin nhắn');
    expect(tabLabel('Tin nhắn', { count: 30, hasMore: true })).toBe('Tin nhắn 30+');
    expect(tabLabel('Tệp', { count: 0, hasMore: false })).toBe('Tệp 0');
  });

  it('nhãn trợ năng kèm "có kết quả"/"không có kết quả"; chưa biết số thì KHÔNG bịa ra "không có kết quả"', () => {
    expect(tabAccessibilityLabel('Tin nhắn', undefined)).toBe('Tin nhắn');
    expect(tabAccessibilityLabel('Tin nhắn', { count: 12, hasMore: false })).toBe(
      'Tin nhắn, có kết quả, 12',
    );
    expect(tabAccessibilityLabel('Tin nhắn', { count: 30, hasMore: true })).toBe(
      'Tin nhắn, có kết quả, 30 trở lên',
    );
    expect(tabAccessibilityLabel('Tệp', { count: 0, hasMore: false })).toBe(
      'Tệp, không có kết quả',
    );
    // 0 nhưng còn trang sau (BE lọc sau khi lấy): chưa thể nói "không có" — cũng chưa thể nói "có".
    expect(tabAccessibilityLabel('Tệp', { count: 0, hasMore: true })).toBe('Tệp');
  });
});

describe('result-format', () => {
  it('dung lượng dễ đọc, dấu PHẨY thập phân', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1,5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatFileSize(-1)).toBe('');
  });

  it('loại tệp: theo kind của tệp tin, theo MIME/kind của tệp kho tài liệu', () => {
    expect(describeFileKind({ kind: 'IMAGE', mime: 'image/png' }).label).toBe('Ảnh');
    expect(describeFileKind({ kind: 'VOICE', mime: 'audio/ogg' }).label).toBe('Tin nhắn thoại');
    expect(describeFileKind({ kind: 'PDF', mime: 'application/pdf' }).label).toBe('PDF');
    expect(describeFileKind({ kind: 'FILE', mime: 'video/mp4' }).label).toBe('Video');
    expect(describeFileKind({ kind: 'FILE', mime: 'application/zip' }).label).toBe('Tệp');
  });

  it('nơi chứa: kênh có #, nhóm chat/1-1 theo tên, không tra được thì nhãn trung tính', () => {
    expect(scopeLabel({ id: 'c', isPrivate: false, name: 'chung', type: 'CHANNEL' })).toBe(
      '#chung',
    );
    expect(scopeLabel({ id: 'c', isPrivate: false, name: null, type: 'CHANNEL' })).toBe('Kênh');
    expect(scopeLabel({ id: 'v', isPrivate: true, name: 'Trần Bình', type: 'CONVERSATION' })).toBe(
      'Trần Bình',
    );
    expect(scopeLabel({ id: 'v', isPrivate: true, name: null, type: 'CONVERSATION' })).toBe(
      'Tin nhắn riêng',
    );
  });

  it('presence của BE là chuỗi tự do: AWAY như IDLE, giá trị lạ như OFFLINE', () => {
    expect(toPresenceState('ONLINE')).toBe('ONLINE');
    expect(toPresenceState('AWAY')).toBe('IDLE');
    expect(toPresenceState('DND')).toBe('DND');
    expect(toPresenceState('HIDDEN')).toBe('HIDDEN');
    expect(toPresenceState('???')).toBe('OFFLINE');
  });

  it('cuộc họp: ngày giờ theo GIỜ MÁY, giờ kết thúc chỉ hiện giờ', () => {
    const startAt = '2026-09-25T02:00:00.000Z';
    const endAt = '2026-09-25T03:30:00.000Z';

    expect(formatMeetingRange(startAt, endAt)).toBe(
      `${dayjs(startAt).format('DD/MM/YYYY HH:mm')} – ${dayjs(endAt).format('HH:mm')}`,
    );
  });
});
