import { WORKSPACE_COVER_PRESETS, type WorkspaceCoverPreset } from '../api/workspaces.types';

/**
 * Nền của ảnh bìa nhóm khi CHƯA có ảnh — mỗi khoá `WORKSPACE_COVER_PRESETS` (be.md,
 * `workspace.interface.ts`) một họ `surface-*` CÓ SẴN, không có màu thô mới. Ghép 1-1 để mỗi
 * khoá ra một tông riêng biệt: `violet` = màu thương hiệu (`primary-*` vốn đã là tím), `amber` =
 * tông "accent" vàng đồng của `cover-tone.ts` (bộ học), `ocean` = `info` (xanh dương), `forest` =
 * `success` (xanh lá), `sunset` = `warning` (cam), `rose` = `error` (đỏ — đây là MỘT MẪU MÀU nhóm
 * tự chọn, không phải trạng thái lỗi/phá huỷ), `slate` = `neutral` (xám).
 */
export const WORKSPACE_COVER_SURFACE: Record<WorkspaceCoverPreset, string> = {
  violet: 'bg-surface-primary',
  amber: 'bg-surface-secondary',
  ocean: 'bg-surface-info',
  forest: 'bg-surface-success',
  sunset: 'bg-surface-warning',
  rose: 'bg-surface-error',
  slate: 'bg-surface-neutral',
};

/**
 * `coverPreset` BE trả `null` khi nhóm CHƯA CHỌN (chưa từng đặt bìa) — suy TẤT ĐỊNH theo id nhóm
 * để cùng một nhóm luôn ra cùng một màu, không đổi giữa các lần mở, và không cần lưu thêm trường
 * nào phía server (đúng lời BE: "client tự chọn nền theo id nhóm", `update-workspace.dto.ts`).
 *
 * Băm bằng phép nhân-cộng modulo số nguyên tố nhỏ — cùng thuật toán với `coverToneFor` của bộ học
 * (`features/study/components/visual/cover-tone.ts`), đổi sang id NHÓM (ổn định, không đổi khi
 * nhóm được đặt lại tên) thay vì tiêu đề.
 */
export function coverPresetFor(workspaceId: string): WorkspaceCoverPreset {
  const hash = [...workspaceId].reduce(
    (acc, char) => (acc * 31 + (char.codePointAt(0) ?? 0)) % 65_521,
    7,
  );
  return WORKSPACE_COVER_PRESETS[hash % WORKSPACE_COVER_PRESETS.length] ?? 'slate';
}

/**
 * Tỉ lệ khung ảnh bìa trên THẺ của danh sách nhóm (`WorkspaceCard`) — 3:1, tức ≈ 109–127dp trên điện thoại 360–412dp.
 *
 * ── Vì sao không còn là dải `h-12` (48dp) ──────────────────────────────────────────────────────────────────────────────
 * Dải 48dp trên thẻ rộng ~328–380dp là khung ~7:1, trong khi ảnh bìa được xem trước ở Cài đặt nhóm theo `banner-slim`
 * (~2.1:1): `contentFit="cover"` chỉ còn giữ ~29% chiều cao khung người dùng đã thấy lúc chọn — một lát mỏng giữa ảnh,
 * trông như ảnh "vỡ". 3:1 giữ ~70% khung đó mà thẻ vẫn gọn cho danh sách tới 50 nhóm (`banner-slim` y hệt ô xem trước thì
 * mỗi thẻ cao ~230dp, một màn chỉ còn hơn hai thẻ).
 *
 * ⚠️ Là SỐ đặt qua `style.aspectRatio` của `WorkspaceCover`, ⛔ không phải `h-*` cố định: khung cắt ảnh giống nhau trên mọi
 * bề rộng máy. ⛔ Đừng ghép thêm `h-*`/`max-h-*` lên cùng khối: có cả chiều cao lẫn tỉ lệ thì Yoga suy BỀ RỘNG = chiều cao ×
 * tỉ lệ (tỉ lệ thắng `stretch`) — dải bìa co lại, không còn phủ hết bề ngang thẻ, và không lỗi nào báo.
 * Khung xương `WorkspaceListSkeleton` dùng CHÍNH hằng số này để danh sách không nhảy lúc dữ liệu về.
 */
export const WORKSPACE_CARD_COVER_RATIO = 3;

/**
 * Dạng URL ảnh hiển thị ký sẵn của BE: `…/api/v1/assets/<assetId>/image?v=<ORIGINAL|THUMB>&e=<hạn>&s=<chữ ký>`
 * (`be/src/shared/media/display-image.ts`). Bắt `assetId` và biến thể `v` ở bất kỳ vị trí nào của chuỗi truy vấn.
 */
const DISPLAY_IMAGE_URL = /\/assets\/([^/?#]+)\/image\?(?:[^#]*&)?v=([A-Z]+)/;

/**
 * Khoá cache ỔN ĐỊNH `<assetId>:<biến thể>` cho ảnh bìa nhóm — đi vào `source.cacheKey` của `expo-image`.
 *
 * ⚠️ Vì sao cần: phần `e`/`s` của URL ký đổi theo "ô" thời gian (`displayImageUrlBucketSeconds` = 1 ngày), mà cache mặc định
 * của `expo-image` khoá theo URL ⇒ mỗi ngày là một ảnh MỚI, danh sách nhóm tải lại mọi ảnh bìa BẢN GỐC (hàng trăm KB mỗi ảnh).
 * Nội dung một asset thì bất biến (đổi bìa ⇒ asset mới ⇒ id mới ⇒ khoá mới) nên khoá theo id + biến thể là đúng — cùng cách
 * `ImageGrid` của chat khoá ảnh đính kèm.
 * Không nhận ra dạng URL (ảnh cục bộ vừa chọn `file://…`, hoặc BE đổi dạng URL) ⇒ `undefined` ⇒ `expo-image` khoá theo URL
 * như cũ: chỉ mất phần tối ưu, không vỡ ảnh.
 * ⚠️ Avatar người dùng/nhóm chat cũng đi qua CÙNG dạng URL này — feature thứ hai cần thì chuyển hàm lên `@/shared/media`,
 * ⛔ đừng chép regex sang chỗ khác (BE đổi dạng URL là phải sửa hai nơi).
 */
export function displayImageCacheKey(url: string): string | undefined {
  const match = DISPLAY_IMAGE_URL.exec(url);
  const assetId = match?.[1];
  const variant = match?.[2];
  return assetId && variant ? `${assetId}:${variant}` : undefined;
}
