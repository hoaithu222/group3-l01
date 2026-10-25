import { useState } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import { MEDIA_ASPECT_RATIO, type MediaCardAspect } from './media-card.styles';

/**
 * ⛔ BẮT BUỘC, không phải bước thừa.
 *
 * NativeWind chỉ dạy `className` cho danh sách component của React Native.
 * `Image` của `expo-image` KHÔNG nằm trong danh sách: viết
 * `<Image className="absolute inset-0" />` thì prop bị bỏ qua ÂM THẦM — không
 * lỗi, không cảnh báo, ảnh chỉ đơn giản là cao 0 và bạn thấy ô trống.
 */
const ThumbnailImage = cssInterop(Image, { className: 'style' });

/**
 * Cỡ glyph giữ chỗ — CỐ ĐỊNH 40dp, không co theo ô.
 *
 * Đo trên Figma: `193:25405` (trong ô 300×300) = 40.00 và `I259:123593;5858:38813`
 * (trong ô 343×163) = 38.83. Hai ô lệch nhau gấp đôi về diện tích mà glyph gần
 * như không đổi ⇒ bản vẽ dùng một cỡ cố định, không phải tỉ lệ phần trăm.
 *
 * ⚠️ Ô nhỏ hơn 40dp thì glyph bị `overflow-hidden` của khung cắt bớt. Chấp nhận:
 * bản vẽ không có ô ảnh nào nhỏ như vậy, và ô 32dp thì thứ cần là `Avatar`
 * (vuông/tròn, có chữ viết tắt) chứ không phải khung ảnh này.
 */
const PLACEHOLDER_ICON_SIZE = 40;

export interface ThumbnailProps {
  /**
   * Ảnh MANG NGHĨA thì truyền câu mô tả vào đây; bỏ trống = ảnh TRANG TRÍ và cả
   * ô bị ẩn khỏi trình đọc màn hình.
   *
   * ⚠️ Mặc định "trang trí" là chủ ý: banner đầu màn và ảnh bìa sản phẩm gần như
   * luôn lặp lại thông tin đã có bằng chữ ngay bên cạnh. Không ẩn thì mỗi ô đẻ
   * thêm một chặng vuốt xướng "hình ảnh" mà không nói được gì.
   */
  alt?: string;
  /**
   * Tỉ lệ khung — tên khoá trong `MEDIA_ASPECT_RATIO`, hoặc một SỐ cho ca một
   * lần. ⛔ Đừng gõ `343 / 163` tại nơi gọi: khoá `banner-slim` có sẵn.
   *
   * Mặc định `banner-slim` (343×163) vì đó là số đo của tám trên chín ô
   * `Image view / Placeholder` trong bản vẽ (`259:123593`, `222:13426`,
   * `1053:27971`, `193:25379/25424/25430/25436/25456/25751`); ô vuông 300×300
   * `193:25403` là ca còn lại và khai `aspect="square"`.
   */
  aspect?: MediaCardAspect | number;
  /**
   * Chính sách cache đĩa của `expo-image`. Mặc định của thư viện (giữ trên đĩa).
   *
   * ⚠️ Ảnh đi qua URL KÝ CÓ HẠN (`useAssetUrl` — tệp/ảnh trong chat, kho tài liệu) phải truyền `"none"`: mỗi lần lấy URL là
   * một chuỗi khác nên cache đĩa vừa vô ích, vừa để lại ảnh riêng tư trên máy người dùng (app.md p0-05 §4). Không truyền =
   * ảnh CDN công khai, ổn định.
   */
  cachePolicy?: ImageProps['cachePolicy'];
  className?: string;
  /**
   * Nguồn ảnh của `expo-image`: URL, `require(...)`, hoặc `{ uri, blurhash }`.
   * Thiếu ⇒ chỉ hiện ô giữ chỗ (đúng trạng thái mà bản vẽ vẽ ra).
   */
  source?: ImageProps['source'];
}

