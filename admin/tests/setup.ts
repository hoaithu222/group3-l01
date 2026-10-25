/**
 * Vitest setup — chạy 1 lần trước mỗi test file.
 * - Extend matchers từ @testing-library/jest-dom (toBeInTheDocument, ...)
 * - Mock matchMedia (jsdom không có)
 * - Mock ResizeObserver / IntersectionObserver cho Radix UI
 * - Cleanup DOM giữa các test
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

/**
 * IntersectionObserver giả — báo NGAY là "đã vào tầm nhìn".
 *
 * ⛔ ĐỪNG rút gọn lại thành `observe = vi.fn()` rỗng.
 *
 * jsdom không dựng layout nên KHÔNG phần tử nào từng giao với khung nhìn. Một
 * observer giả im lặng vì thế biến mọi component render-lười thành không kiểm
 * được: nó không bao giờ nhận tín hiệu, không bao giờ gắn nội dung — mà bài
 * kiểm vẫn XANH, vì cái khung rỗng vẫn nằm trong DOM.
 *
 * Đã dính đúng bẫy đó: trang thư viện giao diện hoãn gắn ruột từng khu vực tới
 * khi sắp vào tầm nhìn, và 15/16 khu vực im lặng rỗng trong test mà không có gì
 * đỏ. Trong test, "thấy hết" mới là mặc định đúng.
 */
class MockIntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = (target: Element): void => {
    this.callback(
      [{ isIntersecting: true, target, intersectionRatio: 1 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  };

  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}

(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;
(
  globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }
).IntersectionObserver = MockIntersectionObserver;

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

/**
 * localStorage / sessionStorage cho zustand `persist`.
 *
 * jsdom ở môi trường này CÓ đối tượng `localStorage` nhưng KHÔNG có `setItem`
 * (kiểm bằng `typeof localStorage.setItem` → `"undefined"`). Store nào dùng
 * `persist` sẽ ném `storage.setItem is not a function` ngay lần `setState` đầu
 * tiên — lỗi đến từ môi trường test, không phải từ store.
 *
 * Chỉ vá khi THIẾU: jsdom bản khác có sẵn thì giữ nguyên bản thật.
 */
function installMemoryStorage(key: 'localStorage' | 'sessionStorage'): void {
  const existing = (globalThis as Record<string, unknown>)[key] as Storage | undefined;
  if (existing && typeof existing.setItem === 'function') return;

  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: memoryStorage,
  });
}

installMemoryStorage('localStorage');
installMemoryStorage('sessionStorage');

if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}
