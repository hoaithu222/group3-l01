import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

import type { BannerTone } from '../banner/banner-tone';
import type { IconName } from '../icon/icon-names.generated';
import { EmptyStateActions } from './EmptyStateActions';
import type { EmptyStateActionProps } from './EmptyStateActions';
import { EmptyStateIllustration } from './EmptyStateIllustration';

/**
 * Trạng thái rỗng — khối "không có gì ở đây" cho danh sách trống hoặc cả màn.
 *
 * ── Bản vẽ nào là bản CHUẨN ─────────────────────────────────────────────────
 * Figma có HAI section tên "Empty state", và chúng là hai PHIÊN BẢN của cùng
 * một component chứ không phải hai component:
 *   · `259:97281` = **Version 1.0** — khối 343×380, mô tả 3 dòng, 1 nút viền ôm chữ;
 *   · `259:96221` = **Version 2v.0** — khối 343×340, mô tả 1 dòng, 2 nút chia đôi
 *     hàng rộng 311, và có cả ca **0 nút**.
 * ✅ Code bám bản **2v.0** (bản mới). Ruột của hai bản giống hệt nhau — minh hoạ
 * 160×160, Ga16 giữa ba khối, Pa24 trên/dưới, chữ rộng 279, tiêu đề 16/24
 * semibold `#1A1A1A`, mô tả 14/20 regular `#666`, nút cao 48 `rounded-full` —
 * nên bám 2v.0 KHÔNG làm mất bản 1.0.
 *
 * Chiều cao KHÔNG khoá: 340 hay 380 là hệ quả của mô tả một hay ba dòng.
 *
 * ⚠️ Ghi chú của nhà thiết kế trong chính file Figma: "Khoảng cách giữa box Empty
 * với Header hoặc các elements khác = 16px (Ga16)" — khoảng cách BÊN NGOÀI, nên
 * nơi ĐẶT component phải tự cho `mt-md`. Nhét vào đây thì màn nào đã có `gap` sẽ
 * cộng dồn thành 32 và không ai lần ra vì sao khối bị tụt xuống.
 */
const emptyState = tv(
  {
    slots: {
      // Pa16 — Figma cho hàng nút rộng 311 trên khối 343 (343 trừ 16 mỗi bên):
      // lề này là của HÀNG NÚT chứ không phải của chữ.
      root: 'items-center px-md',
      illustration: 'items-center justify-center overflow-hidden',
      // Chữ rộng 279 theo Figma, chặn CỨNG: màn rộng mà thả tự do thì mô tả giãn
      // ra 400–500px một dòng, mắt không bắt được nhịp.
      header: 'w-full max-w-[279px] items-center',
      title: 'text-center font-semibold text-fg-1',
      description: 'text-center text-fg-2', // fg-3 chỉ 2.96:1 trên thẻ trắng ⇒ fg-2 (5.74:1).
      /**
       * Hàng nút rộng **311** (Figma khoá cứng `w-[311px]`), Ga8 giữa hai nút.
       *
       * ⚠️ `max-w` chứ không phải `w`: trên màn hẹp hơn 343 thì `px-md` của
       * `root` phải được co lại, khoá cứng bề rộng sẽ làm nút tràn mép.
       * ⛔ Thiếu `max-w` thì trên máy 430pt (iPhone Pro Max) hay tablet, hàng nút
       * giãn tới 398+ ⇒ mỗi nút rộng hơn bản vẽ 44dp trong khi khối chữ vẫn bị
       * `max-w-[279px]` giữ lại — nút rộng hơn cả đoạn chữ, nhìn mất cân.
       */
      actions: 'w-full max-w-[311px] flex-row items-center justify-center gap-xs',
    },
    variants: {
      // Figma chỉ vẽ MỘT cỡ — `full`. `compact` là quyết định của phía code cho ô
      // rỗng trong thẻ/danh sách ngắn: ở đó bản 160px đẩy nội dung thật khỏi vùng
      // nhìn thấy và người dùng tưởng màn hình lỗi.
      size: {
        full: {
          root: 'gap-md py-xl', // Ga16 giữa các khối, Pa24 trên/dưới.
          illustration: 'h-40 w-40', // 160×160 — khung minh hoạ trong Figma.
          header: 'gap-xs', // Ga8 giữa tiêu đề và mô tả.
          title: 'text-label-lg',
          description: 'text-body-md',
        },
        compact: {
          root: 'gap-sm py-md',
          illustration: 'h-[120px] w-[120px]',
          header: 'gap-2xs',
          title: 'text-label-md',
          description: 'text-caption-sm',
        },
      },
      fullscreen: { true: { root: 'flex-1 justify-center' } },
    },
    defaultVariants: { size: 'full', fullscreen: false },
  },
  { twMergeConfig },
);

