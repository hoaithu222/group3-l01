import { useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/utils/style/cn';
import { useDisplayStore } from '@/app/store';
import { HEADER_HEIGHT_CLASS, SHELL_GUTTER_X, SHELL_GUTTER_Y } from '@/shared/constants/layout';
import { useTvEscapeHatch } from '@/shared/hooks';
import { HeaderSlotsProvider } from '@/shared/widgets/header';
import { AppCommandPalette, AppDock, AppHeader } from '@/app/shell';

interface BackgroundLayoutProps {
  children: ReactNode;
  /** Render the top Header bar. Default `true`. */
  showHeader?: boolean;
  /** Render the bottom Dock launcher. Default `true`. */
  showDock?: boolean;
  /** className on the inner scrollable `<main>` area. */
  contentClassName?: string;
  /** className on the outer container. */
  className?: string;
}

/**
 * Nền chung toàn ứng dụng (theo Figma PMS-NEW).
 *
 * Layout:
 *  ┌──────────────────────────────────┐  ← outer = h-screen flex-col (KHÔNG scroll)
 *  │ <Header />     ← shrink-0        │
 *  ├──────────────────────────────────┤
 *  │ <main>                           │  ← flex-1 + overflow-y-auto
 *  │   children scroll trong đây      │     chiều cao = 100vh − HEADER_HEIGHT
 *  │                                  │
 *  └──────────────────────────────────┘
 *
 * Background gradient áp lên outer → KHÔNG scroll cùng nội dung (fixed effect).
 * Header KHÔNG cần sticky vì outer không scroll; `Header` chỉ là phần tử đầu
 * tiên trong flex-column và `shrink-0` giữ nguyên chiều cao.
 *
 * Khi đổi chiều cao header → sửa `HEADER_HEIGHT_PX` trong
 * `src/shared/constants/layout.ts`. Tất cả layout dùng Header tự đồng bộ.
 */
/**
 * Background layers — token-driven, DataV-style:
 *  - `--color-bg-base` canvas (dark = deep navy, light = soft gray)
 *  - Teal grid overlay 28px @ 4% opacity (DataV texture)
 *  - Radial glows: primary-5 (bottom), teal-5 (top-right), secondary-5 (left)
 */
const BACKGROUND_STYLE: CSSProperties = {
  backgroundColor: 'var(--color-bg-base)',
  backgroundImage: [
    // 1. Teal grid overlay — 28px, 4% opacity (DataV texture)
    'linear-gradient(color-mix(in srgb, var(--color-teal-5) 4%, transparent) 1px, transparent 1px)',
    'linear-gradient(90deg, color-mix(in srgb, var(--color-teal-5) 4%, transparent) 1px, transparent 1px)',
    // 2. primary-5 (tím thương hiệu) — bottom-center glow
    'radial-gradient(closest-side ellipse at 50% 100%, color-mix(in srgb, var(--color-primary-5) 26%, transparent), transparent)',
    // 3. teal-5 (cyan) — top-right corner glow
    'radial-gradient(closest-side ellipse at 100% 0%, color-mix(in srgb, var(--color-teal-5) 22%, transparent), transparent)',
    // 4. secondary-5 (cyan) — left-center glow
    'radial-gradient(closest-side ellipse at 0% 50%, color-mix(in srgb, var(--color-secondary-5) 18%, transparent), transparent)',
  ].join(', '),
  backgroundSize: '28px 28px, 28px 28px, auto, auto, auto',
  backgroundRepeat: 'repeat, repeat, no-repeat, no-repeat, no-repeat',
};

function BackgroundLayout({
  children,
  showHeader = true,
  showDock = true,
  contentClassName,
  className,
}: BackgroundLayoutProps) {
  // ⛔ ĐỔI PHẠM VI (2026-08-07, người dùng chốt) — TV mode KHÔNG phải chế độ
  // kiosk, và KHÔNG phóng to bố cục.
  //   • Header/Dock GIỮ NGUYÊN trong DOM ở mọi chế độ.
  //   • Kích thước khung/bảng/nút: GIỮ NGUYÊN.
  //   • Cỡ chữ: ×`--ui-scale` (1.1) — nhân vào token typography, KHÔNG vào root
  //     font-size, nên bố cục không bị kéo theo.
  //   • Padding ngoài: 8px ở MỌI chế độ (`SHELL_GUTTER_X`/`_Y`) — không còn
  //     nhánh JS nào đọc `mode` chỉ để đổi padding.
  // Chi tiết cơ chế: `docs/rules/tv-display-mode.md`.

  // Lối tắt bàn phím thoát TV mode (Ctrl/Cmd+Alt+Shift+T) — TIỆN DỤNG, KHÔNG
  // PHẢI lối thoát duy nhất: Header/UserMenu luôn hiển thị nên công tắc TV
  // trong đó vẫn bấm được bình thường. Mount ở layout gốc để hoạt động trên
  // mọi route. Xem lý do chọn tổ hợp phím + danh sách shortcut đã rà xung đột
  // trong `useTvEscapeHatch.ts`.
  const setDisplayMode = useDisplayStore((s) => s.setMode);
  const exitTv = useCallback(() => setDisplayMode('standard'), [setDisplayMode]);
  useTvEscapeHatch(exitTv);

  return (
    /* Provider bọc CẢ Header lẫn <main> → page ở trong <main> portal được tiêu
       đề/tabs của mình lên thanh header (xem `header/page-header-slots.tsx`). */
    <HeaderSlotsProvider>
      <div
        /**
         * `h-dvh` thay cho `h-screen` (= `100vh`) — SỬA CHO iPad, KHÔNG ĐỔI GÌ
         * TRÊN MÁY TÍNH.
         *
         * `100vh` của Safari iOS là chiều cao khi thanh URL + thanh công cụ ĐÃ
         * THU LẠI, tức LỚN HƠN vùng thực sự nhìn thấy khoảng 60–90px. Khung app
         * cao `100vh` vì thế thò xuống dưới thanh công cụ, kéo theo Dock (neo
         * đáy) chui hẳn ra ngoài màn — trên iPad người dùng KHÔNG thấy Dock đâu.
         *
         * `dvh` lấy đúng chiều cao đang nhìn thấy. Ở đây nó KHÔNG gây giật khi
         * cuộn (rủi ro thường gặp của `dvh`) vì `body` đã `overflow: hidden` —
         * tài liệu không cuộn nên Safari không bao giờ thu/nhả thanh công cụ,
         * giá trị `dvh` đứng yên suốt phiên.
         *
         * Trên mọi trình duyệt máy tính `dvh === vh` (không có thanh công cụ co
         * giãn) → chiều cao y hệt bản cũ, không lệch một pixel nào.
         */
        className={cn('relative h-dvh w-full flex flex-col overflow-hidden', className)}
        style={BACKGROUND_STYLE}
      >
        {showHeader && <AppHeader />}
        {/* HUD scanline under header — Chinese BigData signature.
            `belowHeader` bám theo chiều cao header RESPONSIVE (48/52/56px);
            KHÔNG hardcode `top-[56px]` nữa, nếu không vạch sẽ rơi vào giữa
            nội dung ở laptop 14"/16". */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute left-0 right-0 z-10 h-px',
            HEADER_HEIGHT_CLASS.belowHeader,
            // Token, KHÔNG hex: `rgba(45,212,191,…)` là `teal-5` viết cứng — đổi bảng màu
            // thì vạch này đứng yên ở màu cũ. Xem `docs/rules/color-system.md`.
            'bg-[linear-gradient(to_right,transparent_10%,color-mix(in_srgb,var(--color-teal-5)_60%,transparent)_50%,transparent_90%)]',
            'shadow-[0_0_8px_color-mix(in_srgb,var(--color-teal-5)_60%,transparent)]',
          )}
        />
        <main
          className={cn(
            // `min-h-0` cho phép flex-1 thực sự co lại để overflow-y-auto hoạt động
            // Full height: chiếm TOÀN BỘ chiều cao còn lại (100vh − header).
            // Dock là lớp fixed overlay nên không chừa padding đáy theo mode;
            // mọi mode giữ cùng một khung nội dung và Dock được phép đè lên.
            // OUTER PADDING — CHỈ layout này cấp, page CON không outer padding.
            'relative z-10 flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden',
            // Padding ngoài: 8px bốn phía ở mọi chế độ — bằng khe `gap-2` giữa các
            // panel; tiêu đề trang đã lên thanh header nên không cần khe dày phía trên.
            //
            // ⚠️ Phải là class LITERAL, KHÔNG nội suy biến CSS vào giá trị
            // arbitrary. Bản trước dùng một biến đơn vị phần trăm và hỏng theo
            // hai cách: padding tính bằng % quy chiếu theo BỀ RỘNG khung chứa
            // nên padding trên/dưới cũng ăn theo chiều ngang (lệch hẳn nhịp so
            // với p-4), và khi giá trị là 0% thì nội dung dính sát mép.
            //
            // Lưu ý: scanner của Tailwind đọc file dạng VĂN BẢN THUẦN nên nó
            // nhặt cả class nằm trong comment — viết tên class cũ ra đây sẽ sinh
            // ra một rule rác trong CSS build. Vì vậy mô tả bằng lời.
            // MỘT nguồn cho lề ngang, dùng chung với thanh header (chúng phải
            // nằm trên cùng một lưới).
            SHELL_GUTTER_X,
            SHELL_GUTTER_Y,
            contentClassName,
          )}
        >
          {children}
        </main>
        {showDock && <AppDock />}

        {/* Overlay toàn cục (Radix Portal → document.body), KHÔNG tham gia flex
            layout ở trên — mount một lần ở đây để Ctrl/Cmd+K hoạt động trên MỌI
            route, kể cả khi layout này ẩn Header/Dock. */}
        <AppCommandPalette />
      </div>
    </HeaderSlotsProvider>
  );
}

export default BackgroundLayout;
