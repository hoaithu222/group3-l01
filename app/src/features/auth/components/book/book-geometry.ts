import type { ViewStyle } from 'react-native';

/**
 * Hình học + toán góc của quyển sách 3D đầu màn xác thực (`AuthBook`). Hàm `'worklet'` chạy trong `useAnimatedStyle` (luồng UI).
 *
 * ── Hệ trục ─────────────────────────────────────────────────────────────────────────────────────────────────────────
 * React Native theo CSS: x sang phải, y xuống, +z hướng VỀ người xem. `rotateY(α)` đưa (x, z) → (x·cosα + z·sinα,
 * −x·sinα + z·cosα). Gáy ở TRÁI, tờ nằm ở x > 0 ⇒ muốn mép tự do nhô VỀ người xem (z > 0) thì α ÂM: mở = `rotateY(−θ)`,
 * θ đi 0° (gập) → 180° (nằm phẳng bên trái gáy). Camera flutterfx `setEntry(3, 2, 0.001)` ≈ `{ perspective: 1000 }`.
 *
 * ── Tâm xoay = tâm view, và tâm view nằm ĐÚNG trên gáy ──────────────────────────────────────────────────────────────
 * Mỗi lớp xoay là một khung rộng 2W (W = bề rộng tờ/bìa) đặt TÂM lên gáy, nội dung ở MỘT nửa (nửa kia trống) ⇒ xoay quanh
 * tâm mặc định chính là xoay quanh gáy, không cần `transformOrigin` hay cặp `translateX(∓W/2)`.
 * ⚠️ Vì Android: RN 0.86 (`BaseViewManager.setTransformProperty`) PHÂN RÃ ma trận thành xoay/dời/co + `cameraDistance` quanh
 * TÂM view và bỏ phần dời theo z lẫn phối cảnh lệch tâm ⇒ xoay quanh MÉP bị trôi khỏi gáy vài dp ở góc giữa chừng. Tâm trùng
 * gáy thì phép phân rã CHÍNH XÁC, và mọi lớp chung MỘT camera (tâm phối cảnh = giữa gáy) ⇒ lớp nào cũng dựng đứng — thành
 * một nét — đúng ở 90°, nên công tắc mặt trước/mặt trong ở 90° không lộ. ⚠️ `perspective` phải đứng ĐẦU mảng transform.
 *
 * ── Bìa quá 90°: HAI khung anh em ───────────────────────────────────────────────────────────────────────────────────
 * Không có `preserve-3d`: con bị ép phẳng vào mặt phẳng của cha ⇒ `backfaceVisibility` của CON trong cha đã xoay vô tác dụng.
 * Mặt ngoài ở nửa phải, `rotateY(−θ)`. Mặt trong ở nửa TRÁI, `rotateY(180° − θ)`: mép tự do của nó (x = −W) tới
 * (−W·cos(180° − θ), W·sin(180° − θ)) = (W·cosθ, W·sinθ) — trùng khít mép tự do của mặt ngoài. θ = 0 ⇒ mặt trong quay lưng
 * (ẩn); θ = 180° ⇒ nằm phẳng bên trái, đọc thuận. Cả hai `backfaceVisibility: 'hidden'` + công tắc `opacity` ở 90° (cùng
 * cách thẻ lật của study: mặt sau từng lộ qua mặt trước trên vài đời GPU Android).
 *
 * ── Thứ tự vẽ: không có bộ đệm độ sâu, anh em VẼ SAU nằm TRÊN ───────────────────────────────────────────────────────
 * Camera ở ngay trên gáy ⇒ lớp θ < 90° chỉ chiếu sang PHẢI gáy, θ > 90° chỉ sang TRÁI: hai phía không bao giờ chồng nhau,
 * chỉ cần đúng thứ tự TRONG từng phía — và ở phía nào tia nhìn cũng trúng lớp DỰNG hơn (gần 90°) trước.
 *   ✅ Trái (trạng thái cuối): mặt trong bìa 180° < tờ 0 (170°) < … < tờ 5 (120°) ⇒ vẽ đúng thứ tự đó.
 *   ✅ Phải: mặt ngoài bìa (dựng nhất khi còn ở phải) vẽ SAU CÙNG; mặt trong bìa ở phải thì đang ẩn.
 *   ⚠️ Các tờ CÒN ở bên phải bị NGƯỢC thứ tự: tờ 5 (nằm nhất) vẽ đè các tờ dựng hơn. Bóng hình (hợp các tờ) không đổi — chỉ
 *   mất nét mép tự do của các tờ dựng hơn; phần phối cảnh phóng to của chúng vẫn lòi ra trên/dưới tờ 5 (tính tay ở p = 0.5:
 *   tờ 0 ở 85° cao hơn tờ 5 ở 60° ~6dp, sát gáy, cùng màu giấy ⇒ đọc như bề dày tập giấy). Chỉ ~150ms đầu lần mở (tờ 5 qua
 *   90° ở p = 0.75, `emphasizedDecelerate` tới đó rất sớm) ⇒ chấp nhận: trạng thái đứng lâu (mở) mới cần đúng.
 *   ❌ Không nhân đôi mỗi tờ (một bản cho mỗi phía): 14 lớp hoạt ảnh là quá tay cho Android yếu; đổi `zIndex` giữa chừng
 *   thì phải qua commit của cây bóng.
 *
 * ── Toả tờ theo KHÔNG GIAN (flutterfx `book_open.dart`) ─────────────────────────────────────────────────────────────
 * Mọi lớp chung MỘT `progress` p; góc đích của tờ i = 180° − (i + 1)·FAN_STEP ⇒ tờ trên cùng dừng ở 120°: mọi tờ sang hẳn
 * bên trái để LỘ trang trong có ba ô phân hệ. (Bản gốc chia đều 0…max ⇒ tờ cuối nằm đè gần kín trang trong.)
 */

