/**
 * ScrollEdgeNav — cặp nút cuộn NGANG dán ở hai mép một vùng cuộn (kit2).
 *
 * Bảng/lưới nhiều cột thì thanh cuộn ngang nằm tít dưới đáy: xem cột bên phải
 * là phải rời mắt xuống kéo. Nút này cho đi tiếp / lùi lại ngay tại chỗ đang
 * nhìn — bấm 1 nhịp, GIỮ thì chạy liên tục.
 *
 * Nhịp bấm: có `getStops` thì đi ĐÚNG một cột; không có thì đi gần một khung
 * màn hình.
 *
 * Hành vi:
 *  - Chỉ hiện khi rê chuột vào vùng cuộn → không đứng thường trực cạnh cột thao tác.
 *  - Hết đường về phía nào thì nút phía đó tắt hẳn, KHÔNG ăn click của ô bên dưới.
 *  - Vùng cuộn không tràn ngang → cả hai tự ẩn.
 *
 * Usage — phần tử bọc PHẢI có `relative` + `group/scroll-edge`:
 *   <div className="group/scroll-edge relative flex min-h-0 flex-1 flex-col">
 *     <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">…</div>
 *     <ScrollEdgeNav targetRef={scrollRef} />
 *   </div>
 *
 * `<Table scrollNav>` (kit2) đã dựng sẵn khuôn này — bảng thì bật prop, không
 * cần tự lắp.
 */

import { memo, useCallback } from 'react';
import { cn } from '@/shared/utils/style/cn';
import Button from '@/shared/ui/actions/Button';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useScrollEdgeNav } from './useScrollEdgeNav';

interface EdgeButtonProps {
  side: 'left' | 'right';
  /** Còn cuộn được về phía này. Hết đường → ẩn hẳn, trả click lại cho ô bên dưới. */
  active: boolean;
  onStep: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

const EdgeButton = memo(function EdgeButton(props: EdgeButtonProps) {
  const { side, active, onStep, onHoldStart, onHoldEnd } = props;
  const isLeft = side === 'left';
  const label = isLeft ? 'Cuộn sang trái' : 'Cuộn sang phải';

  return (
    <Button
      aria-hidden={!active}
      aria-label={label}
      className={cn(
        // Nút DẸT (h-8 w-5): cao đúng một dòng bảng nên không thành dải dài chạy
        // dọc cạnh cột thao tác — nhìn không ra "bộ nút hành động thứ hai".
        // `pointer-events-auto`: lớp bọc tắt hết pointer để không cướp click của
        // nội dung — chỉ đúng 2 nút này nhận chuột.
        'pointer-events-auto h-8 w-5 px-0',
        'border-border-2 bg-bg-2/85 text-fg-3 shadow-sm backdrop-blur-sm',
        'transition-colors duration-150 ease-out',
        'hover:border-sky-5 hover:bg-bg-3 hover:text-sky-4',
        !active && 'pointer-events-none opacity-0',
      )}
      size="xs"
      skin="neutral"
      tabIndex={active ? undefined : -1}
      title={`${label} — giữ để cuộn liên tục`}
      variant="stroke"
      onClick={onStep}
      onPointerCancel={onHoldEnd}
      onPointerDown={onHoldStart}
      onPointerLeave={onHoldEnd}
      onPointerUp={onHoldEnd}
    >
      <SystemIcon name={isLeft ? 'angle-left-outline' : 'angle-right-outline'} size={14} />
    </Button>
  );
});

export interface ScrollEdgeNavProps {
  /** Vùng cuộn ngang cần điều khiển (chính element có `overflow-auto`). */
  targetRef: React.RefObject<HTMLElement | null>;
  /**
   * Override vị trí lớp phủ. Mặc định `-inset-x-2`: nút nằm NGOÀI mép vùng cuộn,
   * ăn vào dải padding `p-2` của card. Khung KHÔNG có dải padding (hoặc cắt
   * `overflow-hidden` sát mép) thì truyền `inset-x-0` để nút nằm sát mép trong.
   */
  className?: string;
  /**
   * Mốc `scrollLeft` được phép dừng → 1 nhịp bấm đi ĐÚNG một cột. Bỏ trống thì
   * đi gần một khung màn hình (hợp với trục thời gian, nơi "một cột" là một ngày).
   *
   * PHẢI ổn định reference (`useCallback`) — component này `memo`.
   */
  getStops?: () => number[];
}

const ScrollEdgeNav = memo(({ targetRef, className, getStops }: ScrollEdgeNavProps) => {
  const { canScrollLeft, canScrollRight, step, startHold, endHold } = useScrollEdgeNav(targetRef, {
    getStops,
  });

  const stepLeft = useCallback(() => step(-1), [step]);
  const stepRight = useCallback(() => step(1), [step]);
  const holdLeft = useCallback(() => startHold(-1), [startHold]);
  const holdRight = useCallback(() => startHold(1), [startHold]);

  return (
    /**
     * ⛔ KHÔNG `return null` khi chưa tràn ngang: unmount là mất luôn
     * ResizeObserver, nên lúc khung hẹp lại (mở panel bên cạnh) nút sẽ không bao
     * giờ hiện lại. Ẩn bằng opacity, giữ hook sống.
     *
     * z-30 để nằm trên ô GHIM (sticky) của bảng/lưới.
     */
    <div
      className={cn(
        'pointer-events-none absolute -inset-x-2 inset-y-0 z-30 flex items-center justify-between',
        'opacity-0 transition-opacity duration-200',
        'focus-within:opacity-100 group-hover/scroll-edge:opacity-100',
        // ⛔ MÁY CHẠM: HIỆN THƯỜNG TRỰC. Trên iPad không có trạng thái "rê chuột
        //    vào", nên cặp nút cuộn ngang này KHÔNG BAO GIỜ hiện ra — mà ở lưới
        //    công việc và biểu đồ Gantt nó là đường duy nhất để đi tới các cột
        //    nằm ngoài khung. Ẩn theo thiết bị = mất chức năng (ipad-responsive §7).
        // ⚠️ KHÔNG dùng `touch:group-hover:*`: `:hover` trên iPadOS là trạng thái
        //    DÍNH (giữ tới lần chạm kế tiếp ở chỗ khác) nên nút sẽ chớp tắt thất thường.
        'touch:opacity-100',
        className,
      )}
    >
      <EdgeButton
        active={canScrollLeft}
        side="left"
        onHoldEnd={endHold}
        onHoldStart={holdLeft}
        onStep={stepLeft}
      />
      <EdgeButton
        active={canScrollRight}
        side="right"
        onHoldEnd={endHold}
        onHoldStart={holdRight}
        onStep={stepRight}
      />
    </div>
  );
});

ScrollEdgeNav.displayName = 'ScrollEdgeNav';

export default ScrollEdgeNav;
