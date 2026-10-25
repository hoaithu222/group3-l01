import { Stack, useLocalSearchParams } from 'expo-router';

import { useChannelScope } from '@/features/channels/hooks/useChannelScope';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';
// p5-04: đăng ký "Xác nhận đã đọc" vào các khe tin nhắn của `chat` (side-effect) — `chat`/`channels` không import `announcements`.
import '@/features/announcements/register';

/**
 * Ngăn xếp cho phạm vi MỘT kênh (chat · info · members). `useChannelScope`
 * gọi Ở ĐÂY (không lặp lại ở từng màn con) để `room:join` ("ch:{id}") ngay
 * khi vào kênh, `room:leave` khi rời, và điều hướng ra danh sách kênh NGAY
 * khi mất quyền (ack `room:join` lỗi HOẶC `channel:revoked` tới đúng kênh
 * đang mở) — bất kể đang đứng ở chat, thông tin hay thành viên.
 */
export default function ChannelScopeLayout() {
  const { chId, wsId } = useLocalSearchParams<{ chId: string; wsId: string }>();
  useChannelScope(wsId, chId);

  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
