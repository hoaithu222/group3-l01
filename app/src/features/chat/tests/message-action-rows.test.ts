import { makeMessage, PERMS } from '../cache/apply-socket-event.fixtures';
import {
  buildMessageActionRows,
  type MessageActionRow,
  type MessageActionRowsInput,
} from '../components/actions/message-action-rows';

/**
 * Danh sách hàng của `MessageActionSheet` (tấm nhấn giữ tin nhắn). Kẻ ngăn của tấm tính theo hàng ĐANG HIỆN, nên hàng thiếu quyền
 * phải bị BỎ HẲN khỏi mảng (không phải trả về rồi ẩn) — thiếu quyền thu hồi thì "Báo cáo" mới là hàng cuối và không treo vạch cụt.
 */
function input(overrides: Partial<MessageActionRowsInput> = {}): MessageActionRowsInput {
  return {
    act: (fn) => fn,
    confirmRecall: jest.fn(),
    isSaved: false,
    onEdit: jest.fn(),
    onForward: jest.fn(),
    onHide: jest.fn(),
    onPin: jest.fn(),
    onReply: jest.fn(),
    onUnpin: jest.fn(),
    reportMessage: jest.fn(),
    ...overrides,
  };
}

const keys = (rows: MessageActionRow[]) => rows.map((row) => row.key);

describe('buildMessageActionRows', () => {
  it('bỏ hẳn hàng thiếu quyền/không áp dụng (không sửa, không thu hồi, không luồng, không lưu)', () => {
    const { lower, upper } = buildMessageActionRows(makeMessage({}), input());

    expect(keys(upper)).toEqual(['reply', 'forward', 'copy', 'pin']);
    expect(keys(lower)).toEqual(['hide', 'time', 'report']);
  });

  it('"Thu hồi" (phá huỷ) đứng CUỐI, tô đỏ và chỉ mở hộp xác nhận — không đi qua "đóng tấm"', () => {
    const act = jest.fn((fn: () => void) => fn);
    const confirmRecall = jest.fn();
    const message = makeMessage({ myPermissions: { ...PERMS, canRecall: true } });

    const { lower } = buildMessageActionRows(message, input({ act, confirmRecall }));
    const last = lower[lower.length - 1];

    expect(last).toMatchObject({ danger: true, key: 'recall', label: 'Thu hồi' });
    act.mockClear();
    last?.onPress();
    expect(confirmRecall).toHaveBeenCalledTimes(1);
    expect(act).not.toHaveBeenCalled();
  });

  it('hàng thường đóng tấm TRƯỚC (`act`) rồi mới chạy việc với đúng tin', () => {
    const calls: string[] = [];
    const act = (fn: () => void) => () => {
      calls.push('close');
      fn();
    };
    const onReply = jest.fn(() => calls.push('reply'));
    const message = makeMessage({ id: 'm-7' });

    const { upper } = buildMessageActionRows(message, input({ act, onReply }));
    upper.find((row) => row.key === 'reply')?.onPress();

    expect(calls).toEqual(['close', 'reply']);
    expect(onReply).toHaveBeenCalledWith(message);
  });

  it('"Lưu" chỉ khi nơi gọi nối cơ chế lưu và tin là tin NGƯỜI DÙNG chưa thu hồi; nhãn theo `isSaved`', () => {
    const onToggleSave = jest.fn();

    const saved = buildMessageActionRows(makeMessage({}), input({ isSaved: true, onToggleSave }));
    expect(saved.upper.find((row) => row.key === 'save')?.label).toBe('Bỏ lưu');

    const recalled = buildMessageActionRows(
      makeMessage({ deleted: true }),
      input({ onToggleSave }),
    );
    expect(keys(recalled.upper)).not.toContain('save');
  });

  it('tin đang ghim ⇒ "Bỏ ghim" gọi onUnpin, không gọi onPin', () => {
    const onPin = jest.fn();
    const onUnpin = jest.fn();
    const message = makeMessage({ pinnedAt: '2026-09-18T00:00:00.000Z' });

    const { upper } = buildMessageActionRows(message, input({ onPin, onUnpin }));
    const pin = upper.find((row) => row.key === 'pin');
    pin?.onPress();

    expect(pin?.label).toBe('Bỏ ghim');
    expect(onUnpin).toHaveBeenCalledWith(message);
    expect(onPin).not.toHaveBeenCalled();
  });
});
