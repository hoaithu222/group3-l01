import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolvePushHref, useInAppBannerStore } from '@/core/notifications';
import { SPACING } from '@/shared/theme';
import { IconTile } from '@/shared/ui/icon-tile';

/** Banner tự ẩn sau chừng này (p1-07 `app.md` §3: 4 giây). */
export const IN_APP_BANNER_MS = 4000;

/**
 * Banner tin nhắn KHI APP ĐANG MỞ mà tin thuộc cuộc trò chuyện khác màn đang xem (p1-07 `app.md` §3 `InAppMessageBanner`,
 * §4.4). Thay banner hệ thống ở foreground — `notifications.setup.ts` trả hành vi "ẩn" cho các loại tin nhắn và đẩy
 * banner vào `useInAppBannerStore`; máy ở NỀN vẫn dùng thông báo của hệ điều hành như cũ.
 *
 * Chạm → đóng banner và mở đúng cuộc trò chuyện/tin (cùng bảng `type → route` với chạm push). Tự ẩn sau 4 giây.
 *
 * Tôn trọng "giảm chuyển động": không trượt/không hoạt cảnh — chỉ xuất hiện/biến mất (nên không cần nhánh riêng).
 * `accessibilityLiveRegion="polite"` để trình đọc màn hình thông báo tin mới mà không cướp tiêu điểm.
 *
 * Mount MỘT lần ở `(app)/_layout`, SAU `Tabs` để vẽ đè lên trên cùng.
 */
export function InAppMessageBannerHost() {
  const banner = useInAppBannerStore((state) => state.banner);
  const dismiss = useInAppBannerStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!banner) return;
    const id = banner.id;
    const timer = setTimeout(() => dismiss(id), IN_APP_BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner, dismiss]);

  if (!banner) return null;

  const open = () => {
    dismiss(banner.id);
    router.push(resolvePushHref(banner.payload));
  };

  return (
    // ⛔ Vùng an toàn đủ BỐN chiều, không chỉ `top`: banner trải hết bề ngang và có nội dung bấm được, nên xoay ngang mà tai
    // thỏ/camera đục lỗ ăn vào mép thì chữ bị che và không chạm được. Lề 16 CỘNG với inset (không để `px-md` của class: style
    // nội tuyến ĐÈ class chứ không cộng — mất luôn lề).
    <View
      className="absolute left-0 right-0 top-0"
      pointerEvents="box-none"
      style={{
        paddingLeft: insets.left + SPACING.md,
        paddingRight: insets.right + SPACING.md,
        paddingTop: insets.top + SPACING.xs,
      }}
    >
      {/* Ô icon `chat-bubble` tông `brand` = nhận diện phân hệ Tin nhắn (cùng ô ở Trang chủ/thanh tab) — liếc là biết banner
          nói về tin nhắn trước khi đọc chữ. Trang trí: nghĩa nằm ở nhãn đọc của cả banner. */}
      <Pressable
        accessibilityHint="Mở cuộc trò chuyện"
        accessibilityLabel={banner.body ? `${banner.title}. ${banner.body}` : banner.title}
        accessibilityLiveRegion="polite"
        accessibilityRole="button"
        className="flex-row items-center gap-sm rounded-md border border-border-1 bg-bg-1 px-md py-sm active:opacity-80"
        onPress={open}
      >
        <IconTile name="chat-bubble" size="sm" tone="brand" />
        <View className="flex-1 gap-3xs">
          <Text className="text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {banner.title}
          </Text>
          {banner.body ? (
            <Text className="text-body-md text-fg-2" numberOfLines={2}>
              {banner.body}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
