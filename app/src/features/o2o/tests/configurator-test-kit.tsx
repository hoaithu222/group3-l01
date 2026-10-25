import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';
import { useNetworkStatus } from '@/shared/hooks/use-network-status';

import type { PrintOrderView } from '../api/o2o.types';
import { printService } from '../api/print.service';
import { usePrintUpload } from '../hooks/usePrintUpload';
import { o2oKeys } from '../queries/o2o.keys';
import { makeOrder, makeQuote, makeShop } from './o2o-test-utils';

/**
 * Đồ dùng chung của các test màn cấu hình đơn in (`PrintOrderConfigurator.*.test.tsx`). KHÔNG phải test.
 * ⚠️ `jest.mock(...)` KHÔNG đặt ở đây được (hoist theo từng file test) — mỗi file test tự khai bộ mock giống nhau, còn ở đây chỉ có dữ liệu + trợ giúp.
 */
export const service = jest.mocked(printService);
export const params = jest.mocked(useLocalSearchParams);
export const network = jest.mocked(useNetworkStatus);
export const upload = jest.mocked(usePrintUpload);

export const COUNTING = makeOrder({
  status: 'DRAFT',
  pages: null,
  quote: null,
  hasPin: false,
  events: [{ status: 'DRAFT', at: '2026-09-27T00:50:00.000Z', note: null }],
  submittedAt: null,
  myActions: { canEdit: true, canSubmit: false, canCancel: true, canRegeneratePin: false },
});
export const COUNTED = makeOrder({
  ...COUNTING,
  status: 'QUOTED',
  pages: 12,
  quote: makeQuote(),
  version: 3,
  myActions: { canEdit: true, canSubmit: true, canCancel: true, canRegeneratePin: false },
});

export function idleUpload(over: Partial<ReturnType<typeof usePrintUpload>> = {}) {
  upload.mockReturnValue({
    item: undefined,
    assetId: undefined,
    uploading: false,
    failed: false,
    problem: null,
    pick: jest.fn(),
    remove: jest.fn(),
    retry: jest.fn(),
    ...over,
  } as ReturnType<typeof usePrintUpload>);
}

/** Đưa đơn sang trạng thái "đã đếm xong trang" như tin socket `print-order:updated` + lượt tải lại. */
export async function countingDone(
  queryClient: { setQueryData: (key: readonly unknown[], data: unknown) => void },
  order: PrintOrderView = COUNTED,
) {
  await act(async () => {
    queryClient.setQueryData(o2oKeys.order(order.id), order);
  });
}

/** Nút Gửi khoá tới khi báo giá theo cấu hình MỚI chốt (debounce 400 ms + lượt tải) — bấm nút đang khoá là không có gì xảy ra, nên chờ mở khoá. */
export async function pressSend(name: RegExp | string = /Gửi đơn/) {
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name }));
}

/** Đặt lại mọi mock về trạng thái "đơn nháp vừa tạo từ Resource Hub, chưa đếm trang" — gọi ở `beforeEach` của từng file test. */
export function resetConfiguratorMocks() {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u1', name: 'Tôi' } as never });
  network.mockReturnValue({ isOnline: true } as ReturnType<typeof useNetworkStatus>);
  params.mockReturnValue({
    shopId: 'shop-1',
    resourceId: 'res-1',
    resourceName: 'Slide tuần 3.pdf',
    locationName: 'In nhanh Bách Khoa',
  });
  idleUpload();
  service.shop.mockResolvedValue(makeShop());
  service.create.mockResolvedValue(COUNTING);
  service.get.mockResolvedValue(COUNTING);
  service.quote.mockResolvedValue(makeQuote());
}
