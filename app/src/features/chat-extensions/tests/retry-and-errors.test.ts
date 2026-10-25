import { describeChatExtError } from '../utils/error-info';
import { DEFAULT_CHAT_EXT_LIMITS, readChatExtLimits } from '../utils/chat-ext-limits';
import { retryWhenBusy } from '../utils/retry-busy';
import { failReasonText } from '../utils/schedule-fail-reasons.constants';
import { apiError } from './fixtures';

describe('retryWhenBusy — bầu phiếu nhóm đông (503 SYS_503)', () => {
  it('503 hai lần rồi thành công → trả kết quả, chờ CÓ JITTER giữa các lượt (tăng dần)', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const run = jest
      .fn()
      .mockRejectedValueOnce(apiError(503, 'SYS_503'))
      .mockRejectedValueOnce(apiError(503, 'SYS_503'))
      .mockResolvedValueOnce('ok');

    await expect(retryWhenBusy(run, sleep)).resolves.toBe('ok');

    expect(run).toHaveBeenCalledTimes(3);
    const [first, second] = sleep.mock.calls.map((c) => c[0] as number);
    expect(first).toBeGreaterThanOrEqual(150);
    expect(first).toBeLessThan(300);
    expect(second).toBeGreaterThanOrEqual(300);
    expect(second).toBeLessThan(450);
  });

  it('hết lượt vẫn 503 → ném NGUYÊN lỗi cuối (để hiện "nhiều người đang thao tác")', async () => {
    const error = apiError(503, 'SYS_503');
    const run = jest.fn().mockRejectedValue(error);

    await expect(retryWhenBusy(run, jest.fn().mockResolvedValue(undefined))).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('lỗi KHÁC 503 (vd 409 POLL_004) → ném ngay, không thử lại', async () => {
    const run = jest.fn().mockRejectedValue(apiError(409, 'POLL_004'));
    const sleep = jest.fn();

    await expect(retryWhenBusy(run, sleep)).rejects.toMatchObject({ response: { status: 409 } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe('describeChatExtError — mã lỗi → câu tiếng Việt', () => {
  it.each([
    ['POLL_003', 400, 'Khảo sát này chỉ cho chọn một lựa chọn'],
    ['POLL_004', 409, 'Khảo sát đã kết thúc, không thể bầu thêm'],
    ['POLL_006', 403, 'Khảo sát ẩn danh không hiển thị danh sách người bầu'],
    ['SCHED_004', 403, 'Bạn không còn quyền gửi tin ở đây hoặc cuộc trò chuyện đã đóng'],
    ['MSG_012', 404, 'Tin không còn khả dụng'],
    ['SYS_503', 503, 'Nhiều người đang thao tác cùng lúc, hãy thử lại sau ít giây'],
  ])('%s (%i) → "%s"', (code, status, message) => {
    expect(describeChatExtError(apiError(status, code)).message).toBe(message);
  });

  it('phân loại: ô giờ (SCHED_001/REMIND_001/POLL_002) · không còn (POLL_005/MSG_012/404) · đã đổi (SCHED_003/RES_003) · bận (503)', () => {
    expect(describeChatExtError(apiError(400, 'SCHED_001'))).toMatchObject({ gone: false, timeField: true });
    expect(describeChatExtError(apiError(400, 'REMIND_001')).timeField).toBe(true);
    expect(describeChatExtError(apiError(400, 'POLL_002')).timeField).toBe(true);
    expect(describeChatExtError(apiError(404, 'POLL_005')).gone).toBe(true);
    expect(describeChatExtError(apiError(409, 'SCHED_003')).stale).toBe(true);
    expect(describeChatExtError(apiError(409, 'RES_003')).stale).toBe(true);
    expect(describeChatExtError(apiError(503, 'SYS_503')).busy).toBe(true);
  });

  it('VAL_001 kèm details.reason=WORKSPACE_MISMATCH → giải thích bằng lời, không câu chung', () => {
    const info = describeChatExtError(apiError(400, 'VAL_001', { reason: 'WORKSPACE_MISMATCH' }));
    expect(info.message).toMatch(/không thuộc cùng nhóm/);
  });

  it('lỗi KHÔNG phải axios (TypeError) → không đọc error.response, không ném lỗi mới', () => {
    expect(describeChatExtError(new TypeError('boom'))).toMatchObject({ gone: false, message: 'boom', stale: false });
  });

  it('câu KHÔNG chứa con số giới hạn cứng (admin hạ được) — trừ "1 phút" là bất biến giao thức', () => {
    for (const code of ['POLL_001', 'POLL_002', 'SCHED_002', 'REMIND_002']) {
      expect(describeChatExtError(apiError(400, code)).message).not.toMatch(/\b(10|30|50|100|365)\b/);
    }
  });
});

describe('lý do tin hẹn giờ lỗi', () => {
  it('mỗi failReason có câu tiếng Việt; thiếu/lạ → UNKNOWN; BLOCKED không lộ ai chặn ai', () => {
    expect(failReasonText('NO_PERMISSION')).toBe('Bạn không còn quyền gửi tin ở đây');
    expect(failReasonText('BLOCKED')).toBe('Không thể gửi tin này');
    expect(failReasonText(null)).toBe('Không gửi được do lỗi hệ thống');
    expect(failReasonText('LẠ' as never)).toBe('Không gửi được do lỗi hệ thống');
  });
});

describe('readChatExtLimits — giới hạn từ capabilities', () => {
  it('BE cũ chưa trả nhóm giới hạn → mặc định; có trả → dùng số của BE (đã hạ)', () => {
    expect(readChatExtLimits(undefined)).toEqual(DEFAULT_CHAT_EXT_LIMITS);
    const limits = readChatExtLimits({ poll: { optionsMax: 5 }, scheduledMessage: { sendAtMaxDays: 7 }, reminder: { remindAtMaxDays: 30 }, task: { titleMax: 120 } });
    expect(limits.poll.optionsMax).toBe(5);
    expect(limits.poll.questionMax).toBe(300);
    expect(limits.scheduled.sendAtMaxDays).toBe(7);
    expect(limits.reminder.remindAtMaxDays).toBe(30);
    expect(limits.task.titleMax).toBe(120);
  });

  it('giá trị hỏng (chuỗi, âm, NaN) không làm sai giới hạn', () => {
    const limits = readChatExtLimits({ poll: { optionsMax: 'mười', questionMax: -1, optionMax: Number.NaN } });
    expect(limits.poll).toEqual(DEFAULT_CHAT_EXT_LIMITS.poll);
  });
});
