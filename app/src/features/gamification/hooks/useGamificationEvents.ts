import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { SocketEvent, useSocketEvent } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';

import { gamificationService } from '../api/gamification.service';
import type {
  GamificationSocketPayload,
  MyGamificationDto,
  NewBadgeSummary,
} from '../api/gamification.types';
import { gamificationKeys } from '../queries/gamification.keys';
import { useMarkLevelSeen, useMyGamification } from '../queries/gamification.queries';
import { notifyBadgesUnlocked } from '../utils/badge-toast';
import {
  isCoinsOnlyEvent,
  isDeferredRoute,
  levelUpItemOf,
  patchProfile,
  reconcileQueue,
  type LevelUpItem,
} from '../utils/gamification-events';

/**
 * Bộ não của `GamificationEventHost` (app.md p4-03 §4). Nghe `gamification:updated` (`user:{id}` — MỌI thiết bị):
 *  · vá `xp/level/streak` vào cache `me` rồi TẢI LẠI (sự kiện không mang ngưỡng cấp) và đối chiếu hàng đợi (GM-03);
 *  · `levelUp` ⇒ xếp `LevelUpModal` (mỗi cấp đúng MỘT lần dù nhận sự kiện trùng — `announcedLevels`);
 *  · huy hiệu mới không kèm lên cấp ⇒ toast; luôn làm mới danh mục huy hiệu + lịch sử XP;
 *  · `me.levelUpPending` (lỡ sự kiện lúc offline/mở app) cũng xếp vào cùng hàng đợi;
 *  · làm mới `me` khi socket nối lại và khi app về `active`.
 * Route hoãn (thi thử, cuộc gọi…): giữ hàng đợi, KHÔNG hiện cho tới khi rời route (`isDeferredRoute`).
 */
export function useGamificationEvents() {
  const enabled = useFeature('gamification') === true;
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const me = useMyGamification();
  const markSeen = useMarkLevelSeen();
  const [queue, setQueue] = useState<LevelUpItem[]>([]);
  // Ghi nhớ trong PHIÊN các cấp/huy hiệu đã xếp hàng: `seen` chưa xong (hoặc lỗi) thì `me.levelUpPending` vẫn còn,
  // không có sổ này là modal bật lại ngay khi `me` tải lại.
  const announcedLevels = useRef(new Set<number>());
  const announcedBadges = useRef(new Set<string>());
  // Toast huy hiệu chờ tới khi rời route hoãn — ref chứ không phải state: chỉ để xả, không cần vẽ lại.
  const toastQueue = useRef<NewBadgeSummary[]>([]);
  const deferred = isDeferredRoute(pathname);

  const flushToasts = useCallback(() => {
    if (toastQueue.current.length === 0) return;
    notifyBadgesUnlocked(toastQueue.current);
    toastQueue.current = [];
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const fresh = await queryClient.fetchQuery<MyGamificationDto>({
        queryFn: () => gamificationService.me(),
        queryKey: gamificationKeys.me(),
        staleTime: 0,
      });
      setQueue((current) => reconcileQueue(current, fresh));
    } catch {
      // Offline/lỗi mạng: bỏ qua — nối lại hoặc app về `active` sẽ thử lại, hàng đợi giữ nguyên.
    }
  }, [enabled, queryClient]);

  useSocketEvent<GamificationSocketPayload>(SocketEvent.GAMIFICATION_UPDATED, (event) => {
    if (!enabled) return;
    // Sự kiện đổi số dư coin (p7-02) không mang xp/level/streak: vá vào hồ sơ sẽ ghi đè thành `undefined`.
    if (isCoinsOnlyEvent(event)) return;
    queryClient.setQueryData<MyGamificationDto>(gamificationKeys.me(), (old) =>
      old ? patchProfile(old, event) : old,
    );
    const newBadges = (event.newBadges ?? []).filter(
      (badge) => !announcedBadges.current.has(badge.id),
    );
    newBadges.forEach((badge) => announcedBadges.current.add(badge.id));

    const item = levelUpItemOf({ ...event, newBadges });
    if (item && !announcedLevels.current.has(item.to)) {
      announcedLevels.current.add(item.to);
      setQueue((current) => [...current, item]);
    } else if (newBadges.length > 0) {
      toastQueue.current.push(...newBadges);
      if (!deferred) flushToasts();
    }
    // Tiến độ huy hiệu (x/y) và lịch sử XP + dải 7 ngày ở Trang chủ (`xpEventsWeek` cùng tiền tố `xpEvents()`) đổi theo MỌI lượt
    // cộng XP, không chỉ khi mở khoá — sự kiện chỉ vá `me`. `'none'` = chỉ ĐÁNH DẤU CŨ (ôn 50 thẻ là 50 sự kiện: tải lại cả
    // chuỗi trang mỗi lần là mưa request); màn đó tự tải lại khi được focus (`useRefetchOnFocus`) hoặc khi mở.
    void queryClient.invalidateQueries({
      queryKey: gamificationKeys.badges(),
      refetchType: newBadges.length > 0 ? 'active' : 'none',
    });
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.xpEvents(), refetchType: 'none' });
    void refresh();
  });

  useSocketEvent('connect', () => {
    void refresh();
    // Có thể đã lỡ sự kiện lúc mất kết nối.
    void queryClient.invalidateQueries({ queryKey: gamificationKeys.xpEvents(), refetchType: 'none' });
  });
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const pendingFrom = me.data?.levelUpPending?.from;
  const pendingTo = me.data?.levelUpPending?.to;
  useEffect(() => {
    if (!enabled || pendingFrom === undefined || pendingTo === undefined) return;
    if (announcedLevels.current.has(pendingTo)) return;
    announcedLevels.current.add(pendingTo);
    setQueue((current) => [...current, { badges: [], from: pendingFrom, to: pendingTo }]);
  }, [enabled, pendingFrom, pendingTo]);

  useEffect(() => {
    if (!deferred) flushToasts();
  }, [deferred, flushToasts]);

  const head = queue[0];
  const current = enabled && !deferred && head ? head : null;

  const dismiss = useCallback(() => {
    if (!head) return;
    setQueue((items) => items.slice(1));
    markSeen.mutate(head.to);
  }, [head, markSeen]);

  return { current, dismiss, xpToNext: me.data?.xpToNext };
}
