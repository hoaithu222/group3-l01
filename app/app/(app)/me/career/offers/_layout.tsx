import { Stack } from 'expo-router';

import { OffersSplitLayout } from '@/features/career';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp RIÊNG cho "Lời mời" (p6-08) — gộp `index` (hộp thư), `[offerId]` (chi tiết) và `[offerId]/thread` (trao đổi) thành MỘT nhánh của ngăn xếp `me/career`.
 * Mỗi màn tự dựng `AppBar`. Thiếu file này thì `[offerId]/thread` bị coi là route ngang hàng của `me/career/_layout.tsx`.
 *
 * `OffersSplitLayout` (app.md p6-08 §7): từ `tablet:` (600dp) hộp thư nằm cột TRÁI, `<Stack/>` này là khung PHẢI (chi tiết · trao đổi); điện thoại chỉ có `<Stack/>`.
 */
export default function OffersLayout() {
  return (
    <OffersSplitLayout>
      <Stack screenOptions={STACK_SCREEN_OPTIONS} />
    </OffersSplitLayout>
  );
}
