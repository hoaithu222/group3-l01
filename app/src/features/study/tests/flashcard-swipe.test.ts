import { faceOpacity, flipAngle } from '../components/flashcard/flashcard-flip';
import {
  FALLBACK_WIDTH,
  FLICK_MIN_DISTANCE,
  FLICK_VELOCITY,
  FLY_OUT_RATIO,
  MAX_TILT_DEG,
  SWIPE_MIN_DISTANCE,
  decideSwipe,
  flyOutDistance,
  swipeStrength,
  swipeThreshold,
  tiltDegrees,
} from '../components/flashcard/flashcard-swipe';

/**
 * Toán học của vuốt thẻ + lật 3D (hàm THUẦN, chạy được cả trên luồng UI lẫn Jest). Cử chỉ thật (Pan) phải thử trên máy —
 * ở đây khoá các ngưỡng để đổi số là test đỏ chứ không lặng lẽ đổi cảm giác vuốt.
 */
describe('swipeThreshold', () => {
  it('bằng 28% bề rộng thẻ, nhưng không dưới sàn (thẻ hẹp không được biến cú run tay thành quyết định)', () => {
    expect(swipeThreshold(400)).toBeCloseTo(112);
    expect(swipeThreshold(200)).toBe(SWIPE_MIN_DISTANCE);
    expect(swipeThreshold(0)).toBe(SWIPE_MIN_DISTANCE);
  });
});

describe('decideSwipe', () => {
  const width = 400; // ngưỡng ≈ 112

  it('quá ngưỡng sang PHẢI ⇒ đã thuộc; sang TRÁI ⇒ chưa thuộc', () => {
    expect(decideSwipe(120, 0, width)).toBe('known');
    expect(decideSwipe(-120, 0, width)).toBe('unknown');
  });

  it('chưa tới ngưỡng và không hất ⇒ không quyết định (thẻ bật về)', () => {
    expect(decideSwipe(60, 100, width)).toBeNull();
    expect(decideSwipe(-111, 0, width)).toBeNull();
    expect(decideSwipe(0, 0, width)).toBeNull();
  });

  it('đúng ngưỡng thì tính (biên đóng)', () => {
    const edge = swipeThreshold(width);
    expect(decideSwipe(edge, 0, width)).toBe('known');
    expect(decideSwipe(-edge, 0, width)).toBe('unknown');
    expect(decideSwipe(edge - 0.5, 0, width)).toBeNull();
  });

  it('hất NHANH theo cùng chiều thì không cần đủ quãng đường — nhưng vẫn phải đi ít nhất FLICK_MIN_DISTANCE', () => {
    expect(decideSwipe(FLICK_MIN_DISTANCE, FLICK_VELOCITY, width)).toBe('known');
    expect(decideSwipe(-FLICK_MIN_DISTANCE, -FLICK_VELOCITY, width)).toBe('unknown');
    expect(decideSwipe(FLICK_MIN_DISTANCE - 1, FLICK_VELOCITY * 3, width)).toBeNull();
    expect(decideSwipe(FLICK_MIN_DISTANCE, FLICK_VELOCITY - 1, width)).toBeNull();
  });

  it('hất NGƯỢC chiều thì không tính là hất: kéo trái ngắn rồi hất phải mạnh ⇒ không chấm', () => {
    expect(decideSwipe(-40, FLICK_VELOCITY * 2, width)).toBeNull();
  });

  it('kéo QUA ngưỡng rồi hất ngược thật mạnh lúc thả ⇒ huỷ (người dùng đổi ý); hất ngược nhẹ thì vẫn chấm', () => {
    expect(decideSwipe(150, -FLICK_VELOCITY * 2, width)).toBeNull();
    expect(decideSwipe(150, -FLICK_VELOCITY / 2, width)).toBe('known');
    expect(decideSwipe(-150, FLICK_VELOCITY * 2, width)).toBeNull();
  });

  it('bề rộng chưa đo (0) vẫn quyết định theo sàn — khung đầu tiên không làm cử chỉ chết', () => {
    expect(decideSwipe(SWIPE_MIN_DISTANCE, 0, 0)).toBe('known');
    expect(decideSwipe(SWIPE_MIN_DISTANCE - 1, 0, 0)).toBeNull();
  });
});

describe('swipeStrength / tiltDegrees / flyOutDistance', () => {
  it('độ đậm lớp phủ đi 0 → 1 theo quãng đường tới ngưỡng rồi dừng ở 1, đối xứng hai chiều', () => {
    expect(swipeStrength(0, 400)).toBe(0);
    expect(swipeStrength(56, 400)).toBeCloseTo(0.5);
    expect(swipeStrength(-56, 400)).toBeCloseTo(0.5);
    expect(swipeStrength(swipeThreshold(400), 400)).toBe(1);
    expect(swipeStrength(900, 400)).toBe(1);
  });

  it('độ nghiêng có dấu theo chiều kéo và bị kẹp ở ±MAX_TILT_DEG', () => {
    expect(tiltDegrees(0, 400)).toBe(0);
    expect(tiltDegrees(50, 400)).toBeGreaterThan(0);
    expect(tiltDegrees(-50, 400)).toBeLessThan(0);
    expect(tiltDegrees(9999, 400)).toBe(MAX_TILT_DEG);
    expect(tiltDegrees(-9999, 400)).toBe(-MAX_TILT_DEG);
    expect(Number.isFinite(tiltDegrees(10, 0))).toBe(true);
  });

  it('thẻ bay ra NGOÀI mép theo hướng chấm; chưa đo bề rộng thì dùng bề rộng dự phòng (không bay 0dp)', () => {
    expect(flyOutDistance('known', 400)).toBe(400 * FLY_OUT_RATIO);
    expect(flyOutDistance('unknown', 400)).toBe(-400 * FLY_OUT_RATIO);
    expect(flyOutDistance('known', 0)).toBe(FALLBACK_WIDTH * FLY_OUT_RATIO);
  });
});

describe('lật thẻ 3D', () => {
  it('mặt trước đi 0° → 180°, mặt sau đi −180° → 0° (khi thẻ tới 180° mặt sau đọc thuận)', () => {
    expect(flipAngle(0, 'front')).toBe(0);
    expect(flipAngle(1, 'front')).toBe(180);
    expect(flipAngle(0, 'back')).toBe(-180);
    expect(flipAngle(1, 'back')).toBe(0);
    expect(flipAngle(0.5, 'front')).toBe(90);
    expect(flipAngle(0.5, 'back')).toBe(-90);
  });

  it('xoay: công tắc mờ đổi đúng lúc thẻ nằm nghiêng 90° — chỉ MỘT mặt hiện tại mọi thời điểm', () => {
    for (const progress of [0, 0.25, 0.49, 0.5, 0.75, 1]) {
      const front = faceOpacity(progress, 'front', false);
      const back = faceOpacity(progress, 'back', false);
      expect(front + back).toBe(1);
    }
    expect(faceOpacity(0.49, 'front', false)).toBe(1);
    expect(faceOpacity(0.5, 'back', false)).toBe(1);
  });

  it('giảm chuyển động: chuyển mờ liên tục, hai mặt bù nhau', () => {
    expect(faceOpacity(0, 'front', true)).toBe(1);
    expect(faceOpacity(0.3, 'front', true)).toBeCloseTo(0.7);
    expect(faceOpacity(0.3, 'back', true)).toBeCloseTo(0.3);
    expect(faceOpacity(1, 'back', true)).toBe(1);
  });
});
