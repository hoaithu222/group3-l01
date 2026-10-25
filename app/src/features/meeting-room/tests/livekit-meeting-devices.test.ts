import { LiveKitDevices, type RoomContext } from '../media/livekit-meeting-devices';

/**
 * Adapter giơ tay (`LiveKitDevices.setHandRaised`): livekit-client 2.22 `setAttributes` chỉ resolve khi server echo, quá 5 s thì reject
 * `SignalRequestError` lý do `'TimeoutError'` dù server vẫn có thể áp dụng ⇒ quá hạn KHÔNG được coi là thất bại (không hoàn lại mù quáng).
 */

/** Cùng hình với `SignalRequestError` của SDK (`reason` = mã từ chối của server hoặc `'TimeoutError'`). */
class FakeSignalRequestError extends Error {
  constructor(
    message: string,
    readonly reason: number | string,
  ) {
    super(message);
  }
}

function setup(setAttributes: jest.Mock, connected = true) {
  const refresh = jest.fn();
  const context = (): RoomContext => ({
    native: null,
    room: connected ? ({ localParticipant: { setAttributes } } as never) : null,
    sdk: { SignalRequestError: FakeSignalRequestError } as never,
  });
  return { devices: new LiveKitDevices(context, refresh), refresh };
}

describe('LiveKitDevices.setHandRaised', () => {
  it('giơ tay = attribute ISO, hạ tay = chuỗi rỗng; xong thì phát lại snapshot (store thấy attribute THẬT)', async () => {
    const setAttributes = jest.fn(() => Promise.resolve());
    const { devices, refresh } = setup(setAttributes);

    await devices.setHandRaised('2026-10-01T09:00:00.000Z');
    await devices.setHandRaised(null);

    expect(setAttributes).toHaveBeenNthCalledWith(1, { handRaisedAt: '2026-10-01T09:00:00.000Z' });
    expect(setAttributes).toHaveBeenNthCalledWith(2, { handRaisedAt: '' });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('quá hạn chờ echo (TimeoutError) = "đã gửi, chưa xác nhận" ⇒ resolve; server TỪ CHỐI (NOT_ALLOWED…) vẫn ném', async () => {
    const setAttributes = jest
      .fn()
      .mockRejectedValueOnce(
        new FakeSignalRequestError('Request to update local metadata timed out', 'TimeoutError'),
      )
      .mockRejectedValueOnce(new FakeSignalRequestError('not allowed', 2));
    const { devices, refresh } = setup(setAttributes);

    await expect(devices.setHandRaised('2026-10-01T09:00:00.000Z')).resolves.toBeUndefined();
    await expect(devices.setHandRaised('2026-10-01T09:00:00.000Z')).rejects.toThrow('not allowed');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('không có phòng (chưa/không còn kết nối): không gửi gì', async () => {
    const setAttributes = jest.fn(() => Promise.resolve());
    const { devices, refresh } = setup(setAttributes, false);

    await devices.setHandRaised('2026-10-01T09:00:00.000Z');
    expect(setAttributes).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
