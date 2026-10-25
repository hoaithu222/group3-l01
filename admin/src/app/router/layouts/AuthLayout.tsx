import { Outlet } from 'react-router-dom';

import { AuthBackdrop, AuthBrandPanel } from '@/features/auth/components';
import { AUTH_CARD_STYLE, AUTH_SEAM_STYLE } from '@/features/auth/constants/auth-card';
import { AUTH_PANE_PADDING } from '@/features/auth/constants/auth-motifs';
import { cn } from '@/shared/utils/style/cn';

/**
 * Layout cho các màn xác thực (đăng nhập · đăng ký · quên/đặt lại mật khẩu · đăng ký nhà tuyển dụng).
 *
 * MỘT TẤM, HAI KHOANG — như hai trang của một cuốn sổ đang mở:
 *
 *   ┌──────────────────────┬──────────────────┐
 *   │  AuthBrandPanel      ┆   <Outlet />     │
 *   │  (thương hiệu · lộ   ┆   (form, tự cuộn)│
 *   │   trình · phân hệ)   ┆                  │
 *   └──────────────────────┴──────────────────┘
 *                          ↑ đường gấp đứt quãng (`AUTH_SEAM_STYLE`)
 *
 * Màn hẹp (< `lg`) hai khoang xếp DỌC, đường gấp thành nét ngang. Nền, màu, số đo: `features/auth/constants`.
 *
 * ── CUỘN: trang TỰ cuộn, không trông vào tài liệu ───────────────────────────
 * `body` bị khoá `overflow: hidden` (globals.css — khung app tự lo vùng cuộn của nó). Bản trước dựng trang
 * bằng `min-h-dvh` nên trên điện thoại, hai khoang xếp dọc cao hơn màn hình là phần dưới — gồm cả nút
 * "Đăng nhập" — bị cắt mất, không cuộn tới được. Nay tầng ngoài cùng (`h-dvh overflow-y-auto`) LÀ vùng
 * cuộn; tầng trong `min-h-full` + canh giữa: còn chỗ thì thẻ nằm giữa màn, hết chỗ thì trang cuộn.
 *
 * ⛔ CHIỀU CAO TẤM THẺ LÀ CỐ ĐỊNH từ `lg` (`lg:h-[var(--auth-card-h)]`, số đo ở `AUTH_CARD_HEIGHT`) —
 *    ĐỪNG ĐỔI VỀ `auto`. Để `auto` thì thẻ cao theo nội dung, mà nội dung form đổi liên tục ngay lúc dùng:
 *    dòng lỗi dưới ô nhập (+22px), `Callout` báo sai mật khẩu (+56px), chuyển Đăng nhập ↔ Đăng ký
 *    (±200px). Thẻ lại đang canh GIỮA màn nên mỗi lần như vậy nó nhảy lên/xuống một nửa số đó — cái
 *    "giật". Khoá chiều cao thì mọi thay đổi bị nuốt vào vùng cuộn của khoang form, khung đứng yên.
 */
export default function AuthLayout() {
  return (
    <div className="relative h-dvh overflow-y-auto bg-bg-base">
      <AuthBackdrop />

      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-10 lg:py-14">
        {/* Kẹp bề ngang 1070px: hai khoang cộng lại vừa đủ. Không kẹp thì trên màn 2560px tấm thẻ kéo dài
            thành một dải và khoang trái loãng ra không đọc được. */}
        <div
          className="flex w-full max-w-[1070px] flex-col overflow-hidden backdrop-blur-md lg:h-[var(--auth-card-h)] lg:flex-row"
          style={AUTH_CARD_STYLE}
        >
          <AuthBrandPanel />

          {/* Đường gấp giữa hai khoang — TOÀN BỘ thứ chia đôi tấm thẻ. `--auth-seam-dir` xoay hướng nét đứt
              theo hướng xếp (xem `AUTH_SEAM_STYLE`). `shrink-0`: thiếu nó thì vạch 1px bị flex bóp mất. */}
          <span
            aria-hidden
            className="h-px w-full shrink-0 [--auth-seam-dir:90deg] lg:h-auto lg:w-px lg:[--auth-seam-dir:180deg]"
            style={AUTH_SEAM_STYLE}
          />

          {/* ── KHOANG PHẢI — form ──────────────────────────────────────────────
              Rộng cố định 492px từ `lg`: ô nhập dài quá ~420px thì mắt phải đảo ngang để đọc lại thứ vừa
              gõ. Lề trong 40px hai bên vẫn chừa 412px cho ô nhập. Nền để TRƠN (nền của thẻ): chỗ gõ chữ
              là chỗ duy nhất trên màn không có hoạ tiết nào.

              Khoang này CHÍNH LÀ vùng cuộn và mang luôn lề trong, để nội dung dài thì dòng cuối vẫn còn đủ
              40px dưới thay vì dính sát mép thẻ. Với bốn trang xác thực, `overflow-y-auto` chỉ là PHAO:
              chiều cao đã tính để không tràn (`AUTH_CARD_HEIGHT`), nó chỉ cứu khung nhìn thấp bất thường.
              Form đăng ký nhà tuyển dụng thì dài hơn hẳn và CUỘN thật ở đây — đúng thiết kế.

              ⛔ CỐ Ý KHÔNG có `scrollbar-gutter: stable`: máng chừa sẵn ~15px ở mép PHẢI làm lề phải lệch
                 15px so với lề trái, và trên Windows nó hiện như một vệt thanh cuộn xám dù thẻ được tính để
                 KHÔNG cuộn. */}
          <div
            className={cn(
              'flex w-full shrink-0 flex-col overflow-y-auto lg:w-[492px]',
              AUTH_PANE_PADDING,
            )}
          >
            {/* `my-auto` chứ KHÔNG `justify-center` ở cha: trong hộp cuộn, `justify-center` cắt mất phần
                ĐẦU nội dung khi nó cao hơn hộp (không cuộn ngược lên được). `margin: auto` canh giữa lúc
                còn chỗ và tự nhường khi hết chỗ. */}
            <div className="my-auto w-full">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
