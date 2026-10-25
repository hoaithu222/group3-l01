import { useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { cssInterop } from 'nativewind';
import { Text, View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';

import {
  avatarStyles,
  FALLBACK_ICON_SIZE,
  INITIALS_MAX_FONT_SCALE,
  type AvatarBadgeTone,
  type AvatarShape,
  type AvatarSize,
} from './avatar.styles';
import { getInitials } from './initials';

/**
 * ⛔ BẮT BUỘC, không phải bước thừa.
 *
 * NativeWind chỉ dạy `className` cho danh sách component của React Native.
 * `Image` của `expo-image` KHÔNG nằm trong danh sách: viết
 * `<Image className="absolute inset-0" />` thì prop bị bỏ qua ÂM THẦM — không
 * lỗi, không cảnh báo, ảnh chỉ đơn giản là cao 0 và bạn thấy ô trống.
 * (Cùng lý do với `cssInterop(Animated.View)` trong `Skeleton`.)
 */
const AvatarImage = cssInterop(Image, { className: 'style' });

export interface AvatarProps {
  /**
   * Chấm trạng thái ở góc dưới phải. Bỏ trống = không vẽ.
   * Figma chỉ có chấm XANH (`success`); ba tông còn lại thêm vào cho trạng thái
   * "đang bận"/"lỗi"/"ngoại tuyến" mà bộ thiết kế chưa vẽ tới.
   */
  badge?: AvatarBadgeTone;
  className?: string;
  /**
   * Biểu tượng khi không có cả ảnh lẫn tên. Mặc định: hình người của Figma.
   *
   * ⚠️ Nền khung lúc đó là đĩa ĐẶC `primary-3` — đúng bản vẽ cho hình người,
   * nhưng Figma cho logo NGÂN HÀNG một nền khác (`#F6F6F6`) và cho icon hoá
   * đơn/nhà cung cấp một màu khác (`#338986`). Hai kiểu ruột đó cần thêm prop
   * mới nên chưa dựng — xem báo cáo audit `[N5]`.
   */
  fallbackIcon?: IconName;
  /**
   * Tên đầy đủ. Dùng hai việc: sinh chữ viết tắt khi không có ảnh, VÀ làm nhãn
   * cho trình đọc màn hình (ảnh đại diện không có nhãn thì người dùng khiếm thị
   * chỉ nghe "hình ảnh").
   *
   * ✅ Truyền CẢ `source` lẫn `name`: ảnh hỏng thì chữ viết tắt đỡ lấy.
   */
  name?: string;
  shape?: AvatarShape;
  size?: AvatarSize;
  /** Nguồn ảnh của `expo-image`: URL, `require(...)`, hoặc `{ uri, blurhash }`. */
  source?: ImageProps['source'];
}

/**
 * Ảnh đại diện. Số đo và bảng biến thể: `avatar.styles.ts`.
 *
 * Ba kiểu ruột, chọn theo prop:
 *   · có `source` (và tải được) → ảnh thật;
 *   · có `name`                → chữ viết tắt trên nền `surface-primary`;
 *   · không có gì              → `fallbackIcon` TRẮNG trên đĩa đặc `primary-3`.
 */
export function Avatar({
  badge,
  className,
  fallbackIcon = 'user-circle',
  name,
  shape = 'circle',
  size = 'md',
  source,
}: AvatarProps) {
  const initials = name ? getInitials(name) : '';

  /**
   * ⛔ Dự phòng khi ẢNH LỖI — không có nó thì ô avatar RỖNG, không lỗi nào báo.
   *
   * `expo-image` gặp URL 404, link hết hạn hoặc mất mạng thì vẽ trong suốt và
   * im lặng. Vì nhánh `source` được chọn TRƯỚC, chữ viết tắt không bao giờ có
   * cơ hội hiện ⇒ cả danh sách người nhận tiền là một cột ô trống.
   *
   * ⚠️ Nhớ chính `source` đã hỏng chứ không phải một cờ `boolean`: đổi sang ảnh
   * KHÁC (người dùng cập nhật avatar, danh sách được tái sử dụng ô) thì phải
   * thử lại ảnh mới. Cờ boolean sẽ kẹt ở trạng thái "hỏng" cho tới lúc unmount.
   */
  const [failedSource, setFailedSource] = useState<ImageProps['source']>();
  const showImage = source !== undefined && source !== failedSource;
  const showInitials = !showImage && initials !== '';
  const styles = avatarStyles({
    badgeTone: badge,
    // Chỉ hình người mặc định mới nằm trên đĩa ĐẶC; ảnh và chữ viết tắt dùng
    // nền nhạt. Xem bảng `fill` trong `avatar.styles.ts`.
    fill: showImage || showInitials ? 'light' : 'medium',
    shape,
    size,
  });

  return (
    <View
      /**
       * Cả khối là MỘT phần tử với trình đọc màn hình, không phải ba (ảnh, chữ,
       * chấm). Không gom lại thì người dùng khiếm thị phải vuốt qua ba lần cho
       * một ô avatar trong danh sách 50 người.
       */
      accessibilityLabel={name}
      /**
       * ⚠️ Không có `name` thì KHÔNG khai vai trò luôn, chứ không chỉ
       * `accessible={false}`.
       *
       * Avatar không tên là hình trang trí (ô giữ chỗ trong danh sách chưa tải
       * xong). `accessible={false}` đã đủ để TalkBack/VoiceOver bỏ qua, nhưng
       * vài trình đọc màn hình vẫn nhặt `accessibilityRole` từ cây con và xướng
       * "hình ảnh" cho một ô không có gì để nói. Bỏ hẳn vai trò thì không trình
       * nào có gì để nhặt.
       */
      accessibilityRole={name ? 'image' : undefined}
      accessible={Boolean(name)}
      className={styles.root({ className })}
    >
      <View className={styles.frame()}>
        {showImage ? (
          <AvatarImage
            /* Ảnh người dùng gần như không bao giờ vuông. `cover` cắt phần thừa
               để mặt nằm giữa; `contain` sẽ để lại hai dải trống hai bên. */
            className={styles.image()}
            contentFit="cover"
            source={source}
            onError={() => setFailedSource(source)}
          />
        ) : showInitials ? (
          /**
           * ⛔ `maxFontSizeMultiplier` đi CÙNG với đường kính cứng `h-6 w-6`…:
           * Android phóng cỡ chữ tới 2×, và ở mức đó chữ viết tắt của avatar
           * `xs` cao hơn cả vòng tròn chứa nó — chữ bị `overflow-hidden` của
           * `frame` cắt ngang. Trần theo từng cỡ: `INITIALS_MAX_FONT_SCALE`.
           *
           * `numberOfLines={1}`: `getInitials` trả tối đa 2 ký tự, nhưng ô hẹp
           * cộng cỡ chữ phóng to vẫn có thể đẩy ký tự thứ hai xuống dòng — và
           * dòng thứ hai thì nằm ngoài đĩa.
           */
          <Text
            className={styles.initials()}
            maxFontSizeMultiplier={INITIALS_MAX_FONT_SCALE[size]}
            numberOfLines={1}
          >
            {initials}
          </Text>
        ) : (
          /**
           * Hình người TRẮNG trên đĩa đặc `primary-3` — đúng bản vẽ
           * (`259:94667`, `Avatar=On, Default=Yes`).
           *
           * ⚠️ `fg-inverse` chứ không phải một mã trắng cứng: ở chế độ tối nó
           * tự thành mực (#08120F) trên cùng đĩa #B8D0CE (thang màu không đảo
           * theo chế độ) ⇒ 11.73:1. Trắng ở chế độ sáng là 1.62:1 — đó là CẶP
           * MÀU của chính bản vẽ cho một hình giữ chỗ trang trí; cái làm ô
           * avatar đọc ra được là ĐĨA ĐẶC, không phải nét hình người.
           */
          <Icon color="fg-inverse" name={fallbackIcon} size={FALLBACK_ICON_SIZE[size]} />
        )}
      </View>

      {badge ? <View className={styles.badge()} /> : null}
    </View>
  );
}
