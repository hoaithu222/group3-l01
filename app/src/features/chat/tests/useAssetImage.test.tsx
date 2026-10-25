import { act, renderHook } from '@testing-library/react-native';

import { useAssetImage } from '../hooks/useAssetImage';

/**
 * `expo-image` gặp URL hỏng thì vẽ TRONG SUỐT và im lặng; URL ký chỉ sống ≤ 60 s nên 403 là chuyện thường. `useAssetImage`
 * là nơi làm đúng hợp đồng của `useAssetUrl`: lỗi lần đầu ⇒ xin URL mới MỘT lần (người dùng không thấy gì), lỗi tiếp ⇒ `failed`
 * kèm lối thử lại — không lặp vô hạn, và không kẹt ở "hỏng" khi URL mới về.
 */

const mockRefetch = jest.fn();
const mockAssetUrl = {
  data: { url: 'https://cdn.example/a?sig=1' } as { url: string } | undefined,
  isError: false,
  isLoading: false,
  refetch: mockRefetch,
};
jest.mock('@/core/uploads/use-asset-url', () => ({ useAssetUrl: () => mockAssetUrl }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAssetUrl.data = { url: 'https://cdn.example/a?sig=1' };
  mockAssetUrl.isError = false;
  mockAssetUrl.isLoading = false;
});

describe('useAssetImage — trạng thái', () => {
  it('đang tải URL ⇒ loading', async () => {
    mockAssetUrl.data = undefined;
    mockAssetUrl.isLoading = true;

    const { result } = await renderHook(() => useAssetImage('asset-1'));

    expect(result.current.state).toBe('loading');
  });

  it('có URL ⇒ ready kèm url', async () => {
    const { result } = await renderHook(() => useAssetImage('asset-1'));

    expect(result.current).toMatchObject({ state: 'ready', url: 'https://cdn.example/a?sig=1' });
  });

  it('xin URL lỗi ⇒ failed', async () => {
    mockAssetUrl.data = undefined;
    mockAssetUrl.isError = true;

    const { result } = await renderHook(() => useAssetImage('asset-1'));

    expect(result.current.state).toBe('failed');
  });
});

describe('useAssetImage — ảnh không vẽ được', () => {
  it('lỗi LẦN ĐẦU ⇒ tự xin URL mới, vẫn ready (người dùng không thấy ô lỗi)', async () => {
    const { result } = await renderHook(() => useAssetImage('asset-1'));

    await act(async () => result.current.onImageError());

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('ready');
  });

  it('lỗi LẦN HAI ⇒ failed, KHÔNG xin thêm (không thử vô hạn)', async () => {
    const { result } = await renderHook(() => useAssetImage('asset-1'));

    await act(async () => result.current.onImageError());
    await act(async () => result.current.onImageError());

    expect(result.current.state).toBe('failed');
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('`retry` xin URL mới và bỏ trạng thái hỏng của URL cũ', async () => {
    const { result } = await renderHook(() => useAssetImage('asset-1'));
    await act(async () => result.current.onImageError());
    await act(async () => result.current.onImageError());
    expect(result.current.state).toBe('failed');

    await act(async () => result.current.retry());

    expect(mockRefetch).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('ready');
  });

  it('URL MỚI về sau khi hỏng ⇒ ready lại (nhớ URL hỏng, không phải một cờ kẹt mãi)', async () => {
    const { rerender, result } = await renderHook(() => useAssetImage('asset-1'));
    await act(async () => result.current.onImageError());
    await act(async () => result.current.onImageError());
    expect(result.current.state).toBe('failed');

    mockAssetUrl.data = { url: 'https://cdn.example/a?sig=2' };
    await rerender({});

    expect(result.current).toMatchObject({ state: 'ready', url: 'https://cdn.example/a?sig=2' });
  });
});
