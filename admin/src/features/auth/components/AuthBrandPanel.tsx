/**
 * AuthBrandPanel — khoang TRÁI của tấm thẻ xác thực: "trang bìa" của nền tảng học tập.
 *
 *   [■] Super App Admin              ← dấu thương hiệu: ô tím đặc + bóng cứng hổ phách ("nhãn dán")
 *   Nền tảng học tập
 *   ▀thông minh▀                     ← câu dẫn; từ khoá tô vệt bút dạ quang (`HIGHLIGHTER_STYLE`)
 *   Cổng vận hành dành cho…          ← MỘT câu: đây là cổng vận hành, và vận hành những gì
 *   ●──●──(📍)┄┄◌┄┄★                 ← `LearningRoadmapArt` — hút phần cao dôi (`flex-1`)
 *   ① Lộ trình học & bài giảng       ← ba phân hệ; số do CSS counter sinh
 *   ② …   ③ …
 *
 * Chữ ở `constants/auth-brand.ts`, nền & màu ở `constants/auth-card.ts` — file này chỉ dựng hình.
 *
 * Dùng <p>, KHÔNG heading: `h1` của trang là tiêu đề FORM ("Đăng nhập") — đó mới là việc trang này làm.
 * Khoang này đứng TRƯỚC form trong DOM; cho câu dẫn làm heading thì cây heading mở đầu bằng khẩu hiệu.
 *
 * Điện thoại (< `md`): giữ dấu thương hiệu + câu dẫn + câu mô tả, ẩn danh sách phân hệ. Danh sách là lời
 * giới thiệu, không phải chức năng — để nguyên thì form bị đẩy xuống dưới nếp gấp màn hình.
 *
 * ⛔ Lề trong lấy từ `AUTH_PANE_PADDING` — CÙNG hằng số với khoang form, để đỉnh chữ hai bên thẳng hàng.
 */

import { memo, type CSSProperties } from 'react';

import { appConfig } from '@/core/config';
import { Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';
import { hudInk, hudMix } from '@/shared/utils/style/hud-fx.utils';

import { BRAND_FEATURES, BRAND_SUMMARY, BRAND_TAGLINE } from '../constants/auth-brand';
import { BRAND_DOTS_STYLE, BRAND_MARK_STYLE, BRAND_PANE_STYLE } from '../constants/auth-card';
import { AUTH_PANE_PADDING, HIGHLIGHTER_STYLE } from '../constants/auth-motifs';
import LearningRoadmapArt from './LearningRoadmapArt';

const AuthBrandPanel = memo(function AuthBrandPanel() {
  return (
    <section
      className={cn(
        'relative isolate flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-6 overflow-hidden',
        AUTH_PANE_PADDING,
      )}
      style={BRAND_PANE_STYLE}
    >
      {/* Góc giấy chấm. `-z-10` trong `isolate`: nằm TRÊN nền khoang nhưng DƯỚI chữ. Thiếu `isolate` thì
          z âm tụt xuống dưới cả nền của khoang và biến mất; bỏ `-z-10` thì lớp `absolute` này vẽ ĐÈ lên
          chữ (phần tử định vị luôn vẽ sau phần tử thường). */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 -z-10 h-3/5 w-3/5"
        style={BRAND_DOTS_STYLE}
      />

      {/* Dấu thương hiệu. Icon trắng trên ô tím ĐẶC: nền không lật theo theme nên icon cũng không lật
          (`text-contrast.md §2.1`). `bg-brand` (không `primary-6`) vì ở theme sáng nó thẫm hơn một bậc —
          icon trắng đạt ~5.4:1 thay vì ~4:1. */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center bg-brand text-neutral-0"
          style={BRAND_MARK_STYLE}
        >
          <SystemIcon name="waypoints-outline" size={22} />
        </span>
        <Text ellipsis weight="medium">
          {appConfig.appName}
        </Text>
      </div>

      {/* Câu dẫn HAI dòng từ `lg` (vế đầu `lg:block` đẩy từ khoá xuống dòng riêng) — từ khoá đứng một mình
          một dòng thì vệt bút mới đọc ra "nhấn". Màn hẹp để chữ tự xuống dòng theo bề ngang.

          Chữ đè lên vệt bút giữ `fg-1` (tự lật), KHÔNG tô tím: ở theme tối vệt pha ra nâu ô-liu, chữ tím
          trên đó tụt dưới 3:1 (xem `HIGHLIGHTER_STYLE`). */}
      <div className="flex flex-col gap-3">
        <Text as="p" className="lg:text-h2-medium" size="extraLarge" weight="medium">
          <span className="lg:block">{BRAND_TAGLINE.lead}</span>{' '}
          <span style={HIGHLIGHTER_STYLE}>{BRAND_TAGLINE.mark}</span>
        </Text>
        <Text as="p" className="text-fg-3" size="small">
          {BRAND_SUMMARY}
        </Text>
      </div>

      <LearningRoadmapArt />

      {/* Danh sách phân hệ, CÓ ĐÁNH SỐ. Số sinh bằng CSS counter, KHÔNG gõ "1" vào markup: gõ tay thì trình
          đọc màn hình đọc số hai lần (một lần của <ol>, một lần của chữ), và thêm/bớt dòng phải đánh lại.

          Số là SỐ ⇒ font sans + `tabular-nums`, KHÔNG font mono (`visual-hierarchy.md §3.3.1`). Vòng số
          mang tông riêng từng dòng qua hai biến `--feat-bg` / `--feat-ink`: nền pha 18% với `transparent`,
          chữ pha 45% với `fg-1` (`hudInk`) — thẫm lại ở theme sáng, sáng lên ở theme tối, cả hai ≥ 5:1.

          `pt-0.5` ở cột chữ: vòng số cao 24px, dòng tiêu đề cao 20px — đẩy chữ xuống 2px là tâm hai thứ
          trùng nhau. */}
      <ol className="hidden list-none flex-col gap-3 [counter-reset:feat] md:flex">
        {BRAND_FEATURES.map((f) => (
          <li
            key={f.key}
            className="flex items-start gap-3 [counter-increment:feat] before:flex before:size-6 before:shrink-0 before:items-center before:justify-center before:rounded-full before:text-caption-12-medium before:tabular-nums before:content-[counter(feat)] before:[background:var(--feat-bg)] before:[color:var(--feat-ink)]"
            style={
              { '--feat-bg': hudMix(f.tone, 18), '--feat-ink': hudInk(f.tone, 45) } as CSSProperties
            }
          >
            <span className="flex min-w-0 flex-col pt-0.5">
              <Text size="small" weight="medium">
                {f.title}
              </Text>
              <Text size="tiny" skin="muted">
                {f.detail}
              </Text>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
});

export default AuthBrandPanel;
