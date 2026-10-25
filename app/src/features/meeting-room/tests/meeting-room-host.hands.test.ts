import { apiClient } from '@/core/api/client';

import { meetingRoomHostService } from '../api/meeting-room-host.service';

/** Hạ tay MỘT người (BE `POST /meetings/:meetingId/hands/:userId/lower`, 204) — cùng luật `skipErrorToast` với mọi thao tác chủ trì. */
jest.mock('@/core/api/client', () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), post: jest.fn() },
}));

describe('meetingRoomHostService — hạ tay', () => {
  it('lowerHand: POST /hands/:userId/lower; lowerAllHands: POST /hands/lower-all', async () => {
    const post = jest.mocked(apiClient.post).mockResolvedValue({ data: null });

    await meetingRoomHostService.lowerHand('m1', 'u2');
    expect(post).toHaveBeenLastCalledWith(
      '/meetings/m1/hands/u2/lower',
      {},
      { skipErrorToast: true },
    );
    await meetingRoomHostService.lowerAllHands('m1');
    expect(post).toHaveBeenLastCalledWith(
      '/meetings/m1/hands/lower-all',
      {},
      { skipErrorToast: true },
    );
  });
});
