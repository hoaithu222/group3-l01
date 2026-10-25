import {
  clamp,
  DISMISS_DISTANCE,
  DISMISS_VELOCITY,
  DOUBLE_TAP_SCALE,
  doubleTapScale,
  isZoomed,
  MAX_SCALE,
  panLimit,
  pinchScale,
  shouldDismiss,
} from '@/shared/ui/media-viewer/zoom-math';

/**
 * Số học thuần của cử chỉ zoom/vuốt-đóng ở `ZoomableImage` (p0-12). Jest không mô phỏng được pinch/pan, nên logic QUYẾT ĐỊNH nằm ở
 * đây và được khoá bằng test; phần cử chỉ thật phải thử trên thiết bị.
 */
describe('pinchScale', () => {
  it('nhân zoom đã lưu với hệ số của cử chỉ', () => {
    expect(pinchScale(1, 2)).toBe(2);
    expect(pinchScale(2, 1.5)).toBe(3);
  });

  it('kẹp trong [1, MAX_SCALE]: không thu nhỏ hơn ảnh gốc, không phóng quá trần', () => {
    expect(pinchScale(1, 0.4)).toBe(1);
    expect(pinchScale(3, 10)).toBe(MAX_SCALE);
  });
});

describe('isZoomed', () => {
  it('dung sai cho sai số dấu phẩy động sau khi pinch về 1', () => {
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(1.01)).toBe(false);
    expect(isZoomed(1.1)).toBe(true);
    expect(isZoomed(MAX_SCALE)).toBe(true);
  });
});

describe('panLimit', () => {
  it('phần ảnh phóng thừa ra ngoài khung, chia đôi hai phía', () => {
    expect(panLimit(400, 2)).toBe(200);
    expect(panLimit(400, 1.5)).toBe(100);
  });

  it('không phóng (hoặc thu nhỏ) thì không kéo được', () => {
    expect(panLimit(400, 1)).toBe(0);
    expect(panLimit(400, 0.5)).toBe(0);
  });
});

describe('doubleTapScale', () => {
  it('chưa zoom ⇒ lên mức chạm đúp; đang zoom ⇒ về 1', () => {
    expect(doubleTapScale(1)).toBe(DOUBLE_TAP_SCALE);
    expect(doubleTapScale(1.01)).toBe(DOUBLE_TAP_SCALE);
    expect(doubleTapScale(2)).toBe(1);
    expect(doubleTapScale(MAX_SCALE)).toBe(1);
  });
});

describe('shouldDismiss (kéo xuống khi chưa zoom)', () => {
  it('kéo đủ xa thì đóng', () => {
    expect(shouldDismiss(DISMISS_DISTANCE + 1, 0)).toBe(true);
    expect(shouldDismiss(DISMISS_DISTANCE, 0)).toBe(false);
  });

  it('vuốt nhanh về phía dưới thì đóng dù chưa xa', () => {
    expect(shouldDismiss(30, DISMISS_VELOCITY + 1)).toBe(true);
    expect(shouldDismiss(30, DISMISS_VELOCITY - 1)).toBe(false);
  });

  it('kéo LÊN không bao giờ đóng, kể cả vuốt nhanh', () => {
    expect(shouldDismiss(-300, 5000)).toBe(false);
    expect(shouldDismiss(0, 5000)).toBe(false);
  });
});

describe('clamp', () => {
  it('kẹp hai đầu', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});