/**
 * Ô ảnh trần có nền giữ chỗ — `Image view / Placeholder` của Figma
 * (`259:123593` 343×163 · `193:25403` 300×300, xuất hiện **9 lần**: khe banner
 * đầu màn `[Webview] Danh sách sản phẩm` và các slide guide bố cục).
 *
 * ```tsx
 * <Thumbnail source={{ uri }} />                       // banner 343×163
 * <Thumbnail alt="Biểu đồ lãi suất" aspect="square" source={{ uri }} />
 * <Thumbnail />                                        // chỉ ô giữ chỗ
 * ```
 *
 * ── ⛔ Vì sao KHÔNG ghép được từ `MediaCard` ─────────────────────────────────
 * `MediaCard` **bắt buộc** `title` và dựng cả một `Card` bao ngoài (bo 24, nền
 * `bg-1`, khối chữ đệm 12). Banner trần không có chữ ⇒ dùng `MediaCard` là đẻ ra
 * một khối chữ rỗng và một cái thẻ không ai muốn. `Avatar` thì mang vai "danh
 * tính" (tròn, có chữ viết tắt), không phải khung ảnh.
 *
 * ── ⚠️ Cái bẫy mà component này tồn tại để gói lại — ĐỌC TRƯỚC KHI SỬA ───────
 * `expo-image` gặp URL 404, link hết hạn hoặc mất mạng thì vẽ **trong suốt và
 * im lặng**: không lỗi, không cảnh báo, không sự kiện nào nổi lên tới bố cục.
 * Lời giải thích đầy đủ (kèm lý do phải nhớ CHÍNH `source` đã hỏng thay vì một
 * cờ `boolean`) nằm ở `avatar/Avatar.tsx` — ⛔ đừng chép lại nó lần nữa ở đây
 * hay ở nơi gọi; đó đã là bản thứ ba và `media-card.styles.ts` vừa xoá bản của
 * nó đi để trỏ về một chỗ.
 *
 * Ba thứ vòng qua cái bẫy đó, và cả ba đều phải đi CÙNG NHAU:
 *  1. nền `bg-bg-2` — ô rỗng vẫn đọc ra là "một ô ảnh", không phải mảng trắng;
 *  2. `aspectRatio` đặt bằng `style` — khung chiếm đúng chỗ ngay từ khung hình
 *     đầu tiên nên ảnh tải xong KHÔNG làm bố cục nhảy. ⚠️ `style` chứ không
 *     phải class `aspect-[343/163]`: React Native nhận một SỐ ở `aspectRatio`,
 *     không nhận phân số của CSS;
 *  3. `onError` → quay về glyph giữ chỗ, để ảnh hỏng trông khác ảnh chưa có.
 */
export function Thumbnail({
  alt,
  aspect = 'banner-slim',
  cachePolicy,
  className,
  source,
}: ThumbnailProps) {
  /**
   * ⚠️ Nhớ chính `source` đã hỏng chứ không phải một cờ `boolean` — cùng lý do
   * đã ghi ở `Avatar.tsx`: một cờ sẽ kẹt ở trạng thái "hỏng" khi ô được tái sử
   * dụng cho ảnh khác (banner xoay vòng, danh sách cuộn lại).
   */
  const [failedSource, setFailedSource] = useState<ImageProps['source']>();
  const showImage = source !== undefined && source !== failedSource;

  /** Không có `alt` ⇒ ảnh trang trí. Xem chú thích của prop `alt`. */
  const decorative = alt === undefined;

  return (
    <View
      /**
       * ⚠️ Phải khai CẢ HAI cờ: `accessibilityElementsHidden` chỉ iOS nghe,
       * `importantForAccessibility` chỉ Android nghe. Bỏ một cái là hở một nền
       * (cùng cách `Divider`, `EmptyState`, `BottomNav` đang làm).
       */
      accessibilityElementsHidden={decorative}
      accessibilityLabel={alt}
      /**
       * ⚠️ Ảnh trang trí thì KHÔNG khai vai trò luôn, chứ không chỉ
       * `accessible={false}`: vài trình đọc màn hình vẫn nhặt `accessibilityRole`
       * từ cây con và xướng "hình ảnh" cho một ô không có gì để nói.
       */
      accessibilityRole={decorative ? undefined : 'image'}
      accessible={!decorative}
      className={cn('w-full overflow-hidden rounded-sm bg-bg-2', className)}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={{ aspectRatio: typeof aspect === 'number' ? aspect : MEDIA_ASPECT_RATIO[aspect] }}
    >
      {showImage ? (
        <ThumbnailImage
          /* `cover` chứ không `contain`: ảnh của đối tác không theo đúng tỉ lệ
             nào cả, `contain` để lại hai dải trống lệch hẳn khung. */
          cachePolicy={cachePolicy}
          className="absolute inset-0"
          contentFit="cover"
          source={source}
          onError={() => setFailedSource(source)}
        />
      ) : (
        <View className="absolute inset-0 items-center justify-center">
          {/**
           * `fg-3` là token dành riêng cho chữ/hình GIỮ CHỖ. Đo trên
           * `colors.json`: **2.86:1** ở chế độ sáng, và ở chế độ tối là
           * **3.77:1** trên nền lớp 2 (bảng màu tối vừa được dựng lại — xem
           * `docs/rules/styling-nativewind.md`). Nấc sáng dưới ngưỡng 3:1 của
           * hình phi văn bản, và đúng như vậy: glyph này là trang trí, ô đã bị
           * ẩn khỏi trình đọc màn hình nên nó không mang thông tin nào — thứ
           * đọc ra được "đây là ô ảnh" là cả cái KHUNG. ⛔ Đừng kéo lên `fg-2`:
           * một glyph đậm giữa ô trống trông như lỗi tải chứ không như chỗ giữ sẵn.
           *
           * ⚠️ Khối này phải ở dạng `{/**` với MỖI dòng mở đầu bằng `*`:
           * `npm run check:classes` bỏ qua chú thích theo dấu mở đầu, mà dòng
           * nối của `{/*` thì không có dấu nào — tên token trong câu văn bị đọc
           * thành một class chết và cổng kiểm báo đỏ.
           */}
          <Icon color="fg-3" name="image" size={PLACEHOLDER_ICON_SIZE} />
        </View>
      )}
    </View>
  );
}
