import { isEditable, statusBanner, statusLabel } from '../utils/editor-status';
import { normalizePresence } from '../webview/route-editor-message';
import type { StatusPayload } from '../webview/doc-editor-bridge.types';

/**
 * Trạng thái hiển thị của editor (app.md §3): chấm "Đã lưu / Đang đồng bộ… / Mất kết nối / Chưa lưu được — sẽ thử lại" luôn bằng CHỮ, một banner ưu tiên cao nhất,
 * toolbar chỉ khi đang sửa được. Cộng chuẩn hoá người đang mở (tên cắt, màu sai → dự phòng).
 */
const base: StatusPayload = {
  archived: false,
  connection: 'synced',
  mode: 'edit',
  nearLimit: false,
  readOnly: false,
  saveFailed: false,
  tooLarge: false,
  unsynced: false,
};
const s = (over: Partial<StatusPayload>): StatusPayload => ({ ...base, ...over });

describe('statusLabel', () => {
  it.each([
    [null, 'Đang kết nối…'],
    [s({ connection: 'connecting' }), 'Đang kết nối…'],
    [s({ connection: 'offline' }), 'Mất kết nối'],
    [s({ connection: 'closed' }), 'Đã ngắt kết nối'],
    [s({ unsynced: true }), 'Đang đồng bộ…'],
    [s({ saveFailed: true }), 'Chưa lưu được — sẽ thử lại'],
    [s({ readOnly: true, mode: 'view' }), 'Chỉ xem'],
    [s({}), 'Đã lưu'],
  ])('%j → %s', (status, text) => {
    expect(statusLabel(status).text).toBe(text);
  });

  it('SAVE_FAILED ưu tiên hơn "đang đồng bộ" (BE lỗi tạm: các máy vẫn đồng bộ với nhau, nhưng CHƯA lưu)', () => {
    expect(statusLabel(s({ saveFailed: true, unsynced: true })).tone).toBe('warning');
  });
});

describe('statusBanner', () => {
  it('ưu tiên: quá lớn > lưu trữ > chỉ xem > ngoại tuyến > gần đầy > phiên', () => {
    expect(statusBanner(s({ archived: true, readOnly: true, tooLarge: true }), true)?.tone).toBe(
      'error',
    );
    expect(statusBanner(s({ archived: true, readOnly: true }), false)?.text).toMatch(/lưu trữ/);
    expect(statusBanner(s({ readOnly: true }), false)?.text).toMatch(/Chỉ xem/);
    expect(statusBanner(s({ connection: 'offline' }), false)?.text).toMatch(/ngoại tuyến/);
    expect(statusBanner(s({ nearLimit: true }), true)?.text).toMatch(/sắp đạt/);
    expect(statusBanner(s({}), true)?.text).toMatch(/làm mới được phiên/);
    expect(statusBanner(s({}), false)).toBeNull();
  });
});

describe('isEditable', () => {
  it('chỉ khi status không chỉ đọc, chưa đóng, và selectionState.canEdit', () => {
    expect(isEditable(s({}), true)).toBe(true);
    expect(isEditable(s({}), false)).toBe(false);
    expect(isEditable(s({ readOnly: true }), true)).toBe(false);
    expect(isEditable(s({ connection: 'closed' }), true)).toBe(false);
    expect(isEditable(null, true)).toBe(false);
  });
});

describe('normalizePresence', () => {
  it('cắt tên > 80 ký tự, tên trống → "Người dùng", màu sai → màu dự phòng; giữ `self`', () => {
    const users = normalizePresence([
      { color: '#175CD3', id: 'a', name: 'x'.repeat(200), self: true },
      { color: 'javascript:1', id: 'b', name: '   ', self: false },
    ]);
    expect(users[0]?.name).toHaveLength(80);
    expect(users[0]?.self).toBe(true);
    expect(users[1]).toEqual({ color: '#6B7280', id: 'b', name: 'Người dùng', self: false });
  });
});
