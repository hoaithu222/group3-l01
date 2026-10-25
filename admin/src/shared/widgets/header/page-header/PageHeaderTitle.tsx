/**
 * PageHeaderTitle — "bảng tên" module (keystone) ở cụm tâm thanh header.
 *
 * Hình khối: dải cao trọn thanh, cắt vát hai vai (`clip-path`), nền gradient
 * dâng từ đáy, hairline sáng chạy mép dưới và HAI CÁNH ba vạch chéo nhạt dần.
 * Tông màu lấy theo `tone` — dùng `color-mix()` trên CSS var của token nên
 * KHÔNG có hex nào hardcode.
 *
 * ⛔ BẢNG TÊN CHỈ CÓ CHỮ — KHÔNG gem icon. Nhận diện module thể hiện hoàn toàn
 *    bằng TONE màu: nền vát, hairline đáy, cánh vạch chéo và quầng chữ đều bám
 *    tone. Đừng thêm lại `<SystemIcon>` vào đây.
 *
 * Inline `style` ở đây là ngoại lệ hợp lệ của `tailwind-conventions.md`:
 * giá trị phụ thuộc biến JS (`tone`) nên không biểu diễn được bằng utility —
 * và Tailwind v4 CSS-first cấm nội suy `${...}` vào className.
 */
import { memo } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { TitleIconColor } from '@/shared/ui';

import { pageHeaderStyles } from './page-header.theme';

/** Xem chú thích variant `size` trong `pageHeaderStyles` trước khi dùng `sm`. */
export type PageHeaderTitleSize = 'md' | 'sm';

export interface PageHeaderTitleProps {
  title: string;
  /**
   * DÒNG PHỤ nằm NGAY DƯỚI tiêu đề, trong cùng bảng tên — dành cho ngữ cảnh của
   * bản ghi đang mở (khoảng ngày · trạng thái…).
   *
   * ⛔ CHỈ MỘT HÀNG, NGẮN. Bảng tên cao trọn thanh (44/56px): tiêu đề ăn hàng
   *    trên, dòng này là chỗ còn lại.
   *
   * Đừng nhét ngữ cảnh đó vào `start` của `PageHeader`: cụm trái phình ra là
   * bảng tên canh-giữa bị đẩy lệch tâm.
   */
  subtitle?: ReactNode;
  /** Tông màu bảng tên — nhận diện module. */
  tone?: TitleIconColor;
  /**
   * `md` (mặc định) — tiêu đề TĨNH của module.
   * `sm` — tiêu đề ĐỘNG của trang chi tiết (tên bản ghi): chữ nhỏ hơn + trần bề
   * rộng chặt hơn nên không đè lên cụm hai bên khi tên dài.
   */
  titleSize?: PageHeaderTitleSize;
}

/**
 * Prop NỘI BỘ — cố ý KHÔNG nằm trong `PageHeaderTitleProps` (interface đó được
 * `PageHeaderProps` kế thừa, thêm vào là page tự bật/tắt được). Chỉ `PageHeader`
 * biết cụm tâm có hai ô bên hay không.
 */
interface PageHeaderTitleInternalProps extends PageHeaderTitleProps {
  /**
   * Cụm tâm có hai ô nav hai bên → bật SÀN bề rộng + siết TRẦN cho bảng tên.
   * Hai ô bên là `flex-1 basis-0` nên 100% phần co dồn vào bảng tên; không có
   * sàn thì tiêu đề teo còn "…" trong khi dải tab vẫn nguyên bề rộng. Xem
   * variant `sided` trong `pageHeaderStyles`.
   */
  sided?: boolean;
}

const s = pageHeaderStyles();

/**
 * Nền bảng tên: trapezoid vát hai vai + tone loang từ đáy lên.
 *
 * Độ vát lấy từ `--plate-cut` (khai trong `pageHeaderStyles.plate`) nên tự co
 * theo bậc màn. Hardcode một con số sẽ khiến vai vát ăn lẹm vào cánh vạch chéo
 * khi bảng tên thu nhỏ.
 */
const plateStyle = (tone: TitleIconColor): CSSProperties => ({
  clipPath: 'polygon(var(--plate-cut) 0, calc(100% - var(--plate-cut)) 0, 100% 100%, 0 100%)',
  background: `linear-gradient(to top,
      color-mix(in srgb, var(--color-${tone}-5) 20%, transparent) 0%,
      color-mix(in srgb, var(--color-${tone}-5) 6%, transparent) 55%,
      transparent 100%)`,
});

