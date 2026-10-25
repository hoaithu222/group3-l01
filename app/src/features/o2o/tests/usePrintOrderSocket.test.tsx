import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { PrintOrderUpdatedPayload, PrintOrderView } from '../api/o2o.types';
import { usePrintOrderSocket } from '../hooks/usePrintOrderSocket';
import { o2oKeys } from '../queries/o2o.keys';
import { readPin, savePin } from '../utils/pin-vault';
import { makeOrder } from './o2o-test-utils';

/**
 * Đồng bộ đơn in theo `print-order:updated` (app.md §4/§8): ghi status/pages/version vào cache, làm mới phần socket không mang (báo giá, dòng thời gian,
 * `myActions`), bỏ tin CŨ hơn bản đang giữ, và XOÁ PIN khỏi SecureStore khi đơn kết thúc (PICKED_UP/CANCELLED/EXPIRED/REJECTED).
 */
let mockHandler: ((payload: PrintOrderUpdatedPayload) => void) | undefined;
jest.mock('@/core/socket', () => ({
  SocketEvent: { PRINT_ORDER_UPDATED: 'print-order:updated' },
  useSocketEvent: (_event: string, handler: (payload: PrintOrderUpdatedPayload) => void) => {
    mockHandler = handler;
  },
}));

function payload(over: Partial<PrintOrderUpdatedPayload> = {}): PrintOrderUpdatedPayload {
  return {
    id: 'ord-1',
    code: 'PO-7K2M9Q',
    status: 'ACCEPTED',
    version: 5,
    pages: 12,
    total: 21_600,
    updatedAt: '2026-09-27T02:00:00.000Z',
    ...over,
  };
}

async function setup(cached?: PrintOrderView) {
  // gcTime vô hạn: mặc định React Query hẹn giờ dọn 5 phút cho mỗi query — giữ tiến trình test sống tới hết hẹn giờ.
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  if (cached) queryClient.setQueryData(o2oKeys.order(cached.id), cached);
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  await renderHook(() => usePrintOrderSocket(), { wrapper });
  return { queryClient, invalidate };
}

const cachedOrder = () => queryOf('ord-1');
let client: QueryClient;
const queryOf = (id: string) => client.getQueryData<PrintOrderView>(o2oKeys.order(id));

beforeEach(() => {
  mockHandler = undefined;
  useAuthStore.setState({ user: { id: 'u1', name: 'Tôi' } as never });
});

describe('usePrintOrderSocket — print-order:updated', () => {
  it('ghi status/pages/version vào cache, ẨN nút thao tác tới khi tải lại (không đoán), và làm mới đơn + danh sách', async () => {
    const setupResult = await setup(makeOrder({ status: 'PENDING', version: 4 }));
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(payload({ status: 'ACCEPTED', version: 5 }));
    });

    expect(cachedOrder()).toMatchObject({
      status: 'ACCEPTED',
      version: 5,
      pages: 12,
      updatedAt: '2026-09-27T02:00:00.000Z',
      // Server tính `myActions`; giữa tin socket và lượt tải lại, app KHÔNG hiện nút nào (tránh "Huỷ đơn" sai lúc đơn vừa sang bước khác).
      myActions: { canEdit: false, canSubmit: false, canCancel: false, canRegeneratePin: false },
    });
    expect(setupResult.invalidate).toHaveBeenCalledWith({ queryKey: o2oKeys.order('ord-1') });
    expect(setupResult.invalidate).toHaveBeenCalledWith({ queryKey: o2oKeys.ordersAll() });
  });

  it('cùng trạng thái (chỉ đổi dữ liệu) thì GIỮ nguyên myActions', async () => {
    const order = makeOrder({ status: 'PENDING', version: 4 });
    const setupResult = await setup(order);
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(payload({ status: 'PENDING', version: 5 }));
    });

    expect(cachedOrder()?.myActions).toEqual(order.myActions);
    expect(cachedOrder()?.version).toBe(5);
  });

  it('tin CŨ hơn bản đang giữ (đến trễ/đảo thứ tự) KHÔNG kéo trạng thái lùi — nhưng vẫn làm mới', async () => {
    const setupResult = await setup(makeOrder({ status: 'PRINTING', version: 7 }));
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(payload({ status: 'ACCEPTED', version: 5 }));
    });

    expect(cachedOrder()).toMatchObject({ status: 'PRINTING', version: 7 });
    expect(setupResult.invalidate).toHaveBeenCalledWith({ queryKey: o2oKeys.order('ord-1') });
  });

  it('đếm trang xong (tin từ job, có pageCountError=null) → màn cấu hình tự sang bước 2', async () => {
    const setupResult = await setup(
      makeOrder({ status: 'DRAFT', pages: null, quote: null, version: 1 }),
    );
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(payload({ status: 'QUOTED', pages: 12, version: 2, pageCountError: null }));
    });

    expect(cachedOrder()).toMatchObject({ status: 'QUOTED', pages: 12, pageCountError: null });
  });

  it('tin của đơn CHƯA có trong cache (chỉ danh sách đang mở) → không tạo bản ghi vụn, chỉ làm mới', async () => {
    const setupResult = await setup();
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(payload({ id: 'ord-9' }));
    });

    expect(queryOf('ord-9')).toBeUndefined();
    expect(setupResult.invalidate).toHaveBeenCalledWith({ queryKey: o2oKeys.order('ord-9') });
  });

  it.each(['PICKED_UP', 'CANCELLED', 'EXPIRED', 'REJECTED'] as const)(
    '%s → PIN bị XOÁ khỏi SecureStore (app.md §8)',
    async (status) => {
      await savePin('u1', 'ord-1', '482913');
      const setupResult = await setup(makeOrder({ status: 'READY', version: 6 }));
      client = setupResult.queryClient;
      expect(await readPin('u1', 'ord-1')).toBe('482913');

      await act(async () => {
        mockHandler?.(payload({ status, version: 7 }));
      });

      await waitFor(async () => expect(await readPin('u1', 'ord-1')).toBeNull());
    },
  );

  it('trạng thái còn hiệu lực (READY) thì PIN được GIỮ', async () => {
    await savePin('u1', 'ord-2', '111222');
    const setupResult = await setup(makeOrder({ id: 'ord-2', status: 'PRINTING', version: 6 }));
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(payload({ id: 'ord-2', status: 'READY', version: 7 }));
    });

    expect(await readPin('u1', 'ord-2')).toBe('111222');
  });

  it('payload rỗng/hỏng → bỏ qua, không ném', async () => {
    const setupResult = await setup(makeOrder());
    client = setupResult.queryClient;

    await act(async () => {
      mockHandler?.(undefined as never);
      mockHandler?.({} as never);
    });

    expect(setupResult.invalidate).not.toHaveBeenCalled();
  });
});
