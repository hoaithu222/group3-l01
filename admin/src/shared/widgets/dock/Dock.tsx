/**
 * Dock — thanh launcher kiểu macOS neo ĐÁY màn hình.
 *
 * GENERIC: danh sách mục đi vào qua prop `items` (`DockItemConfig[]`). Widget
 * KHÔNG đọc registry module nghiệp vụ nào — tầng `app/` tự dựng danh sách
 * (`src/app/shell/AppDock.tsx`). Nhờ vậy `shared/` không bao giờ import ngược
 * lên `@/app/**`. `items` rỗng → render `null` (thanh rỗng không có ý nghĩa gì).
 *
 * BỐN CHẾ ĐỘ HIỂN THỊ (lưu trong `dock-settings.ts`, người dùng đổi qua nút
 * bánh răng ngay trên thanh):
 *
 *   pinned     luôn hiện đầy đủ (mặc định của base)
 *   collapsed  co thành tay nắm ba chấm; rê chuột hoặc bấm để bung
 *   autohide   trượt xuống khuất, để lại vệt sáng gợi ý; rê chuột vào giữa mép
 *              dưới thì trồi lên
 *   hidden     khuất hẳn, KHÔNG còn gợi ý — nhưng vẫn gọi lại được bằng đúng
 *              dải kích hoạt đó (xem `dock-settings.ts` để biết vì sao base
 *              KHÔNG bỏ hẳn lối về như dự án gốc)
 *
 * ⛔ MÁY CHẠM BỊ ÉP `pinned`. Ba chế độ kia chỉ mở lại được khi có CON TRỎ để
 *    rê; màn cảm ứng không sinh `mousemove`. Người dùng chọn `hidden` trên máy
 *    tính, thiết lập được lưu, mở lại trên máy tính bảng là MẤT DOCK VĨNH VIỄN
 *    — kể cả đường vào phần cài đặt, vì nút bánh răng nằm trên chính thanh đang
 *    ẩn. Chỉ ghi đè giá trị DÙNG ĐỂ VẼ, TUYỆT ĐỐI không ghi ngược vào store:
 *    lựa chọn của người dùng phải còn nguyên cho lần sau mở trên máy tính.
 *
 * ⛔ Neo đáy đã cộng `--safe-b` (xem `DOCK_BOTTOM_CLASS`) — thiếu là hàng icon
 *    chồng lên vạch Home và vuốt để bấm hoá ra là cử chỉ thoát app.
 * ⛔ Chật chỗ thì CUỘN NGANG, KHÔNG ẩn bớt mục (`ipad-responsive.md §4`).
 *
 * Mục đang mở nhận diện theo `pathname`: khớp CHÍNH XÁC hoặc là tiền tố có
 * phân đoạn (`/a` khớp `/a/b` nhưng KHÔNG khớp `/ab`).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { useIsCoarsePointer } from '@/shared/hooks';
import { cn } from '@/shared/utils/style/cn';

import './dock-magnify.css';
import {
  DOCK_DURATION,
  DOCK_ENTER_CLASS,
  DOCK_HINT_CLASS,
  DOCK_MAGNIFY_CONTAINER_CLASS,
  DOCK_TRIGGER_ZONE,
  dockStyles,
} from './dock.theme';
import DockItem from './DockItem';
import DockSettingsButton from './DockSettingsButton';
import { useDockSettings } from './dock-settings';
import type { DockDisplayMode } from './dock-settings';
import type { DockItemConfig } from './dock-items.config';
import { useDockDisplayMode } from './useDockDisplayMode';

export interface DockProps {
  items?: readonly DockItemConfig[];
  /** Node phụ đặt sau vạch ngăn, TRƯỚC nút cài đặt (trợ lý, lối tắt riêng…). */
  trailing?: ReactNode;
  className?: string;
}

/**
 * Ba pha vẽ. `hidden` KHÔNG có nghĩa "chế độ ẩn" — nó là "thanh đang chưa được
 * gọi ra", dùng chung cho cả collapsed lẫn autohide.
 */
type DockPhase = 'hidden' | 'opening' | 'active';

