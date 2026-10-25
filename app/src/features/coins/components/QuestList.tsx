import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticSuccess, hapticTap } from '@/shared/utils/haptics';

import { useClaimQuest, useQuests } from '../queries/quests.queries';
import { QuestCard } from './QuestCard';

/**
 * Mục "Nhiệm vụ hôm nay" của màn Ví. Bốn trạng thái: đang tải (khung xương đúng hình thẻ), lỗi (mạng ⇒ `offline`, còn lại `error`, kèm "Thử lại"),
 * rỗng (không có nhiệm vụ nào đang bật — nói bằng chữ, không để mục trống trơn) và danh sách. Chỉ khoá nút của ĐÚNG thẻ đang nhận.
 */
export function QuestList() {
  const quests = useQuests();
  // Nhiệm vụ tiến lên mà KHÔNG đổi số dư thì không có sự kiện nào (`gamification:updated` chỉ khi đổi xu) — quay lại màn Ví thì tải lại.
  useRefetchOnFocus(quests);
  const claim = useClaimQuest();
  const offline = useConnectionState() === 'offline';
  const claimingId = claim.isPending ? claim.variables?.quest.id : undefined;

  let body: ReactNode;
  if (quests.isLoading) {
    body = (
      <View className="gap-sm">
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
      </View>
    );
  } else if (quests.isError && !quests.data) {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void quests.refetch() }}
        fullscreen={false}
        state={isNetworkError(quests.error) ? 'offline' : 'error'}
        title="Không tải được nhiệm vụ"
      />
    );
  } else if (!quests.data || quests.data.length === 0) {
    body = (
      <ScreenState
        description="Nhiệm vụ mới sẽ xuất hiện khi được bật. Bạn vẫn nhận xu khi hoàn thành công việc và ôn tập."
        fullscreen={false}
        icon="calendar"
        state="empty"
        title="Hôm nay chưa có nhiệm vụ"
      />
    );
  } else {
    body = (
      <View className="gap-sm">
        {quests.data.map((entry) => (
          <QuestCard
            key={entry.quest.id}
            claiming={claimingId === entry.quest.id}
            offline={offline}
            quest={entry}
            // Rung "chạm" khi bấm Nhận, rung "xong" khi xu đã về ví — nhận thưởng là khoảnh khắc đáng có phản hồi.
            onClaim={(quest) => {
              hapticTap();
              claim.mutate(quest, { onSuccess: hapticSuccess });
            }}
          />
        ))}
      </View>
    );
  }

  return (
    <Section icon="calendar-favorite" title="Nhiệm vụ hôm nay">
      {body}
    </Section>
  );
}
