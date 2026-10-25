import {
  INITIAL_SNAPSHOT,
  parseNotice,
  statusBanner,
  statusLabel,
  type SessionSnapshot,
} from '../collab/session-status';

const synced = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...INITIAL_SNAPSHOT,
  connection: 'synced',
  everSynced: true,
  ...over,
});
const banner = (over: Partial<Parameters<typeof statusBanner>[0]> = {}) =>
  statusBanner({
    archived: false,
    full: false,
    nearLimit: false,
    readOnly: false,
    snapshot: synced(),
    tokenProblem: false,
    ...over,
  });

describe('parseNotice', () => {
  it('đọc `{ v: 1, type: "notice", code }` hợp lệ; sai định dạng/mã lạ → null (không ném)', () => {
    expect(parseNotice(JSON.stringify({ code: 'SAVE_FAILED', type: 'notice', v: 1 }))).toBe('SAVE_FAILED');
    expect(parseNotice(JSON.stringify({ code: 'READ_ONLY', type: 'notice' }))).toBe('READ_ONLY');
    expect(parseNotice(JSON.stringify({ code: 'GÌ_ĐÓ', type: 'notice' }))).toBeNull();
    expect(parseNotice(JSON.stringify({ code: 'SAVE_FAILED', type: 'khác' }))).toBeNull();
    expect(parseNotice('không phải json')).toBeNull();
    expect(parseNotice('null')).toBeNull();
  });
});

describe('statusLabel — luôn bằng CHỮ', () => {
  it('thứ tự ưu tiên: ngắt > mất kết nối > đang kết nối > chỉ xem > chưa lưu được > đang đồng bộ > đã lưu', () => {
    expect(statusLabel(synced({ connection: 'closed' }), false).text).toBe('Đã ngắt kết nối');
    expect(statusLabel(synced({ connection: 'offline' }), false)).toEqual({ text: 'Mất kết nối', tone: 'warning' });
    expect(statusLabel(INITIAL_SNAPSHOT, false).text).toBe('Đang kết nối…');
    expect(statusLabel(synced(), true).text).toBe('Chỉ xem');
    expect(statusLabel(synced({ saveFailed: true }), false).text).toBe('Chưa lưu được — sẽ thử lại');
    expect(statusLabel(synced({ unsynced: true }), false).text).toBe('Đang đồng bộ…');
    expect(statusLabel(synced(), false)).toEqual({ text: 'Đã lưu', tone: 'success' });
  });
});

describe('statusBanner — MỘT banner ưu tiên cao nhất', () => {
  it('không có gì đáng nói → null', () => {
    expect(banner()).toBeNull();
  });

  it('bảng đầy (engine trả limit hoặc server báo TOO_LARGE) thắng mọi thứ', () => {
    expect(banner({ archived: true, full: true })?.tone).toBe('error');
    expect(banner({ snapshot: synced({ tooLarge: true }) })?.text).toMatch(/đầy/);
  });

  it('lưu trữ > chỉ xem > ngoại tuyến > sắp đầy > phiên không làm mới được', () => {
    expect(banner({ archived: true, readOnly: true })?.text).toMatch(/lưu trữ/);
    expect(banner({ readOnly: true })?.text).toMatch(/Chỉ xem/);
    expect(banner({ snapshot: synced({ connection: 'offline' }) })?.text).toMatch(/ngoại tuyến/);
    expect(banner({ nearLimit: true })?.text).toMatch(/sắp đạt/);
    expect(banner({ tokenProblem: true })?.text).toMatch(/làm mới/);
  });

  it('server báo đã lưu trữ (snapshot.archived) cũng hiện banner lưu trữ', () => {
    expect(banner({ snapshot: synced({ archived: true }) })?.text).toMatch(/lưu trữ/);
  });
});
