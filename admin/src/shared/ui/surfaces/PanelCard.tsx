/**
 * PanelCard — CARD CỦA MÀN DASHBOARD: khung HUD + header vạch chéo + thân + chân.
 *
 * Layout:
 *   ┌ ///  TÊN BOX  (ghi chú)          [slot phải] [phóng to] [đóng] ┐
 *   │                                                                │
 *   │                      children (thân)                           │
 *   │                                                                │
 *   ├────────────────────────────────────────────────────────────────┤
 *   │ footer (chỉ hiện khi có)                                       │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * ── Chọn cái nào trong nhóm `surfaces/` ────────────────────────────────────
 *   `Surface`   hộp phẳng, KHÔNG tiêu đề.
 *   `BoxPanel`  panel của màn NGHIỆP VỤ (bảng, form) — header phẳng hoặc cyber,
 *               thân tự cuộn. Không có khung HUD bọc ngoài.
 *   `HudFrame`  CHỈ cái khung. Tự dựng header/thân khi cần bố cục lạ.
 *   `PanelCard` ĐÂY — card của màn ĐIỀU HÀNH: khung + header + trạng thái
 *               tải/rỗng + nút phóng to/đóng, gói trong MỘT hợp đồng API.
 *
 * Vì sao tồn tại: một màn dashboard có 6-8 box, box nào cũng cần đúng ngần ấy
 * thứ. Dựng tay thì 8 box lệch nhau về chiều cao header, đệm thân, cỡ nút và
 * cách hiện trạng thái rỗng — đúng thứ đã phải đi sửa lại ở dự án nguồn trước
 * khi gom chúng về một chỗ.
 *
 * ⛔ KHÔNG lồng `PanelCard variant="hud"` trong một `HudFrame` khác: hai quầng
 *    sáng cộng lại làm mất cạnh khung. Card nằm trong khung khác →
 *    `variant="plain"`; card đè lên viewer 3D / ảnh → `variant="overlay"`.
 *
 * Usage:
 *   <PanelCard title="MÁY THIẾT BỊ" titleNote="1.453 máy" tone="azure">
 *     <EquipmentChart />
 *   </PanelCard>
 *
 *   <PanelCard
 *     density="compact"
 *     frame="prime"
 *     sweep
 *     title="SẢN LƯỢNG KẾ HOẠCH - THỰC TẾ"
 *     right={<SegmentToggle … />}
 *     onExpand={openFullscreen}
 *   >
 *     …
 *   </PanelCard>
 */
import { memo, type ReactNode } from 'react';

