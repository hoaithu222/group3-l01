import { tv } from 'tailwind-variants';

import { twMergeConfig } from '@/shared/utils/style/cn';

/**
 * Công thức style của `Screen`.
 *
 * Tách khỏi `Screen.tsx` vì file component phải ≤ 200 dòng (xem
 * `docs/rules/code-style.md`), cùng cách chia như `chip/chip.styles.ts`.
 *
 * ── Số đo lấy từ Figma "Background Screen" (`259:94379`) ─────────────────────
 * Bản vẽ chỉ có hai lớp, và ghi chú thiết kế nói rõ "Áp dụng chung cho tất cả
 * màn hình trên app SMB" — nên `gradient` mặc định BẬT:
 *
 *   · nền phẳng  `Background/Gradient/BgScreen2` = `#F0F5F5` → token `bg-base`
 *     (trùng khít, không phải xấp xỉ);
 *   · dải chuyển màu phủ từ đỉnh: `BgHeaderScreen1` (`#A6CDCC` @ 90%) chuyển
 *     xuống đúng màu nền ở mốc **20% chiều cao màn hình** (`to-[20%]` trong bản
 *     vẽ ⇒ ~162dp trên máy mẫu 812dp).
 */
export const screen = tv(
  {
    slots: {
      root: 'flex-1 bg-bg-base',
      /**
       * `h-1/5` = 20% chiều cao màn — ĐÚNG mốc `to-[20%]` của Figma, và tự co
       * giãn theo máy. ⛔ Đừng thay bằng `h-[162px]`: 162 là số đo trên máy mẫu
       * 812dp, trên máy cao 1000dp thì dải này ngắn hẳn so với bản vẽ.
       */
      gradient: 'absolute inset-x-0 top-0 h-1/5',
      body: 'flex-1',
      content: 'flex-grow',
      /**
       * ⛔ Khe `footer` KHÔNG mang lề ngang nào — cố ý để trống.
       *
       * Trước đây `padded` cũng gán `px-md` cho slot này (khi footer còn là một
       * `<Button>` trần). Nhưng footer hợp lệ là `BottomActionBar`, và nó TỰ có
       * `px-md` ở lớp `content` + tự cộng vùng an toàn ba chiều: chồng thêm 16
       * của `Screen` là **16 + 16 = 32dp** lề — nút thụt vào gấp đôi so với bản
       * vẽ, còn nền đặc của thanh đáy hụt hai dải 16dp sát mép. Lỗi không đỏ ở
       * đâu (`tsc`/ESLint/test đều xanh), chỉ lộ khi đặt cạnh Figma.
       */
      footer: '',
    },
    variants: {
      padded: {
        // 16dp — lề trái/phải của mọi khung nội dung trong Figma (x=16 trong
        // khung 375). Chỉ áp cho VÙNG NỘI DUNG; footer tự lo lề của chính nó.
        true: { content: 'px-md' },
      },
      /**
       * Nội dung bắt đầu NGAY dưới hàng tiêu đề — `Screen` KHÔNG tự chừa khe nữa.
       *
       * ⚠️ Trước đây ở đây có `pt-xs` (8dp, đúng "y=126 sau app bar 118" của Figma), nhưng hơn 100 màn lại
       * TỰ thêm `py-xs` ở khối đầu tiên (`<View className="gap-xl py-xs">`) ⇒ 8 + 8 = 16dp cộng thêm hàng
       * `AppBar` 56 (nay 48) ⇒ chữ tiêu đề cách khối đầu ~32dp: chủ dự án chê "topbar cách xa đoạn bên
       * dưới". Khe đầu tiên nay có MỘT chủ: khối đầu của từng màn (`py-xs`); màn nào không tự thêm thì vẫn còn
       * ~12dp khe trống của chính hàng tiêu đề (chữ 24 nằm giữa hàng 48).
       */
      hasHeader: {
        true: { content: 'pt-0' },
      },
      /**
       * Trần bề rộng nội dung trên máy tính bảng — xem prop `constrained`.
       *
       * ⚠️ Ba class đi THÀNH BỘ, thiếu một là hỏng:
       *   · `tablet:w-full`  — không có nó thì `self-center` làm khối co lại ôm
       *     sát chữ (alignSelf đổi bề rộng từ "kéo giãn" sang "vừa nội dung"),
       *     và trên điện thoại thì… vẫn đúng, nên lỗi chỉ lộ ra ở tablet;
       *   · `tablet:max-w-content` — chính cái trần, 720dp (`layout.json` nhóm
       *     `container`, cùng token với `AppBar`/`BottomActionBar`/`BottomNav`/tấm trượt);
       *   · `tablet:self-center` — không có nó thì khối 720dp dính mép TRÁI.
       *
       * ── Vì sao 720 (2026-10-01, thay cho 600 cũ) ───────────────────────────
       * Trần cũ lấy đúng mốc breakpoint 600 ⇒ máy tính bảng 800dp dọc hở 100dp
       * MỖI bên (cộng lề 16 là ~116dp mới tới chữ), 1280dp nằm ngang hở 340dp —
       * đúng lời chê "padding ngoài to quá". 720 là trần của dự án tham chiếu
       * `vci-sun-mobile` (`CONTENT_MAX_WIDTH`): iPad mini dọc (744) gần như không
       * bị cắt, 800dp chỉ còn hở 40dp mỗi bên, từ iPad Air (820) trở lên mới bắt
       * đầu chừa lề — đúng lúc dòng chữ bắt đầu quá dài.
       *
       * ✅ KHÔNG nhảy nấc ở ngưỡng: từ 600 tới 720dp `max-w` chưa cắn gì (khối
       * vẫn rộng bằng màn), qua 720 thì lề mở ra LIÊN TỤC. `generate-layout`
       * chặn cứng trần hẹp hơn ngưỡng `tablet` — ca duy nhất gây giật khi kéo
       * thanh chia đôi màn hình.
       *
       * ⛔ Không có bậc nào cho `tablet-lg`: trần là để ĐỌC ĐƯỢC. Máy 840dp+ cần
       * nhiều cột chứ không cần cột rộng hơn — và nhiều cột là việc của từng màn
       * (`constrained={false}` + lưới), không phải của `Screen`.
       */
      constrained: {
        true: { content: 'tablet:w-full tablet:max-w-content tablet:self-center' },
      },
    },
    defaultVariants: { constrained: true, padded: true, hasHeader: false },
  },
  { twMergeConfig },
);
