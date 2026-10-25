/**
 * Cửa sổ chết giữa "xả hàng đợi" và "hạ cờ đang-refresh".
 *
 * ── Lỗi ──────────────────────────────────────────────────────────────────────
 * Interceptor 401 từng viết:
 *
 *     drainQueue(null, token);
 *     return await apiClient(originalRequest);   // ← await NẰM TRONG try
 *   } finally { endRefresh(); }                  // ← chỉ chạy SAU khi replay xong
 *
 * `return await` khiến `finally` đợi cả lượt phát lại request gốc. Trong suốt
 * khoảng đó `refreshing` vẫn là `true` nhưng hàng đợi ĐÃ rỗng. Request nào ăn
 * 401 đúng lúc này sẽ đi vào nhánh `isRefreshInFlight()` → `waitForNewToken()`
 * → nằm trong hàng đợi mà **không bao giờ được xả** → promise treo vĩnh viễn.
 *
 * Vì sao dễ gặp: 5 request bay cùng lúc với token hết hạn thì chúng KHÔNG trả
 * về cùng lúc. Vài cái rơi vào lúc đang refresh (xếp hàng đúng), vài cái rơi
 * vào lúc đang phát lại (treo). Người dùng thấy nút quay vòng mãi; `timeout`
 * của axios không cứu được vì nó chỉ áp cho lời gọi HTTP, không áp cho chuỗi
 * promise của interceptor.
 *
 * Chỉ đường THÀNH CÔNG mới treo — nhánh `catch` có gọi `drainQueue`. Tức là
 * đúng ca phổ biến nhất.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/api/session', () => ({
  refreshSession: vi.fn(async () => ({ status: 'ok', token: 'token-moi' })),
  purgeAuthSession: vi.fn(),
  getAccessToken: () => null,
}));

const { beginRefresh, drainQueue, endRefresh, isRefreshInFlight, waitForNewToken } =
  await import('@/core/api/client.refresh');

/** Chờ có giới hạn — promise treo sẽ thua cuộc đua và trả về `'treo'`. */
function raceWithTimeout<T>(p: Promise<T>, ms = 50): Promise<T | 'treo'> {
  return Promise.race([p, new Promise<'treo'>((r) => setTimeout(() => r('treo'), ms))]);
}

describe('cờ đang-refresh phải hạ CÙNG NHỊP với lúc xả hàng đợi', () => {
  beforeEach(() => {
    endRefresh();
    drainQueue(null, 'dọn'); // dọn sạch hàng đợi còn sót từ ca trước
  });

  it('sau khi xả hàng đợi, KHÔNG được còn ở trạng thái đang-refresh', () => {
    beginRefresh();
    const waiter = raceWithTimeout(waitForNewToken());
    drainQueue(null, 'token-moi');
    endRefresh();

    // Bất biến: hàng đợi rỗng ⇒ không ai được phép xếp thêm vào nữa.
    expect(isRefreshInFlight()).toBe(false);
    return expect(waiter).resolves.toBe('token-moi');
  });

  it('⛔ request tới SAU khi xả mà cờ vẫn bật thì treo vĩnh viễn', async () => {
    beginRefresh();
    drainQueue(null, 'token-moi');

    // Mô phỏng đúng cửa sổ cũ: cờ CHƯA hạ (vì `finally` còn đợi replay).
    // Interceptor sẽ đẩy request này vào hàng đợi — và không ai xả nữa.
    const muon = raceWithTimeout(waitForNewToken());
    expect(await muon).toBe('treo');

    // Đây chính là lý do `endRefresh()` phải đứng ngay sau `drainQueue()`,
    // và lượt phát lại request gốc phải nằm NGOÀI vùng tới hạn.
    endRefresh();
    expect(isRefreshInFlight()).toBe(false);
  });
});
