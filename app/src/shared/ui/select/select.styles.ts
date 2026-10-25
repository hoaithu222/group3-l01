import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức của MỘT DÒNG lựa chọn trong `SelectSheet`.
 *
 * ⚠️ Đây là phần DUY NHẤT của nhóm `select` có class riêng. Khung ô chọn, hàng
 * nhãn và dòng thông báo đều dùng lại `inputStyles` của nhóm `input` — xem chú
 * thích đầu `Select.tsx` để biết vì sao KHÔNG chép lại chuỗi class.
 *
 * ── Số đo ────────────────────────────────────────────────────────────────────
 * `px-4` (16) + `py-md` (16): dòng một hàng cao 16 + 24 + 16 = **56dp**, đúng
 * chiều cao hàng của `Danh sách chọn` trong section Bottom sheet. Dòng hai hàng
 * (tên cửa hàng + địa chỉ, `365:30369`) tự cao thêm theo nội dung.
 *
 * ⛔ `px-4` ở đây là LỚP ĐỆM THỨ HAI, không phải lớp duy nhất. Bản vẽ xếp hai
 * tầng đệm chồng nhau và cả hai đều cần: `SelectSheet` để `padded` mặc định nên
 * vùng nội dung đã thụt 16 (dải nền tint của dòng đang chọn chạy từ x=16 tới
 * x=358 trên khung 375 — đo bằng điểm ảnh trên `700:27218`), rồi CHÍNH DÒNG
 * thụt thêm 16 nữa cho khối chữ (`703:28898`: row 343, khối chữ 311 ở x=16) ⇒
 * chữ bắt đầu ở x=32. Bỏ lớp nào cũng lệch 16dp so với bản vẽ, mà không có lỗi
 * nào báo.
 */
export const selectOptionStyles = tv(
  {
    slots: {
      /**
       * ⚠️ `items-center` ĐÈ `items-start` của `ListItem`. `ListItem` canh mép
       * trên vì nó là hàng nhãn–giá trị (giá trị xuống hai dòng thì nhãn phải
       * thẳng với dòng đầu). Ở đây cột phải là một dấu tick 24dp: canh mép trên
       * thì tick dính sát đỉnh của dòng hai hàng, lệch hẳn khỏi khối chữ.
       */
      root: 'items-center px-4 py-md',
    },
    /**
     * ⛔ KHÔNG có biến thể `selected` ở đây. Nền tint của dòng đang chọn thuộc
     * về `ListItem` (prop `selected`, xem `list/list-item.styles.ts`) — nó khai
     * cùng chỗ với `accessibilityState={{ selected }}` nên hai thứ không thể
     * lệch nhau. Dựng bản sao thứ hai ở đây là tự tạo ra ca "nền có mà trình
     * đọc màn hình không biết", đúng thứ luật trợ năng của repo cấm.
     */
  },
  { twMergeConfig }, // ⛔ BẮT BUỘC — xem docs/rules/styling-nativewind.md.
);
