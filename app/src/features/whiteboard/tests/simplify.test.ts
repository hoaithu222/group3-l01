import {
  flattenPoints,
  rdp,
  simplifyStroke,
  strokeToFreehandFields,
  unflattenPoints,
  type Vec2,
} from '../engine';

const line = (n: number): Vec2[] => Array.from({ length: n }, (_, i) => ({ x: i, y: 0 }));

/** Vòng tròn bán kính 100 với `n` mẫu — mọi điểm đều "quan trọng", ép thuật toán phải cắt theo trần. */
const circle = (n: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => ({
    x: 100 * Math.cos((i / n) * 2 * Math.PI),
    y: 100 * Math.sin((i / n) * 2 * Math.PI),
  }));

describe('rdp', () => {
  it('đường thẳng co về hai đầu', () => {
    expect(rdp(line(11), 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it('giữ điểm gấp khúc (chữ L)', () => {
    const l: Vec2[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ];
    expect(rdp(l, 0.5)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('epsilon lớn hơn thì bỏ nhiều điểm hơn, luôn giữ đầu và cuối', () => {
    const noisy = line(50).map((p, i) => ({ x: p.x, y: i % 2 === 0 ? 0.3 : -0.3 }));
    const loose = rdp(noisy, 1);
    const tight = rdp(noisy, 0.1);
    expect(loose).toHaveLength(2);
    expect(tight.length).toBeGreaterThan(loose.length);
    expect(tight[0]).toEqual(noisy[0]);
    expect(tight.at(-1)).toEqual(noisy.at(-1));
  });

  it('nét rất dài (20000 mẫu) không tràn ngăn xếp', () => {
    const long = Array.from({ length: 20000 }, (_, i) => ({ x: i, y: Math.sin(i / 300) * 50 }));
    expect(rdp(long, 0.5).length).toBeLessThan(long.length);
  });
});

describe('simplifyStroke', () => {
  it('giữ điểm đầu và cuối (kể cả nét khép kín đầu ≈ cuối)', () => {
    const c = circle(400);
    const out = simplifyStroke([...c, c[0] as Vec2], { epsilon: 2 });
    expect(out[0]).toEqual(c[0]);
    expect(out.at(-1)).toEqual(c[0]);
    expect(out.length).toBeGreaterThan(8);
  });

  it('không bao giờ vượt 500 điểm dù epsilon nhỏ', () => {
    const out = simplifyStroke(circle(5000), { epsilon: 0.001 });
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out[0]).toEqual({ x: 100, y: 0 });
  });

  it('cắt đúng trần maxPoints tuỳ chỉnh', () => {
    expect(
      simplifyStroke(circle(2000), { epsilon: 0.001, maxPoints: 50 }).length,
    ).toBeLessThanOrEqual(50);
  });

  it('bỏ điểm trùng liên tiếp và điểm không hữu hạn', () => {
    const out = simplifyStroke([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: Number.NaN, y: 1 },
      { x: 10, y: 0 },
    ]);
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
});

describe('strokeToFreehandFields', () => {
  it('đổi sang hộp bao + toạ độ tương đối theo góc hộp', () => {
    const fields = strokeToFreehandFields([
      { x: 100, y: 200 },
      { x: 150, y: 200 },
      { x: 150, y: 260 },
    ]);
    expect(fields).toEqual({ x: 100, y: 200, w: 50, h: 60, points: [0, 0, 50, 0, 50, 60] });
  });

  it('chạm một cái (1 điểm) vẫn ra 2 điểm trùng để vẽ được chấm', () => {
    expect(strokeToFreehandFields([{ x: 5, y: 5 }])).toEqual({
      x: 5,
      y: 5,
      w: 0,
      h: 0,
      points: [0, 0, 0, 0],
    });
  });

  it('làm tròn 2 chữ số để không phình bản cập nhật', () => {
    const fields = strokeToFreehandFields([
      { x: 0.123456, y: 0 },
      { x: 10.98765, y: 3.14159 },
    ]);
    expect(fields.points).toEqual([0, 0, 10.86, 3.14]);
  });
});

describe('flatten / unflatten', () => {
  it('khứ hồi và bỏ số lẻ cuối', () => {
    const pts = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    expect(unflattenPoints(flattenPoints(pts))).toEqual(pts);
    expect(unflattenPoints([1, 2, 3])).toEqual([{ x: 1, y: 2 }]);
  });
});
