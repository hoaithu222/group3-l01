import { useCallback, useMemo } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { WalletMember } from '../api';
import { useWalletMembers } from '../queries/wallet-support.queries';

export const LEFT_MEMBER_NAME = 'Người đã rời nhóm';

/**
 * Tên hiển thị của thành viên nhóm. Số dư/khoản chi chỉ mang `userId`
 * (`WalletSummaryView.balances`) nên tên phải tra ở danh sách thành viên.
 *
 * Người đã rời nhóm KHÔNG có trong danh sách ACTIVE nhưng vẫn giữ số dư
 * (README §10) — hiện "Người đã rời nhóm" chứ không để trống hay lộ id thô.
 */
export function useMemberDirectory(wsId: string | undefined) {
  const { data, isError, isLoading, refetch } = useWalletMembers(wsId);
  const meId = useAuthStore((state) => state.user?.id);

  const members: WalletMember[] = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);

  const memberOf = useCallback((userId: string) => byId.get(userId), [byId]);
  const nameOf = useCallback(
    (userId: string) => {
      const member = byId.get(userId);
      return member ? (member.displayName ?? member.name) : LEFT_MEMBER_NAME;
    },
    [byId],
  );

  return {
    members,
    meId,
    isError,
    isLoading,
    memberOf,
    nameOf,
    isMe: (userId: string) => userId === meId,
    refetch,
  };
}

export type MemberDirectory = ReturnType<typeof useMemberDirectory>;
