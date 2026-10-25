import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
import { Reveal } from '@/shared/ui/motion';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton, SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

import type { BadgeDto } from '../api/gamification.types';
import { AchievementsSummaryCard } from '../components/AchievementsSummaryCard';
import { BadgeDetailSheet } from '../components/BadgeDetailSheet';
import { BadgeSections } from '../components/BadgeSections';
import { GamificationPrivacyCard } from '../components/GamificationPrivacyCard';
import { ShowcaseCard } from '../components/ShowcaseCard';
import { useShowcaseDraft } from '../hooks/useShowcaseDraft';
import {
  useBadgeCatalog,
  useMarkBadgesSeen,
  useMyGamification,
} from '../queries/gamification.queries';

/**
 * Thành tích của tôi (app.md p4-03 §3): cấp + XP + tiến độ lên cấp, chuỗi ngày, "Đang trưng bày" (≤ 6, sắp thứ tự được),
 * huy hiệu "Đã đạt"/"Chưa đạt" (bấm ô ⇒ `BadgeDetailSheet`), công tắc riêng tư. Offline: chỉ đọc cache, ẩn nút chỉnh.
 * Mở màn → `seen { badgeIds }` cho huy hiệu mới (một lần mỗi lần mở).
 *
 * Bố cục: điện thoại một cột; máy tính bảng (`tablet:` ≥ 600dp) hai cột — trái cấp + chuỗi + trưng bày, phải lưới huy hiệu.
 */
export function AchievementsScreen() {
  const me = useMyGamification();
  const catalog = useBadgeCatalog();
  // `gamification:updated` chỉ ĐÁNH DẤU CŨ tiến độ huy hiệu (không tải ngay) — màn giữ mounted ở tab Tôi tải lại khi quay về.
  useRefetchOnFocus(catalog);
  const markSeen = useMarkBadgesSeen();
  const offline = useConnectionState() === 'offline';
  // Lấp lánh/ánh quét của khối cấp DỪNG khi màn bị che (tab khác, app nền) — không ai nhìn thì không tốn pin.
  const focused = useIsScreenFocused();
  const [detail, setDetail] = useState<BadgeDto | null>(null);
  const editor = useShowcaseDraft(me.data?.showcase.map((badge) => badge.id) ?? []);
  const seenSent = useRef(false);

  const unseenIds = useMemo(() => me.data?.unseenBadges.map((badge) => badge.id) ?? [], [me.data]);
  useEffect(() => {
    if (seenSent.current || unseenIds.length === 0) return;
    seenSent.current = true;
    markSeen.mutate(unseenIds);
  }, [markSeen, unseenIds]);

  const badges = useMemo(() => catalog.data ?? [], [catalog.data]);
  const byId = useMemo(() => new Map(badges.map((badge) => [badge.id, badge])), [badges]);

  const refresh = () => {
    void me.refetch();
    void catalog.refetch();
  };
  const header = <AppBar title="Thành tích" onBack={router.back} />;

  if (me.isLoading || catalog.isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-xl py-xs">
          <Skeleton className="h-44 rounded-md" />
          <View className="gap-sm">
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </View>
        </View>
      </Screen>
    );
  }

  if (!me.data || catalog.isError) {
    // Mất mạng thì nói rõ là lỗi KẾT NỐI (`offline`, tông trung tính) — không phải app hỏng (`mobile-ux.md`).
    const offlineError = isNetworkError(me.error ?? catalog.error);
    return (
      <Screen header={header}>
        <ScreenState
          action={{ label: 'Thử lại', onPress: refresh }}
          description={offlineError ? undefined : 'Không tải được thành tích của bạn.'}
          state={offlineError ? 'offline' : 'error'}
          title="Không tải được thành tích"
        />
      </Screen>
    );
  }

  const profile = me.data;
  const selectedIds = new Set(editor.draft ?? profile.showcase.map((badge) => badge.id));

  return (
    <Screen constrained={false} header={header} refreshing={me.isRefetching} onRefresh={refresh}>
      <View className="gap-xl py-xs">
        <View className="gap-xl tablet:flex-row tablet:items-start">
          {/* `Reveal`: thẻ cấp + trưng bày hiện dần lệch nhịp khi mở màn (tự tắt khi "Giảm chuyển động"); danh mục huy hiệu
              bên dưới hiện ngay — nó dài, chờ thêm chỉ làm chậm việc cuộn. */}
          <View className="gap-xl tablet:w-2/5">
            <Reveal>
              <AchievementsSummaryCard active={focused} profile={profile} />
            </Reveal>
            <Reveal index={1}>
              <ShowcaseCard
                canEdit={!offline && badges.some((badge) => badge.unlockedAt)}
                catalog={byId}
                editor={editor}
                showcase={profile.showcase}
                onOpen={setDetail}
              />
            </Reveal>
          </View>
          <View className="gap-xl tablet:flex-1">
            <BadgeSections
              badges={badges}
              editing={editor.editing}
              selectedIds={selectedIds}
              onPress={editor.editing ? editor.toggle : setDetail}
            />
          </View>
        </View>
        <GamificationPrivacyCard />
      </View>
      <BadgeDetailSheet badge={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}
