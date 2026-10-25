import { act, renderHook } from '@testing-library/react-native';

import { scopeKeyOf } from '@/core/socket';

import { useComposerRestore } from '../hooks/useComposerRestore';
import { useResendFailedMessage } from '../hooks/useResendFailedMessage';
import { getDraft, useDraftsStore } from '../store/drafts.store';
import type { PendingMessage } from '../store/outbox.store';

jest.mock('../hooks/useResendFailedMessage', () => ({ useResendFailedMessage: jest.fn() }));

const MINH = '507f1f77bcf86cd799439011';
const AN = '507f1f77bcf86cd799439022';
const SCOPE = { scopeType: 'CHANNEL' as const, scopeId: 'ch-1', threadId: 'root-1' };
const KEY = scopeKeyOf('CHANNEL', 'ch-1', 'root-1');

function pending(overrides: Partial<PendingMessage>): PendingMessage {
  return {
    clientMessageId: 'c-1',
    scope: SCOPE,
    status: 'FAILED',
    createdAtLocal: '2026-09-19T00:00:00.000Z',
    autoRetried: true,
    content: `Nhờ @{u:${MINH}} và @{u:${AN}} xem`,
    mentions: [
      { type: 'USER', targetId: MINH, label: 'Minh' },
      { type: 'USER', targetId: AN, label: 'An' },
    ],
    ...overrides,
  };
}

describe('useComposerRestore — "Sửa" bản gửi thất bại (MSG_008)', () => {
  beforeEach(() => useDraftsStore.getState().clear());

  it('nạp lại composer bằng chữ hiển thị + chip, và TÔ ĐỎ đúng chip server từ chối', async () => {
    jest
      .mocked(useResendFailedMessage)
      .mockReturnValue(async () =>
        pending({ failCode: 'MSG_008', failInvalidMentionUserIds: [AN] }),
      );
    const { result } = await renderHook(() => useComposerRestore(SCOPE));

    await act(async () => result.current.editPending('c-1'));

    const draft = getDraft(KEY);
    expect(draft.text).toBe('Nhờ @Minh và @An xem');
    expect(draft.mentionRanges.map((r) => [r.label, r.invalid])).toEqual([
      ['Minh', false],
      ['An', true],
    ]);
    expect(result.current.draftRestoreNonce).toBe(1); // ép Composer remount để nạp nháp
  });

  it('server đã nhận bản này (hàm trả undefined) → không đụng nháp, không remount', async () => {
    jest.mocked(useResendFailedMessage).mockReturnValue(async () => undefined);
    const { result } = await renderHook(() => useComposerRestore(SCOPE));

    await act(async () => result.current.editPending('c-1'));

    expect(getDraft(KEY).text).toBe('');
    expect(result.current.draftRestoreNonce).toBe(0);
  });
});
