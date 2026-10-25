import { Stack } from 'expo-router';

import { MessagesSplitLayout } from '@/features/conversations/screens/MessagesSplitLayout';
import { FeatureRouteGuard } from '@/shell/capabilities';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp riêng cho tab "Tin nhắn" — gộp `index`/`new`/`new-group`/`calls`/
 * `archived`/`[conversationId]/*` thành MỘT tab (app.md p1-05 §1), cùng lý do
 * `(app)/workspaces/_layout.tsx`.
 *
 * `MessagesSplitLayout` (app.md p1-05 §3 cuối bảng): từ `tablet:` (600dp) danh
 * sách hội thoại nằm cột TRÁI, `<Stack/>` này là khung PHẢI (chat · info ·
 * members · new…); điện thoại chỉ có `<Stack/>` như trước. Thông tin hội thoại
 * mở NGAY TRONG khung phải (thay route) — panel thứ ba ở `tablet-lg:` chưa dựng.
 *
 * `FeatureRouteGuard` (p0-07): cờ `communication` tắt ở admin → "Tính năng này hiện chưa được bật" thay cả hai cột, kể cả khi
 * người dùng đang ở giữa tab (không văng khỏi màn).
 */
export default function MessagesLayout() {
  return (
    <FeatureRouteGuard flag="communication">
      <MessagesSplitLayout>
        <Stack screenOptions={STACK_SCREEN_OPTIONS} />
      </MessagesSplitLayout>
    </FeatureRouteGuard>
  );
}
