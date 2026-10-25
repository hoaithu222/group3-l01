import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { SkillUnlockedEvent } from '../api/career.types';
import { SkillUnlockedHost } from '../components/SkillUnlockedSheet';
import { careerKeys } from '../queries/career.keys';
import { resetUnlockSeen } from '../utils/unlock-seen';
import { makeClient, renderWithClient } from './fixtures';

/**
 * app.md p6-06 §3, §8: `skill:unlocked` ⇒ tấm chúc mừng hiện MỘT lần mỗi kỹ năng (nhận trùng không hiện lại), làm mới danh mục; "Xem huy hiệu"
 * mở chi tiết kỹ năng; cờ `career` tắt ⇒ im.
 */
const mockFlag = { current: true as boolean | undefined };
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => mockFlag.current }));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

const EVENT: SkillUnlockedEvent = { code: 'reactjs', icon: 'keyboard', name: 'ReactJS', skillId: 'skill-react', unlockedAt: '2026-09-25T00:00:00Z', v: 1 };

const emit = (payload: SkillUnlockedEvent) =>
  act(async () => {
    mockSocket.__emitServer(SocketEvent.SKILL_UNLOCKED, payload);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetUnlockSeen();
  mockFlag.current = true;
  useAuthStore.getState().setAuth({ token: 't', user: { email: 'a@b.c', id: 'user-1', name: 'Tôi', permissions: [], roles: [] } });
});

describe('SkillUnlockedHost', () => {
  it('hiện MỘT lần mỗi kỹ năng; "Xem huy hiệu" mở chi tiết; làm mới danh mục', async () => {
    const client = makeClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    await renderWithClient(<SkillUnlockedHost />, client);

    await emit(EVENT);
    expect(await screen.findByText('Bạn vừa đạt huy hiệu kỹ năng xác thực ReactJS.')).toBeOnTheScreen();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: careerKeys.skills() });

    await fireEvent.press(screen.getByRole('button', { name: 'Để sau' }));
    await waitFor(() => expect(screen.queryByText(/Bạn vừa đạt huy hiệu/)).toBeNull());

    await emit(EVENT);
    expect(screen.queryByText(/Bạn vừa đạt huy hiệu/)).toBeNull();

    await emit({ ...EVENT, name: 'Node.js', skillId: 'skill-node' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Xem huy hiệu' }));
    expect(router.push).toHaveBeenCalledWith('/me/career/skills/skill-node');
  });

  it('cờ career tắt → không hiện gì', async () => {
    mockFlag.current = false;
    await renderWithClient(<SkillUnlockedHost />);
    await emit(EVENT);
    expect(screen.queryByText(/Bạn vừa đạt huy hiệu/)).toBeNull();
  });
});
