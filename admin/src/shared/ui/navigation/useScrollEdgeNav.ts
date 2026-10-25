/**
 * @file useScrollEdgeNav.ts
 * @description Hook cho `<ScrollEdgeNav>` — cặp nút cuộn NGANG ở hai mép một vùng
 * cuộn: biết còn cuộn được về phía nào, bấm 1 nhịp thì cuộn mượt một bước, bấm
 * GIỮ thì cuộn liên tục cho tới khi nhả.
 *
 * Một bước = ĐÚNG một cột khi có `getStops` (bảng / lưới), ngược lại là gần một
 * khung màn hình (trục thời gian, nơi "một cột" chỉ là một ngày).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveScrollStop } from '@/shared/utils/browser/scroll-snap.utils';

/**
 * Nhịp cuộn KHI KHÔNG có mốc cột: 1 lần bấm đi 80% khung nhìn (sàn 200px); giữ quá 260ms thì chuyển
 * sang cuộn liên tục 1000px/giây. `EDGE_EPSILON` = sai số khi so mép, tránh nút
 * nhấp nháy vì lẻ nửa pixel do zoom trình duyệt.
 */
const STEP_RATIO = 0.8;
const MIN_STEP = 200;
const HOLD_DELAY = 260;
const HOLD_SPEED = 1000;
const EDGE_EPSILON = 2;
/**
 * Cửa sổ nối nhịp: bấm liên tiếp trong khoảng này thì mốc kế tiếp tính từ ĐÍCH
 * của nhịp trước, không từ `scrollLeft` hiện thời.
 *
 * Cuộn `smooth` chạy mất ~300ms mà `scrollLeft` trong lúc đó vẫn đang ở giữa
 * đường — lấy nó làm gốc thì cú bấm thứ hai giải ra ĐÚNG cái mốc đang chạy tới
 * và trông như nút bị liệt. Quá cửa sổ này coi như người dùng đã tự cuộn tay
 * (lăn chuột, kéo thanh cuộn) nên phải đo lại từ vị trí thật.
 */
const STEP_CHAIN_MS = 400;

interface HoldState {
  timeout?: number;
  raf?: number;
  /** Mốc khung hình trước — cuộn theo GIÂY, không theo số khung hình. */
  prev?: number;
  /** Đã THẬT SỰ cuộn liên tục — để nuốt cú click phát ra khi nhả nút. */
  ran: boolean;
}

export interface ScrollEdgeNavOptions {
  /**
   * Mốc `scrollLeft` được phép dừng — thường là mép trái của từng cột. Có hàm
   * này thì 1 nhịp bấm đi ĐÚNG một cột; bỏ trống thì đi gần một khung màn hình.
   *
   * Gọi lại ở MỖI lần bấm (không cache): cột kéo giãn / bật-tắt / bảng đổi dữ
   * liệu đều ra mốc đúng ngay, không cần đồng bộ state.
   */
  getStops?: () => number[];
}

/** Trạng thái + hành vi cuộn ngang cho `<ScrollEdgeNav>`. */

interface ScrollEdgeNavApi {
  /** Còn nội dung bên trái / bên phải → nút phía đó sáng và bấm được. */
  canScrollLeft: boolean;
  canScrollRight: boolean;
  /** Bấm 1 nhịp. Vừa cuộn liên tục xong thì nhịp này bị bỏ qua (xem `HoldState.ran`). */
  step: (dir: -1 | 1) => void;
  /** Nhấn xuống — quá `HOLD_DELAY` mà chưa nhả thì bắt đầu cuộn liên tục. */
  startHold: (dir: -1 | 1) => void;
  /** Nhả / rê chuột ra ngoài / huỷ pointer — dừng cuộn liên tục. */
  endHold: () => void;
}