/**
 * Chữ tiêu đề: RÕ NÉT là ưu tiên số 1 — fill ĐẶC, KHÔNG gradient-clip.
 *
 * ⛔ HAI THỨ TỪNG LÀM CHỮ MỜ, ĐÃ BỎ HẲN — đừng đưa lại:
 *  1. `background-clip: text` + `color: transparent` → trình duyệt buộc phải bỏ
 *     subpixel antialiasing; trên nền header tối, glyph mảnh đi và viền chữ nhoè.
 *  2. `filter: drop-shadow(...)` → `filter` rasterize CẢ phần tử rồi mới vẽ, nên
 *     chính nét chữ cũng bị lấy mẫu lại.
 *
 * Thay bằng fill đặc `fg-on-nav` + `text-shadow` (chỉ vẽ bóng PHÍA SAU, không
 * rasterize glyph): bóng tối 1px tách chữ khỏi nền ở mọi tone, quầng tone mờ giữ
 * nhận diện màu module.
 */
const titleStyle = (tone: TitleIconColor): CSSProperties => ({
  color: 'var(--color-fg-on-nav)',
  // ⛔ Đen qua TOKEN `black-5` (đen 50%) — KHÔNG `rgb(0 0 0 / 0.45)` viết cứng.
  //    Cùng con số với bóng chữ của chip đang mở (`pageNavStyles.active`).
  textShadow: `0 1px 2px var(--color-black-5), 0 0 12px color-mix(in srgb, var(--color-${tone}-5) 32%, transparent)`,
});

/**
 * Cánh 3 vạch chéo nhạt dần — `side` quyết định CẢ chiều nhạt dần LẪN chiều
 * nghiêng của vạch (hai cánh đối xứng gương, xem `pageHeaderStyles.wingBar`).
 */
function Wing({ side, tone }: { side: 'left' | 'right'; tone: TitleIconColor }) {
  const toneVar = `var(--color-${tone}-5)`;

  return (
    <span aria-hidden className={s.wing({ side })}>
      <span
        className={s.wingBar({ side })}
        style={{ background: toneVar, boxShadow: `0 0 4px ${toneVar}` }}
      />
      <span
        className={s.wingBar({ side })}
        style={{ background: `color-mix(in srgb, ${toneVar} 65%, transparent)` }}
      />
      <span
        className={s.wingBar({ side })}
        style={{ background: `color-mix(in srgb, ${toneVar} 30%, transparent)` }}
      />
    </span>
  );
}

function PageHeaderTitle({
  title,
  subtitle,
  tone = 'yellow',
  titleSize = 'md',
  sided = false,
}: PageHeaderTitleInternalProps) {
  const toneVar = `var(--color-${tone}-5)`;
  const hasSubtitle = subtitle != null && subtitle !== false;

  return (
    // `withSubtitle` PHẢI truyền cho CẢ `plate`, không chỉ `title`: bảng tên hai
    // hàng cần hạ ruột xuống cho khớp ray đáy — xem variant cùng tên trong
    // `pageHeaderStyles`.
    <div className={s.plate({ size: titleSize, withSubtitle: hasSubtitle })}>
      <span aria-hidden className={s.plateBg()} style={plateStyle(tone)} />
      <span
        aria-hidden
        className={s.plateRail()}
        style={{
          background: `linear-gradient(to right, transparent, ${toneVar}, transparent)`,
          boxShadow: `0 0 8px ${toneVar}`,
        }}
      />

      <Wing side="left" tone={tone} />

      <span className={s.titleBlock({ sided })}>
        {/*
          Tiêu đề trang là `<h1>` THẬT — bảng tên này THAY dải `<TitleScreen>` đầu
          trang (vốn render `<h1>`), nên nó phải gánh luôn vai trò heading gốc của
          trang: trình đọc màn hình nhảy theo tiêu đề vẫn tới được, và cây heading
          không bắt đầu từ `<h2>` của các khối con. Preflight của Tailwind đã reset
          margin/cỡ chữ của `h1` nên hình KHÔNG đổi một pixel nào.

          `title` native — nhãn bị `truncate` vẫn đọc được đầy đủ khi rê chuột.
        */}
        <h1
          className={s.title({ sided, size: titleSize, withSubtitle: hasSubtitle })}
          style={titleStyle(tone)}
          title={title}
        >
          {title}
        </h1>
        {hasSubtitle && <span className={s.subtitle()}>{subtitle}</span>}
      </span>

      <Wing side="right" tone={tone} />
    </div>
  );
}

export default memo(PageHeaderTitle);
