import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useListRefreshControl } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';

import type { MentorEngagement } from '../../api/mentor.types';
import { useNow } from '../../hooks/useNow';
import { useEndEngagement } from '../../queries/mentor.mutations';
import { mentorKeys } from '../../queries/mentor.keys';
import { useMyEngagements } from '../../queries/mentor.queries';
import { conversationHref, workspaceHref } from '../../utils/mentor-routes';
import { ConfirmEndDialog } from '../ConfirmEndDialog';
import { EngagementRow } from '../EngagementRow';

/**
 * Tab "Đang cố vấn" (app.md §3): nhóm tôi đang cố vấn, hạn còn lại, mở nhóm/nhóm chat, tự kết thúc (có xác nhận).
 * `permission:revoked` (bị gỡ/hết hạn ở nơi khác) → tải lại để gỡ đợt đó khỏi danh sách. Tab ẩn khi rỗng (màn cha lo).
 */
export function MyEngagementsTab() {
  const qc = useQueryClient();
  const query = useMyEngagements();
  const now = useNow();
  // Kéo-để-làm-mới cùng nhịp với hai tab kia (hạn còn lại/đợt bị kết thúc ở nơi khác) — vòng quay theo token (`useListRefreshControl`).
  const refreshControl = useListRefreshControl({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });
  const [ending, setEnding] = useState<MentorEngagement | null>(null);
  const end = useEndEngagement(ending?.workspace.id ?? '');
  useSocketEvent(
    SocketEvent.PERMISSION_REVOKED,
    () => void qc.invalidateQueries({ queryKey: mentorKeys.myEngagements() }),
  );

  const confirmEnd = () => {
    if (!ending) return;
    end.mutate(
      { engagementId: ending.id },
      {
        onSuccess: () => {
          showToast('success', 'Đã kết thúc cố vấn');
          setEnding(null);
        },
      },
    );
  };

  return (
    <ScrollView
      contentContainerClassName="px-md pb-lg"
      refreshControl={refreshControl}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View>
        {(query.data ?? []).map((e) => (
          <EngagementRow
            key={e.id}
            engagement={e}
            now={now}
            perspective="mentor"
            onEnd={setEnding}
            onOpenChat={(id) => router.push(conversationHref(id))}
            onOpenWorkspace={(id) => router.push(workspaceHref(id))}
          />
        ))}
      </View>
      <ConfirmEndDialog
        busy={end.isPending}
        perspective="mentor"
        visible={ending !== null}
        onCancel={() => setEnding(null)}
        onConfirm={confirmEnd}
      />
    </ScrollView>
  );
}
