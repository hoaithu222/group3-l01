import { act, renderHook } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import type { RoomRole } from '../api/meeting-room.types';
import {
  HAND_ALERT_WINDOW_MS,
  raisedHandAlertText,
  useRaisedHandAlerts,
} from '../hooks/useRaisedHandAlerts';
import { meetingRoomApi } from '../store/meeting-room.store';
import type { RoomPerson } from '../utils/room-people.utils';
import { makePerson } from './fixtures';

/**
 * Chủ trì/đồng chủ trì được báo khi NGƯỜI KHÁC giơ tay (gom theo lô); không báo tay của mình, tay đã giơ từ trước lúc vào/nối lại/được cấp
 * quyền, người thường không bao giờ nhận.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

/** Giờ giơ tay theo đồng hồ (giả) hiện tại — `offsetMs` < 0 là đã giơ TỪ TRƯỚC. */
const at = (offsetMs = 0): string => new Date(Date.now() + offsetMs).toISOString();

async function mount(people: RoomPerson[], role: RoomRole = 'HOST') {
  return renderHook(
    ({ list, as }: { as: RoomRole; list: RoomPerson[] }) => useRaisedHandAlerts(list, as),
    { initialProps: { as: role, list: people } },
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  meetingRoomApi.reset();
  meetingRoomApi.patch({ meetingId: 'm1', phase: 'IN_ROOM' });
});

afterEach(() => {
  meetingRoomApi.reset();
  jest.useRealTimers();
});

const lan = makePerson({ name: 'Lan', userId: 'lan' });
const binh = makePerson({ name: 'Bình', userId: 'binh' });
const cuong = makePerson({ name: 'Cường', userId: 'cuong' });
const me = makePerson({ isLocal: true, name: 'Tôi', userId: 'me' });

describe('raisedHandAlertText', () => {
  it('một người: "Lan đang giơ tay"; nhiều người: "Lan và 2 người khác đang giơ tay"', () => {
    expect(raisedHandAlertText(['Lan'])).toBe('Lan đang giơ tay');
    expect(raisedHandAlertText(['Lan', 'Bình', 'Cường'])).toBe('Lan và 2 người khác đang giơ tay');
  });
});

describe('useRaisedHandAlerts', () => {
  it('tay ĐÃ giơ lúc mình vào phòng: gieo im lặng; người khác giơ tay sau đó → báo (sau cửa sổ gom)', async () => {
    const hook = await mount([{ ...lan, handRaisedAt: at(-60_000) }, binh, me]);
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS * 2));
    expect(showToast).not.toHaveBeenCalled();

    await hook.rerender({
      as: 'HOST',
      list: [{ ...lan, handRaisedAt: at(-60_000) }, { ...binh, handRaisedAt: at(10) }, me],
    });
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('info', 'Bình đang giơ tay');
  });

  it('nhiều người giơ gần nhau → MỘT thông báo, người giơ sớm nhất đứng tên', async () => {
    const hook = await mount([lan, binh, cuong]);
    await hook.rerender({
      as: 'HOST',
      list: [{ ...lan, handRaisedAt: at(30) }, binh, { ...cuong, handRaisedAt: at(10) }],
    });
    await act(async () => jest.advanceTimersByTime(300));
    await hook.rerender({
      as: 'HOST',
      list: [
        { ...lan, handRaisedAt: at(-270) },
        { ...binh, handRaisedAt: at(5) },
        { ...cuong, handRaisedAt: at(-290) },
      ],
    });
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS));

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('info', 'Cường và 2 người khác đang giơ tay');
  });

  it('không báo: tay của CHÍNH MÌNH; tay đã hạ trước khi hết cửa sổ gom; người xem là người thường', async () => {
    const hook = await mount([lan, me]);
    await hook.rerender({ as: 'HOST', list: [lan, { ...me, handRaisedAt: at(10) }] });
    await hook.rerender({ as: 'HOST', list: [{ ...lan, handRaisedAt: at(20) }, me] });
    await hook.rerender({ as: 'HOST', list: [lan, me] }); // Lan đổi ý, hạ ngay
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS));
    expect(showToast).not.toHaveBeenCalled();

    const member = await mount([lan], 'MEMBER');
    await member.rerender({ as: 'MEMBER', list: [{ ...lan, handRaisedAt: at(10) }] });
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('nối lại / vừa được cấp quyền: tay giơ trong lúc đó (tới lẻ tẻ sau khi vào lại) không báo; tay giơ SAU đó vẫn báo', async () => {
    const hook = await mount([lan, binh], 'MEMBER');
    await hook.rerender({ as: 'MEMBER', list: [{ ...lan, handRaisedAt: at(-5_000) }, binh] });
    await act(async () => jest.advanceTimersByTime(1_000));
    await hook.rerender({ as: 'CO_HOST', list: [{ ...lan, handRaisedAt: at(-6_000) }, binh] }); // vừa thành đồng chủ trì

    await act(async () => meetingRoomApi.patch({ phase: 'RECONNECTING' }));
    const during = at(0);
    await act(async () => jest.advanceTimersByTime(2_000));
    await act(async () => meetingRoomApi.patch({ phase: 'IN_ROOM' }));
    await hook.rerender({
      as: 'CO_HOST',
      list: [
        { ...lan, handRaisedAt: at(-8_000) },
        { ...binh, handRaisedAt: during },
      ],
    });
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS));
    expect(showToast).not.toHaveBeenCalled();

    await hook.rerender({
      as: 'CO_HOST',
      list: [
        { ...lan, handRaisedAt: at(10) },
        { ...binh, handRaisedAt: during },
      ],
    });
    await act(async () => jest.advanceTimersByTime(HAND_ALERT_WINDOW_MS));
    expect(showToast).toHaveBeenCalledWith('info', 'Lan đang giơ tay');
  });
});
