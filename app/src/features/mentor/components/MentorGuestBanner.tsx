import { useState } from 'react';

import { Alert } from '@/shared/ui/alert';
import { formatDate } from '@/shared/utils/format/date.utils';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { useMyEngagements } from '../queries/mentor.queries';
import { dismissBanner, isBannerDismissed } from '../utils/banner-seen';

export interface MentorGuestBannerProps {
  wsId: string;
}

/**
 * Banner cho CỐ VẤN khi mở nhóm mình đang cố vấn (p6-03 app.md §7): "Bạn là cố vấn tới 30/10/2026 — chỉ thấy các kênh được mời". Cố vấn là KHÁCH
 * (GUEST) của nhóm, nên hub nhóm chỉ ghép banner này cho khách (`WorkspaceOverviewScreen.guestBanners`) — người khác không tốn một request nào.
 *
 * "Một lần": có nút ✕, đóng rồi thì không hiện lại cho đợt cố vấn này (theo người dùng + đợt, trong phiên app — xem `utils/banner-seen.ts`).
 * Khách KHÔNG phải cố vấn (được mời thường) không có đợt nào khớp nhóm này ⇒ không vẽ gì, `GuestAccessBanner` đã lo phần khách. Cờ `mentor` tắt ⇒ không gọi API.
 */
export function MentorGuestBanner({ wsId }: MentorGuestBannerProps) {
  const enabled = useFeature('mentor') === true;
  const userId = useAuthStore((state) => state.user?.id) ?? '';
  const engagements = useMyEngagements(enabled);
  // `dismissed` chỉ để vẽ lại ngay khi bấm ✕; nguồn thật là sổ theo (người dùng, đợt) sống qua các lần dựng lại màn.
  const [dismissed, setDismissed] = useState(false);

  const engagement = engagements.data?.find(
    (item) => item.workspace.id === wsId && item.status === 'ACTIVE',
  );
  if (!enabled || !engagement || dismissed || isBannerDismissed(userId, engagement.id)) return null;

  return (
    <Alert
      description={`Bạn là cố vấn tới ${formatDate(engagement.endsAt)} — chỉ thấy các kênh được mời.`}
      title="Bạn đang cố vấn cho nhóm này"
      tone="info"
      onClose={() => {
        dismissBanner(userId, engagement.id);
        setDismissed(true);
      }}
    />
  );
}
