import { AxiosError } from 'axios';

import { CRITICAL_PATH_ERROR_MESSAGES } from '../constants/critical-path.constants';
import { criticalPathErrorMessage, readPreviewFromError } from '../utils/critical-path-errors';
import { rescheduleChangeFrom } from '../utils/reschedule-change';

function apiError(code: string, details?: unknown, status = 409): AxiosError {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details, message: 'Câu của BE' } },
    headers: {},
    status,
    statusText: 'err',
  });
}

describe('criticalPathErrorMessage — nhãn TASK_005/006/017–021 nằm trong feature', () => {
  it.each(['TASK_005', 'TASK_006', 'TASK_017', 'TASK_018', 'TASK_019', 'TASK_020', 'TASK_021'])(
    '%s có câu tiếng Việt',
    (code) => {
      expect(CRITICAL_PATH_ERROR_MESSAGES[code]).toBeTruthy();
      expect(criticalPathErrorMessage(apiError(code))).toBe(CRITICAL_PATH_ERROR_MESSAGES[code]);
    },
  );

  it('TASK_020 nói "thử lại sau" (app.md §3)', () => {
    expect(criticalPathErrorMessage(apiError('TASK_020'))).toBe('Bảng đang dời lịch, thử lại sau');
  });

  it('TASK_005 liệt kê TIÊU ĐỀ trong vòng và khép vòng', () => {
    const titles: Record<string, string> = { a: 'A', b: 'B', c: 'C' };
    const message = criticalPathErrorMessage(apiError('TASK_005', { cycle: ['b', 'c', 'a'] }), (id) => titles[id]);
    expect(message).toContain('B → C → A → B');
  });

  it('TASK_005 với thẻ không tra được tiêu đề → "một thẻ khác", không để trống', () => {
    const message = criticalPathErrorMessage(apiError('TASK_005', { cycle: ['x', 'y'] }));
    expect(message).toContain('một thẻ khác → một thẻ khác');
  });

  it('TASK_005 không có cycle → câu chung', () => {
    expect(criticalPathErrorMessage(apiError('TASK_005'))).toBe(CRITICAL_PATH_ERROR_MESSAGES.TASK_005);
  });

  it('mất mạng (không có mã) rơi về câu "lỗi kết nối" của base', () => {
    const offline = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(criticalPathErrorMessage(offline)).toMatch(/kết nối/i);
  });
});

describe('readPreviewFromError', () => {
  const preview = {
    affected: [],
    affectedCount: 2,
    mode: 'SYNC',
    previewToken: 'a'.repeat(64),
    skipped: [],
    source: { newDueDate: '2026-09-25T00:00:00.000Z', oldDueDate: null, taskId: 't1', version: 3 },
    timezone: 'Asia/Ho_Chi_Minh',
    truncated: false,
  };

  it('đọc details.preview của TASK_006/TASK_019', () => {
    expect(readPreviewFromError(apiError('TASK_006', { preview }))?.previewToken).toBe('a'.repeat(64));
  });

  it('thiếu previewToken hoặc source → null (không mở tấm cảnh báo rỗng)', () => {
    expect(readPreviewFromError(apiError('TASK_006', { preview: { ...preview, previewToken: undefined } }))).toBeNull();
    expect(readPreviewFromError(apiError('TASK_006', { preview: { ...preview, source: undefined } }))).toBeNull();
    expect(readPreviewFromError(apiError('TASK_006'))).toBeNull();
    expect(readPreviewFromError(new Error('x'))).toBeNull();
  });

  it('điền mặc định cho trường thiếu (affected/skipped/timezone)', () => {
    const minimal = readPreviewFromError(
      apiError('TASK_019', { preview: { previewToken: 'b'.repeat(64), source: preview.source } }),
    );
    expect(minimal).toMatchObject({ affected: [], affectedCount: 0, mode: 'SYNC', skipped: [], truncated: false });
    expect(minimal?.timezone).toBe('Asia/Ho_Chi_Minh');
  });
});

describe('rescheduleChangeFrom', () => {
  it('lấy hạn từ patch; ngày bắt đầu KHÔNG có trong patch thì giữ giá trị hiện tại (luôn gửi tường minh)', () => {
    expect(
      rescheduleChangeFrom({ dueDate: '2026-09-30T00:00:00.000Z' }, { dueDate: '2026-09-25T00:00:00.000Z', startDate: '2026-09-20T00:00:00.000Z' }),
    ).toEqual({ dueDate: '2026-09-30T00:00:00.000Z', startDate: '2026-09-20T00:00:00.000Z' });
  });

  it('patch có startDate (kể cả null) thì lấy giá trị của patch', () => {
    expect(
      rescheduleChangeFrom({ dueDate: '2026-09-30T00:00:00.000Z', startDate: null }, { dueDate: null, startDate: '2026-09-20T00:00:00.000Z' }),
    ).toEqual({ dueDate: '2026-09-30T00:00:00.000Z', startDate: null });
  });

  it('không có hạn nào → null (không dời lịch được)', () => {
    expect(rescheduleChangeFrom({}, { dueDate: null, startDate: null })).toBeNull();
  });
});
