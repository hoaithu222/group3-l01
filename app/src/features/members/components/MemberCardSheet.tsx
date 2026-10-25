import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import {
  useBanMember,
  useMemberCard,
  usePatchMember,
  useRemoveMember,
  useUnbanMember,
} from '../queries/members.queries';
import { EditDisplayNameSheet } from './EditDisplayNameSheet';
import { MemberCardActions } from './MemberCardActions';
import { MemberCardHeader } from './MemberCardHeader';
import { MemberCardLoadError } from './MemberCardLoadError';
import { MemberModerationSheet, type ModerationAction } from './MemberModerationSheet';
import { MemberQuickActions } from './MemberQuickActions';
import { MemberRoleSheet } from './MemberRoleSheet';

const MODERATE_SUCCESS_MESSAGE: Record<ModerationAction, string> = {
  REMOVE: 'Đã loại khỏi nhóm.',
  BAN: 'Đã chặn khỏi nhóm.',
  UNBAN: 'Đã gỡ chặn.',
};

export interface MemberCardSheetProps {
  onClose: () => void;
  /** Chỉ có khi mở từ màn KÊNH (chưa tồn tại ở p1-02) — app.md §3: "khi mở từ màn kênh". */
  onMention?: () => void;
  userId: string | null;
  wsId: string;
}

/**
 * Thẻ thành viên: đầu thẻ ảnh LỚN + tên/vai trò/ngày tham gia, hàng nút nhanh (Nhắn tin · Gọi · Nhắc tên — `MemberQuickActions`), rồi
 * danh sách việc quản lý theo `actions` của BE (app.md p1-02 §3). "Nhắn tin" mở DM thật qua route `/messages/new` của p1-05
 * (`openDirectMessage`); "Gọi" (`canCall`, cờ `voice`) vẫn là Phase 2 (p2-01) nên chỉ báo "sắp có" thay vì điều hướng tới một route
 * chưa tồn tại.
 */
export function MemberCardSheet({ onClose, onMention, userId, wsId }: MemberCardSheetProps) {
  const { data: card, error, isLoading, refetch } = useMemberCard(wsId, userId ?? undefined);
  const patchMember = usePatchMember(wsId);
  const removeMember = useRemoveMember(wsId);
  const banMember = useBanMember(wsId);
  const unbanMember = useUnbanMember(wsId);

  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [displayNameSheetOpen, setDisplayNameSheetOpen] = useState(false);
  const [moderationAction, setModerationAction] = useState<ModerationAction | null>(null);

  const name = card ? (card.displayName ?? card.name) : '';

  function handleModerate(reason: string): void {
    if (!card || !moderationAction) return;
    const mutation =
      moderationAction === 'BAN'
        ? banMember
        : moderationAction === 'UNBAN'
          ? unbanMember
          : removeMember;
    mutation.mutate(
      { userId: card.userId, payload: { reason } },
      {
        onSuccess: () => {
          hapticSuccess(); // việc đã xác nhận (kèm lý do) ở `MemberModerationSheet` vừa xong
          showToast('success', MODERATE_SUCCESS_MESSAGE[moderationAction]);
          setModerationAction(null);
          onClose();
        },
        onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
      },
    );
  }

  return (
    <>
      <BottomSheet scrollable title="Thẻ thành viên" visible={userId !== null} onClose={onClose}>
        {isLoading ? (
          // Cùng hình nội dung thật: đầu thẻ (avatar + tên) rồi các hàng hành động có ô icon.
          <View className="gap-md py-sm">
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </View>
        ) : error || !card ? (
          <MemberCardLoadError error={error} onRetry={() => void refetch()} />
        ) : (
          // `<View>` bọc (không phải con trực tiếp của thân `padded`): khe `gap-xs` của thân không chen giữa đầu thẻ và hàng hành động.
          <View>
            <MemberCardHeader card={card} wsId={wsId} onClose={onClose} />
            <MemberQuickActions card={card} onClose={onClose} onMention={onMention} />
            <MemberCardActions
              card={card}
              wsId={wsId}
              onChangeRole={() => setRoleSheetOpen(true)}
              onClose={onClose}
              onEditDisplayName={() => setDisplayNameSheetOpen(true)}
              onModerate={setModerationAction}
            />
          </View>
        )}
      </BottomSheet>

      {card ? (
        <MemberRoleSheet
          card={card}
          visible={roleSheetOpen}
          wsId={wsId}
          onClose={() => setRoleSheetOpen(false)}
        />
      ) : null}

      {card ? (
        <EditDisplayNameSheet
          currentName={card.displayName}
          loading={patchMember.isPending}
          visible={displayNameSheetOpen}
          onClose={() => setDisplayNameSheetOpen(false)}
          onSave={(displayName) =>
            patchMember.mutate(
              { userId: card.userId, payload: { displayName } },
              {
                onSuccess: () => {
                  hapticSuccess();
                  showToast('success', 'Đã đổi tên hiển thị.');
                  setDisplayNameSheetOpen(false);
                },
                onError: (mutationError) => showToast('error', toErrorMessage(mutationError)),
              },
            )
          }
        />
      ) : null}

      <MemberModerationSheet
        action={moderationAction}
        loading={removeMember.isPending || banMember.isPending || unbanMember.isPending}
        memberName={name}
        onClose={() => setModerationAction(null)}
        onConfirm={handleModerate}
      />
    </>
  );
}