export const PAGE_COUNT = 6;
const OPEN_DEG = 180;
const FAN_STEP_DEG = 10;
/** Bìa dựng đứng (một nét) ở đây — mốc đổi mặt ngoài ↔ mặt trong. */
const EDGE_ON_DEG = 90;
/**
 * Khoảng cách camera = 10 × bề rộng bìa: bìa 100dp ⇒ 1000 như bản gốc. Tỉ lệ theo cỡ (không số cố định) để sách nhỏ lúc
 * nằm ngang vẫn "sâu" y như sách lớn — mép tự do phóng 1/(1 − W·sinθ/perspective) lần, chỉ phụ thuộc TỈ SỐ W/perspective
 * (bìa dựng đứng: ×1.11; tờ trên cùng khi mở: ×1.09).
 */
const PERSPECTIVE_PER_BOARD_WIDTH = 10;

export interface BookGeometry {
  /** Bìa (cứng) — lớn hơn tờ `inset` ở mép trên, mép dưới và mép ngoài: mở ra thấy viền bìa ôm quanh ruột sách. */
  boardH: number;
  boardW: number;
  inset: number;
  /** Cạnh ảnh logo trên bìa. */
  logo: number;
  pageH: number;
  pageW: number;
  perspective: number;
  /** Biên độ lắc khi form báo lỗi (dp). */
  shake: number;
}

function makeGeometry(pageW: number, pageH: number, inset: number, logo: number, shake: number) {
  const boardW = pageW + inset;
  return {
    boardH: pageH + inset * 2,
    boardW,
    inset,
    logo,
    pageH,
    pageW,
    perspective: boardW * PERSPECTIVE_PER_BOARD_WIDTH,
    shake,
  } satisfies BookGeometry;
}

/**
 * Dọc: tờ 96×128 (3:4) — vừa ba hàng ô phân hệ 32dp (3·32 + 2·8 + 2·8 = 128); trải đôi 200dp, vừa máy 320dp.
 * Nằm ngang (màn thấp, bàn phím ăn nửa màn): một nửa ⇒ khung cao 72dp (hình cũ co về `size-20` = 80), form lên sớm hơn.
 */
const REGULAR = makeGeometry(96, 128, 4, 56, 6);
const COMPACT = makeGeometry(48, 64, 2, 28, 4);

export function bookGeometry(compact: boolean): BookGeometry {
  return compact ? COMPACT : REGULAR;
}

/**
 * Khung 2W × H của một lớp XOAY, đặt tâm lên gáy (gáy = x `boardW` trong khung sách 2·boardW × boardH).
 * `width`/`height` là cỡ của chính mặt (bìa hoặc tờ) — tâm dọc cũng trùng nhau ⇒ mọi lớp chung một camera.
 */
export function spineFrame(width: number, height: number, geometry: BookGeometry): ViewStyle {
  return {
    height,
    left: geometry.boardW - width,
    position: 'absolute',
    top: (geometry.boardH - height) / 2,
    width: width * 2,
  };
}

export function coverAngle(progress: number): number {
  'worklet';
  return OPEN_DEG * progress;
}

export function pageAngle(progress: number, index: number): number {
  'worklet';
  return (OPEN_DEG - (index + 1) * FAN_STEP_DEG) * progress;
}

/** Mặt ngoài hiện khi bìa chưa dựng đứng, mặt trong hiện từ lúc đó — đổi đúng khi bìa chỉ còn là một nét. */
export function coverFaceOpacity(progress: number, side: 'front' | 'inside'): number {
  'worklet';
  const pastEdge = coverAngle(progress) >= EDGE_ON_DEG;
  return pastEdge === (side === 'inside') ? 1 : 0;
}

/**
 * Giữ sách GIỮA khung: gập thì chỉ nửa phải có hình (dời −boardW/2), mở phẳng thì trải đôi (dời 0). Đi theo `(1 + cos πp)/2`
 * — vận tốc bằng 0 ở hai đầu nên sách không "giật" lúc bắt đầu/kết thúc trượt.
 */
export function bookShift(progress: number, boardW: number): number {
  'worklet';
  return (-boardW / 2) * ((1 + Math.cos(Math.PI * progress)) / 2);
}
