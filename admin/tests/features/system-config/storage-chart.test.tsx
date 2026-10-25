/**
 * `StorageByScopeChart` — cột theo scope, trục một đơn vị chung, nhãn/tooltip đọc được (p0-05
 * admin.md §2.1). jsdom không có layout nên `ResizeObserver` giả báo sẵn kích thước để
 * `ResponsiveContainer` của Recharts chịu vẽ (setup mặc định chỉ có observer câm).
 */
import { act, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import StorageByScopeChart from '@/features/system-config/storage/components/StorageByScopeChart';
import { pickByteUnit } from '@/features/system-config/storage/utils/byte-unit';

const MiB = 1024 * 1024;

class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe = (target: Element) => {
    this.callback(
      [{ target, contentRect: { width: 600, height: 256 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  };
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const original = globalThis.ResizeObserver;

describe('StorageByScopeChart', () => {
  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = SizedResizeObserver;
  });
  afterAll(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = original;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('vẽ một cột mỗi scope có dung lượng, sắp giảm dần, nhãn "20 MB"/"4 MB" và trục đơn vị MB', async () => {
    // Nhãn đỉnh cột chỉ hiện sau khi hoạt ảnh vào của Recharts (~1,5 s) chạy xong. Chờ bằng đồng hồ
    // THẬT thì máy tải nặng (cả bộ test chạy song song) làm rAF/timer trễ tới quá hạn → đỏ chập
    // chờn. Đồng hồ giả (kèm `requestAnimationFrame`/`performance`) tua thẳng qua hoạt ảnh, không
    // phụ thuộc tốc độ máy.
    vi.useFakeTimers();
    const { container } = render(
      <div style={{ width: 600, height: 256 }}>
        <StorageByScopeChart
          data={[
            { key: 'AVATAR', count: 400, bytes: 4 * MiB },
            { key: 'MESSAGE', count: 800, bytes: 20 * MiB },
            { key: 'RECORDING', count: 0, bytes: 0 }, // 0 byte → không có cột
          ]}
        />
      </div>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(container.querySelectorAll('.recharts-label-list text')).toHaveLength(2);
    expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(2);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent ?? '');
    // Trục X: scope lớn nhất trước, có nhãn tiếng Việt; scope 0 byte vắng mặt.
    expect(texts.indexOf('Tin nhắn')).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf('Tin nhắn')).toBeLessThan(texts.indexOf('Ảnh đại diện'));
    expect(texts).not.toContain('Bản ghi');
    // Nhãn đỉnh cột đổi đơn vị theo `formatFileSize`; vạch trục cùng một đơn vị MB.
    expect(texts).toContain('20 MB');
    expect(texts).toContain('4 MB');
    expect(texts.some((t) => /^\d+ MB$/.test(t) && t !== '20 MB' && t !== '4 MB')).toBe(true);
  });

  it('chưa có tệp nào → trạng thái rỗng thay vì biểu đồ trống', () => {
    render(<StorageByScopeChart data={[{ key: 'MESSAGE', count: 0, bytes: 0 }]} />);

    expect(screen.getByText('Chưa có dữ liệu')).toBeInTheDocument();
  });
});

describe('pickByteUnit', () => {
  it('chọn đơn vị theo giá trị lớn nhất', () => {
    expect(pickByteUnit(0)).toEqual({ unit: 'B', divisor: 1 });
    expect(pickByteUnit(900)).toEqual({ unit: 'B', divisor: 1 });
    expect(pickByteUnit(2048)).toEqual({ unit: 'KB', divisor: 1024 });
    expect(pickByteUnit(20 * MiB)).toEqual({ unit: 'MB', divisor: MiB });
    expect(pickByteUnit(3 * 1024 * MiB)).toEqual({ unit: 'GB', divisor: 1024 * MiB });
  });
});