interface EmptyStateBaseProps {
  /** 0, 1 hoặc 2 nút — Figma chỉ vẽ tới hai; nhiều hơn thì nhãn bị cắt ở 320dp. */
  actions?: readonly EmptyStateActionProps[];
  className?: string;
  /**
   * Canh giữa theo chiều dọc, chiếm hết chỗ trống của cha. ⚠️ Chỉ có tác dụng khi
   * cha có chiều cao xác định (`flex-1`, hoặc `contentContainerStyle` có
   * `flexGrow: 1`) — ScrollView co theo nội dung thì `flex-1` không có gì để chia.
   */
  fullscreen?: boolean;
  /**
   * Icon lớn cho hình minh hoạ MẶC ĐỊNH: vòng tròn mờ đồng tâm + đĩa tông + icon hai tông (`EmptyStateIllustration`).
   * Đường ngắn cho 95% màn rỗng/lỗi — chỉ cần chọn icon đúng nghĩa, không phải tự dựng hình.
   * ⚠️ Không truyền `icon` lẫn `illustration` thì KHÔNG vẽ gì (giữ nguyên hành vi cũ, xem `illustration`).
   */
  icon?: IconName;
  /**
   * Khe nhận hình minh hoạ TUỲ Ý. Không truyền thì KHÔNG vẽ gì — ô giữ chỗ màu mè lọt
   * lên bản phát hành trông giống lỗi tải ảnh hơn là thiết kế.
   * ⚠️ Có cả `illustration` lẫn `icon` thì `illustration` thắng (API cũ giữ nguyên nghĩa).
   */
  illustration?: ReactNode;
  size?: 'full' | 'compact';
  /**
   * Tông màu của hình từ `icon` (mặc định `brand`; cùng bảy tông với `IconTile`). Quy ước: `danger` cho LỖI, `warning`
   * cho mất quyền/cần chú ý, `neutral` cho ngoại tuyến, các tông còn lại để phân biệt phân hệ cho sinh động.
   * Không có tác dụng khi dùng `illustration`.
   */
  tone?: BannerTone;
}

/**
 * ⛔ Phải có ÍT NHẤT MỘT trong `title` / `description` — kiểu hợp (union) ép
 * `tsc` đỏ ngay chỗ gọi, không cần kiểm lúc chạy.
 *
 * Ghi chú của nhà thiết kế trong mô tả component (`259:25742` và `259:31708`):
 * "Trường hợp empty state chỉ có 1 thông điệp thì **show description text**".
 * Bắt buộc `title` như trước là ép một thông điệp duy nhất vào kiểu 16/24
 * semibold `#1A1A1A`, trong khi thiết kế muốn 14/20 regular `#666`.
 */
export type EmptyStateProps = EmptyStateBaseProps &
  ({ title: string; description?: string } | { title?: string; description: string });

export function EmptyState({
  actions,
  className,
  description,
  fullscreen = false,
  icon,
  illustration: customIllustration,
  size = 'full',
  title,
  tone = 'brand',
}: EmptyStateProps) {
  const styles = emptyState({ size, fullscreen });
  const illustration =
    customIllustration ??
    (icon ? <EmptyStateIllustration icon={icon} size={size} tone={tone} /> : null);

  return (
    // `summary` = "tóm tắt trạng thái hiện tại của màn hình" — manh mối DUY NHẤT
    // báo cho người khiếm thị biết danh sách trống chứ không phải đang tải dở.
    <View accessibilityRole="summary" className={styles.root({ className })}>
      {illustration ? (
        // ⛔ Minh hoạ thuần trang trí. Hai prop dưới đi CÙNG NHAU, thiếu một là hụt
        // một nền tảng: iOS chỉ nghe prop đầu, Android chỉ nghe prop sau.
        <View
          accessibilityElementsHidden
          className={styles.illustration()}
          importantForAccessibility="no-hide-descendants"
        >
          {illustration}
        </View>
      ) : null}
      <View className={styles.header()}>
        {title ? (
          <Text accessibilityRole="header" className={styles.title()}>
            {title}
          </Text>
        ) : null}
        {description ? (
          /**
           * Chặn 3 dòng: dài hơn thì hàng nút bị đẩy khỏi vùng nhìn thấy.
           * ⚠️ 3 là TRẦN chứ không phải số dòng của bản vẽ — v2.0 vẽ 1 dòng
           * (`Demo subtext`), v1.0 vẽ 3 dòng thật; hạ xuống 1 là cắt cụt nội
           * dung của chính bản 1.0.
           */
          <Text className={styles.description()} numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
      {actions && actions.length > 0 ? (
        <EmptyStateActions actions={actions} className={styles.actions()} />
      ) : null}
    </View>
  );
}
