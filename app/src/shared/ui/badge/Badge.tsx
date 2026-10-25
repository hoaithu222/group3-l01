import { Text, View } from 'react-native';

import { badge, type BadgeAppearance, type BadgeSize, type BadgeVariant } from './badge.styles';

/** Quá số này thì hiện `99+` thay vì con số thật. */
const DEFAULT_MAX_COUNT = 99;

export interface BadgeProps {
  /**
   * Nhãn đọc cho trình đọc màn hình.
   *
   * ⛔ BẮT BUỘC với dạng chấm và nên có với dạng số: `dot` không có chữ nào, còn
   * "3" đọc trống trơn thì người dùng khiếm thị nghe "ba" mà không biết ba cái
   * gì. Bỏ trống ở dạng chấm thì huy hiệu bị ẩn hẳn khỏi trình đọc — thà im
   * lặng còn hơn đọc ra một ô rỗng vô nghĩa.
   */
  accessibilityLabel?: string;
  /**
   * `soft` (mặc định) — nền nhạt + viền, bảng `Badge` của Figma.
   * `solid` — nền đặc: `promotion` (warning) và `Hot / mới` (error). Màu chữ do
   *   từng tông quyết định (`action-*-fg`), KHÔNG phải trắng cứng — xem
   *   `badge.styles.ts`.
   * `text` — chỉ chữ, không nền không viền (cột "NEUTRAL/ONLY TEXT").
   */
  appearance?: BadgeAppearance;
  className?: string;
  /** Số hiển thị. Vượt `maxCount` thì thành `99+`. Luôn vẽ ở dáng nền đặc. */
  count?: number;
  /** Chấm tròn không chữ. Ưu tiên cao nhất — có `dot` thì `count`/`label` bị bỏ qua. */
  dot?: boolean;
  label?: string;
  maxCount?: number;
  size?: BadgeSize;
  /**
   * Tông màu. Bỏ trống thì mặc định phụ thuộc DÁNG: viên thuốc → `neutral`,
   * còn chấm/số → `error` (xem chú thích ở `resolvedVariant`).
   */
  variant?: BadgeVariant;
}

/**
 * Huy hiệu — mẩu trạng thái nhỏ đứng cạnh (hoặc gắn lên góc) một nội dung khác.
 *
 * ```tsx
 * <Badge label="Đã duyệt" variant="success" />
 * <Badge appearance="solid" label="HOT" variant="error" size="sm" />
 * <Badge accessibilityLabel="5 thông báo chưa đọc" count={5} />
 * <Badge accessibilityLabel="Có nội dung mới" dot />
 * ```
 *
 * ⚠️ Badge KHÔNG bấm được — cố ý. Trong bản thiết kế nó luôn là nhãn mô tả trạng
 * thái, và một hình cao 20–24dp thì thấp hơn nhiều ngưỡng chạm 44dp. Cần bấm
 * được thì bọc bằng `Pressable` ở nơi gọi, để vùng chạm là cả hàng chứ không
 * phải riêng mẩu huy hiệu.
 *
 * ⚠️ Muốn gắn lên góc biểu tượng (chuông thông báo, tab) thì dùng `BadgeAnchor`,
 * đừng tự đặt `absolute` ở nơi gọi — vòng viền cắt nền phải khớp mới tách được
 * con số khỏi hình bên dưới.
 */
export function Badge({
  accessibilityLabel,
  appearance = 'soft',
  className,
  count,
  dot = false,
  label,
  maxCount = DEFAULT_MAX_COUNT,
  size = 'md',
  variant,
}: BadgeProps) {
  const hasCount = !dot && count !== undefined;
  const shape = dot ? 'dot' : hasCount ? 'count' : 'pill';

  /**
   * Mặc định của tông phụ thuộc DÁNG, không phải một hằng số chung.
   *
   * Figma `Orther badge`, `Type=notification` (259:96874) vẽ huy hiệu số trên
   * nền `Background/Error/Default` #C30000 — ĐỎ, và bản vẽ không có biến thể
   * notification màu đen nào. Lý do nằm ở ngữ nghĩa: chấm/số là dấu hiệu "có
   * việc cần chú ý" đặt đè lên một biểu tượng khác; để nó trung tính (`ink-5`
   * đen) thì nó chìm vào chính cái biểu tượng bên dưới và mất tác dụng.
   *
   * ⚠️ Viên thuốc thì giữ `neutral` như cũ — đó là nhãn mô tả trạng thái, tô đỏ
   * mặc định sẽ báo động giả.
   */
  const resolvedVariant = variant ?? (shape === 'pill' ? 'neutral' : 'error');

  /**
   * Dạng chấm và dạng số LUÔN là nền đặc.
   *
   * Thiết kế không vẽ chấm/số ở dáng nền nhạt, và có lý do: cả hai đều là dấu
   * hiệu "có cái gì đó cần chú ý" đặt trên một nội dung khác — nền nhạt cùng
   * tông với nền trang thì nhìn không ra.
   */
  const resolvedAppearance = shape === 'pill' ? appearance : 'solid';
  const styles = badge({
    appearance: resolvedAppearance,
    shape,
    size,
    variant: resolvedVariant,
  });

  const text = hasCount ? (count > maxCount ? `${maxCount}+` : String(count)) : label;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
      /**
       * Chấm không chữ mà cũng không nhãn ⇒ thuần trang trí, phải ẩn khỏi trình
       * đọc màn hình. Thiếu bước này, TalkBack đọc một ô rỗng chen giữa nội dung
       * và người dùng không hiểu vừa nghe thấy cái gì.
       */
      accessible={Boolean(accessibilityLabel) || text !== undefined}
      className={styles.root({ className })}
      importantForAccessibility={
        accessibilityLabel === undefined && text === undefined ? 'no-hide-descendants' : 'auto'
      }
    >
      {text === undefined ? null : (
        // ⛔ `numberOfLines={1}`: huy hiệu là một dòng. Thiếu nó, một nhãn dài
        // kéo cao cả hàng và mọi thứ đứng cạnh nó lệch nhau.
        //
        // ⛔ `maxFontSizeMultiplier`: chiều cao huy hiệu là số CỨNG (16 · 20 ·
        // 24 · 28dp) còn hệ số phóng cỡ chữ của Android lên tới 2× — ở mức "Cỡ
        // chữ: Lớn nhất", nhãn 12px thành 24px trong hộp cao 24dp, chữ tràn ra
        // ngoài viền bo rồi bị cắt; huy hiệu số (16dp) còn tệ hơn. Trần 1.3 là
        // CÙNG con số và CÙNG lý do với `Chip.tsx` — đọc chú thích dài ở đó.
        // ⚠️ Đây là TRẦN chứ không phải hệ số: cỡ chữ mức thường không nhỏ đi.
        <Text className={styles.label()} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {text}
        </Text>
      )}
    </View>
  );
}