/** `/a` khớp `/a` và `/a/b`, KHÔNG khớp `/ab`. */
function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Khoảng cách tới tâm hàng — hệ số lệch pha cho hiệu ứng bay vào.
 * 5 mục → [2, 1, 0, 1, 2], tức sóng lan từ giữa ra hai bên.
 */
function distanceFromCenter(index: number, total: number): number {
  return Math.round(Math.abs(index - (total - 1) / 2));
}

/** Chế độ chỉ gọi lại được bằng dải kích hoạt ở mép dưới màn hình. */
function isEdgeTriggered(mode: DockDisplayMode): boolean {
  return mode === 'autohide' || mode === 'hidden';
}

const Dock = memo(function Dock({ items, trailing, className }: DockProps) {
  const { pathname } = useLocation();

  const magnify = useDockSettings((s) => s.magnify);
  const setMode = useDockSettings((s) => s.setMode);
  const setMagnify = useDockSettings((s) => s.setMagnify);

  // Xem chú thích "MÁY CHẠM BỊ ÉP `pinned`" ở đầu file. Chỉ ghi đè giá trị vẽ.
  const isCoarsePointer = useIsCoarsePointer();
  const mode = useDockDisplayMode();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phase, setPhase] = useState<DockPhase>('hidden');

  const navRef = useRef<HTMLElement | null>(null);
  /**
   * Bản sao của `phase` để `reveal`/`conceal` KHÔNG phải nhận nó qua deps.
   *
   * Nếu hai hàm đó phụ thuộc `phase` thì mỗi lần đổi pha chúng đổi identity,
   * kéo theo `useEffect` gắn `mousemove` tháo ra gắn lại — mất luôn con trỏ
   * đang được theo dõi giữa chừng và thanh chớp tắt.
   */
  const phaseRef = useRef<DockPhase>('hidden');
  /**
   * Panel cấu hình đang mở hay không, dạng ref.
   *
   * Khai ở ĐÂY (cạnh các ref khác) chứ không phải cạnh chỗ ghi vào nó: `conceal`
   * bên dưới đọc nó, và một biến `const` khai SAU hàm đọc nó là thứ khiến người
   * đọc phải cuộn đi cuộn lại để tự trấn an rằng không có lỗi thứ tự.
   */
  const settingsOpenRef = useRef(false);
  const armTimer = useRef<number | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimer = useCallback((ref: { current: number | null }) => {
    if (ref.current === null) return;
    window.clearTimeout(ref.current);
    ref.current = null;
  }, []);

  const goToPhase = useCallback((next: DockPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  /**
   * Bung thanh NGAY. Dùng cho thao tác có chủ đích (rê vào tay nắm thu gọn,
   * bấm tay nắm) — chờ thêm ở đây chỉ làm giao diện có cảm giác chậm.
   */
  const revealNow = useCallback(() => {
    clearTimer(closeTimer);
    clearTimer(armTimer);
    if (phaseRef.current !== 'hidden') return;

    goToPhase('opening');
    // Đợi icon cuối cùng bay xong mới sang `active` — sang sớm là CSS còn đang
    // chạy mà rule đã tắt, icon giật một nhịp.
    const count = (items?.length ?? 0) + 2;
    clearTimer(openTimer);
    openTimer.current = window.setTimeout(
      () => goToPhase('active'),
      Math.max(
        DOCK_DURATION.shellOpen,
        count * DOCK_DURATION.iconStagger + DOCK_DURATION.iconEnter,
      ),
    );
  }, [clearTimer, goToPhase, items?.length]);

  /**
   * Bung thanh SAU một nhịp xác nhận. Dùng cho dải kích hoạt ở mép dưới: con
   * trỏ lướt ngang qua đáy màn hình là chuyện xảy ra suốt, bung ngay thì thanh
   * nhảy ra chắn mất nội dung khi người dùng chẳng hề gọi nó.
   */
  const revealArmed = useCallback(() => {
    clearTimer(closeTimer);
    if (phaseRef.current !== 'hidden' || armTimer.current !== null) return;

    armTimer.current = window.setTimeout(() => {
      armTimer.current = null;
      revealNow();
    }, DOCK_DURATION.armDelay);
  }, [clearTimer, revealNow]);

  /** Thu thanh lại sau một nhịp chờ — chống nhấp nháy khi con trỏ chỉ lướt qua. */
  const conceal = useCallback(() => {
    clearTimer(armTimer);
    // Panel cấu hình đang mở → giữ thanh lại. Nó neo vào chính nút bánh răng
    // trên thanh; thanh tụt xuống là panel treo lơ lửng giữa màn hình.
    if (settingsOpenRef.current) return;
    // ⛔ ĐANG có hẹn giờ thì ĐỪNG đặt lại. `mousemove` bắn liên tục; mỗi lần
    //    huỷ rồi hẹn lại là hẹn giờ không bao giờ tới hạn và thanh không bao
    //    giờ đóng.
    if (phaseRef.current === 'hidden' || closeTimer.current !== null) return;

    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      clearTimer(openTimer);
      goToPhase('hidden');
    }, DOCK_DURATION.closeDelay);
  }, [clearTimer, goToPhase]);

  /** Thu NGAY — dùng khi người dùng đã chọn xong một mục. */
  const concealNow = useCallback(() => {
    clearTimer(armTimer);
    clearTimer(openTimer);
    clearTimer(closeTimer);
    if (phaseRef.current === 'hidden') return;
    goToPhase('hidden');
  }, [clearTimer, goToPhase]);

  // Dọn mọi hẹn giờ khi tháo — thiếu là `setState` gọi trên component đã chết.
  useEffect(
    () => () => {
      clearTimer(armTimer);
      clearTimer(openTimer);
      clearTimer(closeTimer);
    },
    [clearTimer],
  );

  const handleSettingsOpenChange = useCallback(
    (next: boolean) => {
      settingsOpenRef.current = next;
      setSettingsOpen(next);
      // Huỷ hẹn giờ thu đang chạy dở — xem chú thích cùng nội dung ở `conceal`.
      if (next) clearTimer(closeTimer);
    },
    [clearTimer],
  );

  /**
   * Theo dõi con trỏ theo TOẠ ĐỘ, không theo phần tử được trỏ trúng.
   *
   * ⛔ VÌ SAO KHÔNG DÙNG `onMouseEnter` TRÊN MỘT PHẦN TỬ VÔ HÌNH: phần tử đó
   *    phải nằm đè lên đáy trang mới bắt được con trỏ, và khi đó nó NUỐT mọi cú
   *    bấm vào dải đó — nút nổi, thông báo, bảng có dòng phân trang sát đáy đều
   *    hoá ra bấm không ăn, mà chẳng có gì hiện ra để giải thích.
   *
   * Ba vùng, KHÔNG chồng nhau:
   *   A. Dải kích hoạt (giữa mép dưới, `DOCK_TRIGGER_ZONE`) → GỌI thanh lên.
   *   B. Khung của chính thanh + 8px lề        → GIỮ, không gọi, không thu.
   *   C. Ngoài A và B                          → hẹn giờ thu lại.
   *
   * Vùng B cố ý KHÔNG gọi lên: nếu nó cũng gọi thì ngay sau khi thanh tự thu,
   * con trỏ còn nằm trong khung cũ sẽ gọi nó dậy lại ngay lập tức.
   */
  const edgeTriggered = isEdgeTriggered(mode);
  useEffect(() => {
    if (edgeTriggered === false) return;

    let rafId: number | null = null;
    let latest: MouseEvent | null = null;

    // `mousemove` bắn hàng trăm lần mỗi giây; gộp về một lần mỗi khung hình.
    const check = () => {
      rafId = null;
      const e = latest;
      if (!e) return;

      const inTriggerZone =
        e.clientY >= window.innerHeight - DOCK_TRIGGER_ZONE.height &&
        Math.abs(e.clientX - window.innerWidth / 2) <= DOCK_TRIGGER_ZONE.halfWidth;

      if (inTriggerZone) {
        revealArmed();
        return;
      }

      const nav = navRef.current;
      if (nav) {
        const r = nav.getBoundingClientRect();
        const pad = 8;
        const inShellZone =
          e.clientX >= r.left - pad &&
          e.clientX <= r.right + pad &&
          e.clientY >= r.top - pad &&
          e.clientY <= r.bottom + pad;
        if (inShellZone) {
          clearTimer(closeTimer);
          return;
        }
      }

      // Vùng C — `conceal` tự lo phần "panel cấu hình đang mở thì đừng thu".
      conceal();
    };

    const onMove = (e: MouseEvent) => {
      latest = e;
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(check);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [edgeTriggered, revealArmed, conceal, clearTimer]);

  if (!items?.length) return null;

  const expanded = mode === 'pinned' || settingsOpen || phase !== 'hidden';
  const collapsed = mode === 'collapsed' && !expanded;
  const concealed = edgeTriggered && !expanded;
  const s = dockStyles({ collapsed, concealed });

  // Vạch ngăn và nút bánh răng bay vào SAU dãy icon — chúng ở rìa phải, tức xa
  // tâm nhất trong hàng.
  const tailIndex = Math.floor(items.length / 2);

  return (
    <>
      {/* Vệt sáng gợi ý chỉ có ở chế độ TỰ ẨN. `hidden` theo đúng tên gọi là
          không để lại dấu vết nào — lối về của nó là dải kích hoạt câm.
          Luôn có mặt trong DOM để còn mờ dần, thay vì biến mất đột ngột. */}
      {mode === 'autohide' && (
        <span
          aria-hidden
          className={DOCK_HINT_CLASS}
          data-hint-visible={concealed ? 'true' : 'false'}
        />
      )}

      <nav
        ref={navRef}
        aria-label="Dock"
        className={cn(s.root(), magnify && DOCK_MAGNIFY_CONTAINER_CLASS, className)}
        data-dock-state={phase}
        onMouseEnter={mode === 'collapsed' ? revealNow : undefined}
        onMouseLeave={mode === 'collapsed' ? conceal : undefined}
      >
        {collapsed ? (
          <button
            aria-expanded={false}
            aria-label="Mở rộng Dock"
            className={s.handle()}
            type="button"
            onClick={revealNow}
          >
            <span aria-hidden className={s.handleDot()} />
            <span aria-hidden className={s.handleDot()} />
            <span aria-hidden className={s.handleDot()} />
          </button>
        ) : (
          <>
            {items.map((item, idx) => (
              <DockItem
                key={item.id}
                active={isActivePath(pathname, item.href)}
                enterDelayMs={distanceFromCenter(idx, items.length) * DOCK_DURATION.iconStagger}
                item={item}
                magnify={magnify}
                // Thu thanh ngay khi đã chọn — kể cả khi bấm đúng mục của trang
                // đang mở, lúc đó `pathname` không đổi nên không có sự kiện điều
                // hướng nào để dựa vào.
                onSelect={edgeTriggered ? concealNow : undefined}
              />
            ))}

            {/* Vạch ngăn KHÔNG mang class phóng lân cận — nó sẽ làm ĐỨT chuỗi
                anh em mà hiệu ứng đó dựa vào. Hiệu ứng bay vào thì có, vì nó
                chạy trên chính phần tử này chứ không cần anh em. */}
            <span
              aria-hidden
              className={cn(s.divider(), DOCK_ENTER_CLASS)}
              style={
                {
                  ['--dock-icon-delay' as string]: `${(tailIndex + 1) * DOCK_DURATION.iconStagger}ms`,
                } as CSSProperties
              }
            />

            {trailing}

            <DockSettingsButton
              enterDelayMs={(tailIndex + 2) * DOCK_DURATION.iconStagger}
              modeLocked={isCoarsePointer}
              open={settingsOpen}
              settings={{ mode, magnify }}
              onMagnifyChange={setMagnify}
              onModeChange={setMode}
              onOpenChange={handleSettingsOpenChange}
            />
          </>
        )}
      </nav>
    </>
  );
});

export default Dock;