/** Trạng thái + hành vi cuộn ngang cho `<ScrollEdgeNav>`. */
export function useScrollEdgeNav(
  targetRef: React.RefObject<HTMLElement | null>,
  { getStops }: ScrollEdgeNavOptions = {},
): ScrollEdgeNavApi {
  const [edges, setEdges] = useState({ left: false, right: false });
  const hold = useRef<HoldState>({ ran: false });
  /** Đích của nhịp bấm gần nhất + mốc thời gian — xem `STEP_CHAIN_MS`. */
  const pending = useRef<{ left: number; at: number } | null>(null);

  const sync = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > EDGE_EPSILON;
    const right = el.scrollLeft < max - EDGE_EPSILON;
    // So trước khi set — set object mới mỗi nhịp `scroll` là render lại cả bảng.
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, [targetRef]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    // Gom mọi tín hiệu trong CÙNG khung hình về 1 lần đo: đọc `scrollWidth` là ép
    // trình duyệt tính lại layout, mà `scroll` bắn liên tục.
    let frame = 0;
    const requestSync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        sync();
      });
    };
    sync();

    el.addEventListener('scroll', requestSync, { passive: true });

    // Quan sát CẢ vùng cuộn lẫn lớp nội dung: khung hẹp lại (thu/mở panel bên cạnh)
    // hay nội dung rộng ra (bật thêm cột) đều đổi kết luận "còn cuộn được".
    const resizeObserver = new ResizeObserver(requestSync);
    resizeObserver.observe(el);
    let content = el.firstElementChild;
    if (content) resizeObserver.observe(content);

    // Lưới đổi HẲN lớp nội dung (empty-state ↔ thân bảng khi dữ liệu về) → bám sang
    // phần tử mới, không thì còn đo cái đã bị gỡ khỏi DOM.
    const childObserver = new MutationObserver(() => {
      const next = el.firstElementChild;
      if (next === content) return;
      if (content) resizeObserver.unobserve(content);
      content = next;
      if (content) resizeObserver.observe(content);
      requestSync();
    });
    childObserver.observe(el, { childList: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener('scroll', requestSync);
      resizeObserver.disconnect();
      childObserver.disconnect();
    };
  }, [targetRef, sync]);

  const endHold = useCallback(() => {
    const state = hold.current;
    if (state.timeout != null) window.clearTimeout(state.timeout);
    if (state.raf != null) cancelAnimationFrame(state.raf);
    state.timeout = state.raf = state.prev = undefined;
  }, []);

  const startHold = useCallback(
    (dir: -1 | 1) => {
      endHold();
      // Reset ở ĐẦU mỗi lượt bấm: nhả chuột ngoài nút thì `click` không bắn ra,
      // cờ `ran` còn treo lại sẽ nuốt oan cú bấm kế tiếp.
      hold.current.ran = false;

      hold.current.timeout = window.setTimeout(() => {
        hold.current.ran = true;
        const tick = (now: number) => {
          const el = targetRef.current;
          if (!el) return;
          const delta = now - (hold.current.prev ?? now);
          hold.current.prev = now;
          // Cộng thẳng `scrollLeft` — `scrollBy` smooth từng khung hình sẽ chồng
          // animation lên nhau và giật.
          el.scrollLeft += (dir * HOLD_SPEED * delta) / 1000;
          hold.current.raf = requestAnimationFrame(tick);
        };
        hold.current.raf = requestAnimationFrame(tick);
      }, HOLD_DELAY);
    },
    [endHold, targetRef],
  );

  const step = useCallback(
    (dir: -1 | 1) => {
      // Vừa cuộn liên tục xong → `click` lúc nhả nút KHÔNG được cộng thêm 1 nhịp.
      // Đích cũ cũng bỏ luôn: giữ nút đã kéo đi rất xa, nối tiếp từ đó là sai.
      if (hold.current.ran) {
        hold.current.ran = false;
        pending.current = null;
        return;
      }
      const el = targetRef.current;
      if (!el) return;

      // Có mốc cột → dừng ĐÚNG mép cột kế tiếp. Cuộn tới toạ độ TUYỆT ĐỐI
      // (`scrollTo`) chứ không cộng dồn quãng: bấm liên tiếp trong lúc animation
      // trước chưa xong vẫn không lệch khỏi mép cột.
      const stops = getStops?.();
      if (stops?.length) {
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        const now = performance.now();
        const last = pending.current;
        const from = last && now - last.at < STEP_CHAIN_MS ? last.left : el.scrollLeft;
        const left = resolveScrollStop(stops, from, dir, max);
        pending.current = { left, at: now };
        el.scrollTo({ left, behavior: 'smooth' });
        return;
      }

      const distance = Math.max(MIN_STEP, el.clientWidth * STEP_RATIO);
      el.scrollBy({ left: dir * distance, behavior: 'smooth' });
    },
    [getStops, targetRef],
  );

  // Rời màn khi đang giữ nút → huỷ timer + rAF, không để chạy tiếp trên DOM cũ.
  useEffect(() => endHold, [endHold]);

  return { canScrollLeft: edges.left, canScrollRight: edges.right, step, startHold, endHold };
}
