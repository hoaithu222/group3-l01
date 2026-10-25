import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTAINER_MAX_WIDTH, useBreakpoint } from '@/shared/theme';

/**
 * Đệm NGANG cho một tấm trượt bị kẹp bề rộng và canh giữa màn.
 *
 * Dùng chung cho `BottomSheet` và `TooltipSheet` — hai tấm có cùng hình học
 * (`w-full … tablet:max-w-content tablet:self-center`) nên cùng một công
 * thức. ⛔ Đừng chép công thức này vào từng component: nó là loại số học mà sửa
 * một nơi quên nơi kia thì không test nào bắt được.
 *
 * ── ❌ Cách cũ đã SAI: `isTablet ? 0 : insets.left` ──────────────────────────
 * Lập luận cũ là "từ máy tính bảng thì tấm đã bị kẹp và canh giữa nên hai bên
 * dư hơn tai thỏ". Chỉ đúng ở máy tính bảng thật. Ở cửa sổ **740dp** — máy gập
 * vừa mở, hoặc chia đôi màn hình trên máy tính bảng — lề mỗi bên chỉ
 * `(740 − 720) / 2 = 10dp`, trong khi khuyết camera/tai thỏ ăn tới ~44dp. Điều
 * kiện `isTablet` khi đó trả 0 và chữ đầu hàng lại chui xuống dưới phần khuyết,
 * đúng cái lỗi mà nó định chặn.
 *
 * ── ✅ So LỀ THỰC TẾ với inset, không so bậc màn hình ────────────────────────
 * Tấm chỉ cần đẩy nội dung vào thêm đúng phần inset mà lề chưa che hết:
 *
 *     lề mỗi bên = max(0, (bề rộng cửa sổ − trần 720) / 2)
 *     đệm cần    = max(0, inset − lề)
 *
 * Ba mốc đo được: 390dp ⇒ lề 0, đệm = inset (như cũ) · 740dp ⇒ lề 10, đệm
 * = 44 − 10 = 34 (cũ trả 0 ❌) · 1000dp ⇒ lề 140, đệm 0 (như cũ ✅).
 *
 * ⚠️ Trần phải khớp với class `tablet:max-w-content` trong `bottom-sheet.styles.ts`
 * / `tooltip-sheet.styles.ts`, nên lấy từ `CONTAINER_MAX_WIDTH` (cùng nguồn
 * `layout.json` nhóm `container`) chứ ⛔ không viết `720` tại chỗ. ⛔ Cũng đừng
 * quay lại `BREAKPOINTS.tablet`: đó là NGƯỠNG (600), không phải TRẦN — dùng nhầm
 * thì lề bị tính dư tới 60dp, cửa sổ ~600–810dp thiếu đệm và chữ lại chui dưới tai thỏ. Nơi gọi
 * nào đè trần bằng `className` thì phải tự lo phần đệm ngang của mình.
 */
export function useSheetEdgeInset() {
  const insets = useSafeAreaInsets();
  /* ⛔ Hook, KHÔNG phải `Dimensions.get()`: kéo thanh chia đôi màn hình là bề
     rộng đổi hàng chục lần mỗi giây, đọc một lần rồi thôi là đệm kẹt ở số cũ. */
  const { width } = useBreakpoint();

  const sideMargin = Math.max(0, (width - CONTAINER_MAX_WIDTH.content) / 2);

  return {
    left: Math.max(0, insets.left - sideMargin),
    right: Math.max(0, insets.right - sideMargin),
  };
}
