import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { apiClient } from '@/core/api';
import { capabilitiesService, type Capabilities } from '@/core/capabilities';
import { readJson, writeJson } from '@/core/storage/app-storage';
import { CAPABILITIES_QUERY_KEY, useCapabilities } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';
import { useClockOffsetStore } from '@/shell/store/slices/clock';

/**
 * p0-07 (CFG-11): `GET /capabilities` gửi `If-None-Match` từ ETag đã lưu; 304 trả bản đang giữ (không ghi lại); 200 ghi
 * bản mới + ETag mới + độ lệch đồng hồ. Mock ở `apiClient.get` để đi qua `unwrapData` thật.
 */

jest.mock('@/core/api', () => {
  const actual = jest.requireActual('@/core/api');
  return { ...actual, apiClient: { ...actual.apiClient, get: jest.fn() } };
});
// Ép `authEnabled` như `capabilities.test.tsx`: chạy thẳng `jest` thì biến `.env` không được nạp.
jest.mock('@/core/config/env.config', () => {
  const actual = jest.requireActual('@/core/config/env.config');
  return { ...actual, appConfig: { ...actual.appConfig, authEnabled: true } };
});

const mockedGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;

const CAPS = {
  configVersion: 'cfg-1',
  features: { communication: { available: true, enabled: true } },
  limits: {},
  serverNow: '2026-09-21T10:00:00.000Z',
  upload: { allowedMime: [], maxFileBytes: 1, signedUrlTtlSeconds: 60 },
  version: '1.0.0',
} as unknown as Capabilities;

const ok = (data: Capabilities, etag?: string) => ({
  data: { data, message: 'ok', success: true },
  headers: etag ? { etag } : {},
  status: 200,
});
const notModified = { data: undefined, headers: {}, status: 304 };

describe('capabilitiesService.fetch', () => {
  it('có etag → gửi If-None-Match; 304 → notModified (không body)', async () => {
    mockedGet.mockResolvedValueOnce(notModified as never);
    await expect(capabilitiesService.fetch('"abc"')).resolves.toEqual({ notModified: true });

    const config = mockedGet.mock.calls.at(-1)?.[1];
    expect(config?.headers).toEqual({ 'If-None-Match': '"abc"' });
    // Phải nhận 304 là thành công — nếu không axios ném lỗi và app hiện toast "lỗi" mỗi lần làm mới.
    expect(config?.validateStatus?.(304)).toBe(true);
    expect(config?.validateStatus?.(500)).toBe(false);
  });

  it('200 → dữ liệu + ETag từ header; không etag → không gửi header điều kiện', async () => {
    mockedGet.mockResolvedValueOnce(ok(CAPS, '"v2"') as never);
    await expect(capabilitiesService.fetch(null)).resolves.toEqual({
      data: CAPS,
      etag: '"v2"',
      notModified: false,
    });
    expect(mockedGet.mock.calls.at(-1)?.[1]?.headers).toBeUndefined();
  });
});

describe('useCapabilities — tải có điều kiện', () => {
  const clients: QueryClient[] = [];

  // `useCapabilities` tự đặt gcTime 24 giờ → timer treo khiến Jest không thoát. Phải gỡ hook TRƯỚC rồi mới `clear()`: gỡ
  // observer sau khi đã xoá query sẽ đặt lại timer gc.
  afterEach(async () => {
    await cleanup();
    clients.splice(0).forEach((client) => client.clear());
  });

  function setup(preloaded?: Capabilities) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    clients.push(queryClient);
    if (preloaded) queryClient.setQueryData(CAPABILITIES_QUERY_KEY, preloaded, { updatedAt: 0 });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return { queryClient, wrapper };
  }

  beforeEach(async () => {
    mockedGet.mockReset();
    useAuthStore.setState({ status: 'authenticated' });
    useClockOffsetStore.setState({ offsetMs: null });
    await writeJson('capabilities.etag', null);
  });

  it('304 → trả NGUYÊN bản đang giữ (cache offline mồi lúc khởi động), không ghi lại', async () => {
    await writeJson('capabilities.etag', '"cfg-1"');
    mockedGet.mockResolvedValue(notModified as never);
    const { queryClient, wrapper } = setup(CAPS);

    const { result } = await renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
    expect(mockedGet.mock.calls[0]?.[1]?.headers).toEqual({ 'If-None-Match': '"cfg-1"' });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(queryClient.getQueryData(CAPABILITIES_QUERY_KEY)).toBe(CAPS);
  });

  it('200 → ghi bản mới + ETag mới vào AsyncStorage và cập nhật độ lệch đồng hồ', async () => {
    mockedGet.mockResolvedValue(ok(CAPS, '"cfg-2"') as never);
    const { wrapper } = setup();

    await renderHook(() => useCapabilities(), { wrapper });

    await waitFor(async () => expect(await readJson<string>('capabilities.etag')).toBe('"cfg-2"'));
    expect((await readJson<Capabilities>('capabilities.last'))?.configVersion).toBe('cfg-1');
    expect(useClockOffsetStore.getState().offsetMs).not.toBeNull();
    // Lần đầu (chưa có bản trong bộ nhớ) KHÔNG gửi If-None-Match dù có etag rơi rớt trong kho.
    expect(mockedGet.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it('304 bất ngờ khi CHƯA có bản nào (lớp mạng tự chèn điều kiện) → tải lại KHÔNG điều kiện, không kẹt không dữ liệu', async () => {
    mockedGet
      .mockResolvedValueOnce(notModified as never)
      .mockResolvedValue(ok(CAPS, '"cfg-3"') as never);
    const { queryClient, wrapper } = setup();

    await renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryClient.getQueryData(CAPABILITIES_QUERY_KEY)).toEqual(CAPS));
  });
});
