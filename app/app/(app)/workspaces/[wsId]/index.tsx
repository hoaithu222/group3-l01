import { useLocalSearchParams } from 'expo-router';

import { BoardsHubCard } from '@/features/boards';
import { MentorGuestBanner } from '@/features/mentor';
import { ModerationHubCard } from '@/features/moderation';
import { ResourcesHubCard } from '@/features/resources';
import { StudyHubCard } from '@/features/study';
import { WorkspaceOverviewScreen } from '@/features/workspaces/screens/WorkspaceOverviewScreen';

/**
 * Route là nơi GHÉP các phân hệ vào hub nhóm: `workspaces` không import chéo feature
 * khác (feature-structure.md), nên "Tài liệu" (p3-01), "Việc" (p3-02), "Học" (p4-01) và "Kiểm duyệt" (p1-08) vào qua slot.
 * `guestBanners`: banner chỉ dành cho khách — "Bạn đang cố vấn cho nhóm này" (p6-03; cố vấn là khách của nhóm).
 */
export default function WorkspaceOverviewRoute() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  return (
    <WorkspaceOverviewScreen
      extraSections={
        <>
          <ResourcesHubCard wsId={wsId} />
          <BoardsHubCard wsId={wsId} />
          <StudyHubCard wsId={wsId} />
          <ModerationHubCard wsId={wsId} />
        </>
      }
      guestBanners={<MentorGuestBanner wsId={wsId} />}
    />
  );
}
