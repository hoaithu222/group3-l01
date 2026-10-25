/** Bán kính chạm ngón tay (px màn) cho hit-test phần tử — đổi sang thế giới bằng `toWorldTolerance` (chia zoom), quên chia thì zoom xa không chạm nổi nét mảnh. */
export const TOUCH_PX = 10;

/** Bán kính bắt tay nắm chọn (px màn): to hơn hình vẽ của tay nắm (bản vẽ ~8 px) vì ngón tay không chính xác như con trỏ chuột. */
export const HANDLE_HIT_PX = 22;

/** Kéo ngắn hơn ngưỡng này (px màn) coi là CHẠM: hình/đường tạo ra ở kích thước mặc định thay vì một chấm 2 px. */
export const TINY_DRAG_PX = 8;

/** Hai lần chạm cách nhau ≤ bấy nhiêu ms và ≤ `DOUBLE_TAP_PX` là chạm đúp (sửa chữ). Tự đo thay vì `numberOfTaps(2)` để chạm ĐƠN không phải chờ. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_PX = 28;

/** Nét tự do: lấy mẫu thưa hơn `0,75 px màn` là thừa; RDP khi nhả tay dùng `1,5 px màn` (README §10: ≤ 500 điểm/nét). */
export const STROKE_STEP_PX = 0.75;
export const STROKE_SIMPLIFY_PX = 1.5;

/** Khoảng dời của "Nhân bản" (đơn vị thế giới) — đủ để thấy bản sao nằm lệch bản gốc. */
export const DUPLICATE_OFFSET = 24;

/** Xoay: tay nắm treo phía trên cạnh trên chừng này px màn. */
export const ROTATE_HANDLE_PX = 28;