import { cn } from '@/shared/utils/style/cn';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import Button from '../actions/Button';
import EmptyState from '../feedback/EmptyState';
import Spinner from '../feedback/Spinner';
import DetailPanelHeader from '../layout/DetailPanelHeader';
import type { TitleIconColor } from '../layout/TitleScreen';
import HudFrame, { type HudFrameIntensity, type HudFrameWeight } from './HudFrame';
import {
  panelCard,
  PANEL_CARD_ACTION_ICON,
  PANEL_CARD_HEADER,
  PANEL_CARD_TOUCH_HIT,
  type PanelCardDensity,
  type PanelCardVariant,
} from './panel-card.theme';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PanelCardProps {
  /**
   * Tên box. Giữ kiểu `string` (không phải ReactNode) là CỐ Ý: `aria-label` của
   * nút đóng / phóng to ghép câu từ nó ("Đóng MÁY THIẾT BỊ"), và 8 box của cùng
   * một màn phải cùng một kiểu chữ tiêu đề.
   */
  title: string;
  /**
   * Ghi chú NGẮN ngay sau tiêu đề, chữ bé hơn — thường là con số tổng của box
   * ("1.453 máy", "5.531 người").
   *
   * Vì sao là prop riêng chứ không nối vào `title`: nối chuỗi thì con số ăn đúng
   * cỡ chữ + `uppercase` của tiêu đề và đọc ra như một phần của TÊN box, tranh
   * tiêu điểm với chính cái tên. Tách ra thì tên đọc trước, số lùi một bậc.
   */
  titleNote?: string;
  /** Slot phải header — tab, cặp ‹ ›, nút đổi dạng biểu đồ… */
  right?: ReactNode;
  /** Có handler → hiện nút phóng to / thu nhỏ ở cuối header. */
  onExpand?: () => void;
  /** Đang toàn màn hình — đổi icon + nhãn của nút `onExpand`. */
  expanded?: boolean;
  /** Có handler → hiện nút đóng. */
  onClose?: () => void;
  /** Chân card. Không truyền → KHÔNG render dải chân (không phải dải rỗng). */
  footer?: ReactNode;
  /** Tone khung + header. Khớp `iconColor` của module trên thanh tiêu đề. */
  tone?: TitleIconColor;
  /** Nền của card — xem `panel-card.theme.ts`. Default `hud`. */
  variant?: PanelCardVariant;
  /** Mật độ. Default `default`; ô lưới chật dùng `compact`. */
  density?: PanelCardDensity;
  /**
   * Độ "xịn" của khung — chuyển thẳng xuống `HudFrame.intensity`.
   *
   * Default `prime`: khung đầy đủ nẹp trong + thước chia + quầng rọi góc + ray
   * đáy. Panel phụ, hoặc lưới nhiều card, hạ về `cyber` / `default` cho nhẹ mắt.
   * Bỏ qua khi `variant` khác `hud`.
   */
  frame?: HudFrameIntensity;
  /** Độ nặng nét khung — `hairline` cho lưới 20+ card. */
  frameWeight?: HudFrameWeight;
  /** Vệt sáng quét mép trên (chỉ `frame="prime"`). CHỈ bật cho panel hero. */
  sweep?: boolean;
  /** Vát góc TL + BR của khung. Default `false` — xem ghi chú ở phần render. */
  notch?: boolean;
  /** Thân tràn viền (viewer, bảng, camera tự lo đệm của nó). */
  flushBody?: boolean;
  /** Đang tải — thân thay bằng spinner, header giữ nguyên. */
  loading?: boolean;
  /** Không có dữ liệu — thân thay bằng `EmptyState`. Bỏ qua khi `loading`. */
  empty?: boolean;
  /** Câu hiển thị khi `empty`. Default "Chưa có dữ liệu". */
  emptyText?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

const PanelCard = memo(function PanelCard({
  title,
  titleNote,
  right,
  onExpand,
  expanded = false,
  onClose,
  footer,
  tone = 'azure',
  variant = 'hud',
  density = 'default',
  frame = 'prime',
  frameWeight = 'regular',
  sweep = false,
  notch = false,
  flushBody = false,
  loading = false,
  empty = false,
  emptyText = 'Chưa có dữ liệu',
  className,
  bodyClassName,
  children,
}: PanelCardProps) {
  const slots = panelCard({ density, variant, flushBody });
  const geometry = PANEL_CARD_HEADER[density];
  const iconSize = PANEL_CARD_ACTION_ICON[density];
  const hasActions = Boolean(right || onExpand || onClose);

  const header = (
    <DetailPanelHeader
      action={
        hasActions ? (
          /*
            Khe 2px (`gap-0.5`) chứ không 4px: cụm này là thứ DUY NHẤT không co
            được trong header (`shrink-0` ở `DetailPanelHeader`), nên mỗi px nó
            giữ là một px tiêu đề phải nhường. Ở cột biên ~260–300px của laptop
            14" thì cụm nút đã ăn quá nửa hàng.
          */
          <div className="flex shrink-0 items-center gap-0.5">
            {right}
            {onExpand ? (
              <Button
                aria-label={expanded ? `Thu nhỏ ${title}` : `Phóng to ${title}`}
                className={PANEL_CARD_TOUCH_HIT}
                size="xs"
                title={expanded ? 'Thoát toàn màn hình (Esc)' : 'Phóng to'}
                variant="ghost"
                onClick={onExpand}
              >
                <SystemIcon
                  className="text-fg-2"
                  name={
                    expanded
                      ? 'arrow-down-left-and-arrow-up-right-to-center-outline'
                      : 'arrow-up-right-and-arrow-down-left-from-center-outline'
                  }
                  size={iconSize}
                />
              </Button>
            ) : null}
            {onClose ? (
              <Button
                aria-label={`Đóng ${title}`}
                className={PANEL_CARD_TOUCH_HIT}
                size="xs"
                variant="ghost"
                onClick={onClose}
              >
                <SystemIcon className="text-fg-2" name="xmark-outline" size={iconSize} />
              </Button>
            ) : null}
          </div>
        ) : undefined
      }
      className={geometry.className}
      innerClassName={geometry.innerClassName}
      size={geometry.size}
      /*
       * LUÔN truyền ReactNode — kể cả khi KHÔNG có `titleNote`.
       *
       * ⚠️ Đây là chỗ chữa lỗi "cụm nút bị cắt cụt" ở màn hẹp, đừng rút gọn
       * thành `titleNote ? <span…> : title`. Hai nhánh của `DetailPanelHeader`
       * dựng hai cây DOM khác nhau: nhánh ReactNode bọc `<div min-w-0 flex-1>`
       * rồi mới truncate ở `<span>` BÊN TRONG (ô flex và ô cắt chữ là hai phần
       * tử khác nhau → tiêu đề co đúng như mong đợi), còn nhánh string dồn
       * `flex-1` + `truncate` vào CÙNG một `<span>` và ở bố cục này nó KHÔNG co
       * — tiêu đề giữ nguyên bề rộng chữ đầy đủ rồi đẩy cụm nút vượt khỏi
       * `overflow-hidden` của header.
       *
       * Đi một nhánh duy nhất còn được thêm: kiểu chữ tiêu đề không NHẢY giữa
       * hai nhánh khi `titleNote` xuất hiện / biến mất theo trạng thái tải.
       */
      title={
        <span className={slots.titleRow()}>
          {/* `title` thuần của trình duyệt (không phải `<Text ellipsis>`): bậc
              chữ ở đây là `caption-12-bold` (700) mà `Text` quy `bold` về 500 —
              đổi sang nó là tiêu đề nhạt đi một bậc. */}
          <span className={slots.title()} title={title}>
            {title}
          </span>
          {titleNote ? <span className={slots.note()}>({titleNote})</span> : null}
        </span>
      }
      tone={tone}
    />
  );

  const body = (
    <div className={cn(slots.body(), bodyClassName)}>
      {loading ? (
        <div className={slots.state()}>
          <Spinner label={`Đang tải ${title}`} size="md" />
        </div>
      ) : empty ? (
        <div className={slots.state()}>
          <EmptyState size="sm" title={emptyText} titleClassName="text-caption-12" />
        </div>
      ) : (
        children
      )}
    </div>
  );

  const content = (
    <>
      {header}
      {body}
      {footer !== undefined && <div className={slots.footer()}>{footer}</div>}
    </>
  );

  if (variant !== 'hud') {
    return <section className={cn(slots.root(), className)}>{content}</section>;
  }

  /*
   * `notch={false}` MẶC ĐỊNH — card dashboard vuông góc.
   *
   * `HudFrame` mặc định vát 12px ở góc TL + BR. Card ở đây gần như luôn chứa
   * chart/bảng kẻ vuông, nên hai góc vát đọc ra như card bị cắt hụt chứ không
   * ra "khung HUD" — nhất là khi bên trong còn có tấm `variant="overlay"` vuông
   * nằm đè. Bracket [ ] ở 2 góc còn lại vẫn giữ, đó mới là thứ tạo chất HUD.
   */
  return (
    <HudFrame
      className={className}
      intensity={frame}
      notch={notch}
      sweep={sweep}
      tone={tone}
      weight={frameWeight}
    >
      {content}
    </HudFrame>
  );
});

PanelCard.displayName = 'PanelCard';

export default PanelCard;
