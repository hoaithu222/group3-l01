import { classifyJoinError, hostActionMessage, OFFLINE_MESSAGE } from '../utils/meeting-room-errors';

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả (`isAxiosError` nhận ra qua cờ). */
function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}
const networkError = () => Object.assign(new Error('Network Error'), { isAxiosError: true });

describe('classifyJoinError — mỗi loại một HƯỚNG xử lý, không loại nào là "toast lỗi"', () => {
  it.each(['MEET_006', 'MEET_007', 'MEET_009', 'MEET_010', 'MEET_012', 'MEET_013', 'MEET_017', 'MEET_018'])(
    '%s → màn "không vào được"',
    (code) => {
      expect(classifyJoinError(apiError(409, code))).toEqual({ code, kind: 'BLOCKED' });
    },
  );

  it('404 / MEET_001 / CFG_005 → GONE (không còn khả dụng)', () => {
    expect(classifyJoinError(apiError(404, 'MEET_001'))).toEqual({ code: 'GONE', kind: 'BLOCKED' });
    expect(classifyJoinError(apiError(404, 'X'))).toEqual({ code: 'GONE', kind: 'BLOCKED' });
    expect(classifyJoinError(apiError(403, 'CFG_005'))).toEqual({ code: 'GONE', kind: 'BLOCKED' });
  });

  it('CALL_004 → hỏi chuyển; cờ `sameCallOtherDevice` phân biệt "máy khác" với "cuộc gọi khác"', () => {
    expect(classifyJoinError(apiError(409, 'CALL_004'))).toEqual({ kind: 'BUSY', sameDevice: false });
    expect(classifyJoinError(apiError(409, 'CALL_004', { sameCallOtherDevice: true }))).toEqual({ kind: 'BUSY', sameDevice: true });
  });

  it('RES_003 → tải lại chi tiết; MEET_002/403 → không đủ quyền; mất mạng → OFFLINE', () => {
    expect(classifyJoinError(apiError(409, 'RES_003'))).toEqual({ kind: 'VERSION' });
    expect(classifyJoinError(apiError(403, 'MEET_002'))).toMatchObject({ kind: 'FORBIDDEN' });
    expect(classifyJoinError(networkError())).toEqual({ kind: 'OFFLINE' });
  });

  it('lỗi khác → ERROR kèm thông điệp tiếng Việt, không lộ mã kỹ thuật', () => {
    const failure = classifyJoinError(apiError(500, 'SYS_001'));
    expect(failure.kind).toBe('ERROR');
    expect(classifyJoinError(new Error('boom')).kind).toBe('ERROR');
  });

  it('thông điệp offline nói rõ cần mạng', () => {
    expect(OFFLINE_MESSAGE).toMatch(/kết nối mạng/);
  });
});

describe('hostActionMessage — toast của thao tác chủ trì', () => {
  it('MEET_020 "đã rời phòng", MEET_019 "không thể với chủ trì", MEET_009 "không còn diễn ra"', () => {
    expect(hostActionMessage(apiError(404, 'MEET_020'))).toMatch(/không còn trong phòng/);
    expect(hostActionMessage(apiError(403, 'MEET_019'))).toMatch(/chủ trì/);
    expect(hostActionMessage(apiError(409, 'MEET_009'))).toMatch(/không còn diễn ra/);
    expect(hostActionMessage(apiError(403, 'MEET_002'))).toMatch(/Chỉ chủ trì/);
  });

  it('lỗi khác rơi về `toErrorMessage` (luôn là chuỗi không rỗng)', () => {
    expect(hostActionMessage(new Error('x')).length).toBeGreaterThan(0);
  });
});
