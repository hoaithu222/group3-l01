import type { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { io } from 'socket.io-client';

import { SocketEvent } from '@/core/socket';

import type { MemberCard, MemberListPage, MemberRow as MemberRowData } from '../api';
import { useMemberSocket } from '../hooks/useMemberSocket';
import { memberKeys } from '../queries/members.keys';

import { CARD, newClient, providers, ROW } from './mentor-fixtures';

/**
 * `member:updated` mang `displayTag` (p6-03) và `expiresAt` (p3-04, bản gửi riêng cho OWNER/ADMIN). Hai bản của cùng một thay đổi mang TẬP TRƯỜNG
 * KHÁC NHAU — chỉ GHI trường có mặt, vắng mặt là "bản này không nói" chứ không phải "đã xoá" (không ghi đè nhãn bằng null).
 */
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}
const mockSocket = (io as jest.MockedFunction<typeof io>).mock.results[0]?.value as MockSocket;

function seed(client: QueryClient, row: MemberRowData): void {
  client.setQueryData(memberKeys.list('ws-1', {}), {
    pageParams: [1],
    pages: [
      {
        items: [row],
        meta: { hasNext: false, hasPrev: false, limit: 20, page: 1, total: 1, totalPages: 1 },
      } satisfies MemberListPage,
    ],
  });
  client.setQueryData(memberKeys.card('ws-1', row.userId), { ...row, actions: CARD.actions });
}

const emit = (payload: unknown) =>
  act(async () => {
    mockSocket.__emitServer(SocketEvent.MEMBER_UPDATED, payload);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

const listRow = (client: QueryClient): MemberRowData | undefined =>
  client.getQueryData<{ pages: MemberListPage[] }>(memberKeys.list('ws-1', {}))?.pages[0]?.items[0];

const base = {
  displayName: null,
  role: 'GUEST',
  status: 'ACTIVE',
  userId: 'u-mentor',
  v: 1,
  workspaceId: 'ws-1',
};

describe('useMemberSocket — displayTag/expiresAt', () => {
  it('bản của cả nhóm mang displayTag → dòng + thẻ có nhãn; bản riêng của admin (chỉ có expiresAt) KHÔNG xoá nhãn và cập nhật hạn', async () => {
    const client = newClient();
    seed(client, ROW);
    await renderHook(() => useMemberSocket('ws-1'), { wrapper: providers(client) });

    await emit({ ...base, displayTag: 'MENTOR' });
    expect(listRow(client)?.displayTag).toBe('MENTOR');
    expect(client.getQueryData<MemberCard>(memberKeys.card('ws-1', 'u-mentor'))?.displayTag).toBe(
      'MENTOR',
    );

    const expiresAt = '2026-10-30T00:00:00.000Z';
    await emit({ ...base, expiresAt });
    expect(listRow(client)?.displayTag).toBe('MENTOR');
    expect(listRow(client)?.expiresAt).toBe(expiresAt);
  });

  it('người bị loại (status ≠ ACTIVE) → dòng bị bỏ khỏi danh sách', async () => {
    const client = newClient();
    seed(client, { ...ROW, displayTag: 'MENTOR' });
    await renderHook(() => useMemberSocket('ws-1'), { wrapper: providers(client) });

    await emit({ ...base, status: 'REMOVED' });

    expect(listRow(client)).toBeUndefined();
  });
});
