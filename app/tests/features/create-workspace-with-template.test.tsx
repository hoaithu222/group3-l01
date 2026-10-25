import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { apiClient } from '@/core/api/client';
import { showToast } from '@/shared/utils/toast.utils';
import { useFeature } from '@/shell/capabilities';

import CreateWorkspaceRoute from '../../app/(app)/workspaces/new';

/**
 * Tạo nhóm BẰNG MẪU, nối THẬT từ route `workspaces/new` (app.md p5-04 §3/§4): form `workspaces` + bước mẫu `workspace-templates` ghép qua
 * slot ở tầng route (không import chéo feature) + service thật, chỉ chặn `apiClient`. Kiểm đúng thứ gửi lên máy chủ — body, header
 * `Idempotency-Key`, `skipErrorToast` — và cách app xử lý `TPL_001` (quay về "Không dùng mẫu", tạo nhóm trơn với khoá mới).
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(),
}));
jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

const mockedGet = jest.mocked(apiClient.get);
const mockedPost = jest.mocked(apiClient.post);
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const channel = (key: string, name: string, defaultSelected: boolean) => ({
  defaultSelected,
  description: '',
  key,
  name,
  postingPolicy: 'MEMBERS',
  type: 'TEXT',
  visibility: 'PUBLIC',
});
const TEMPLATES = [
  {
    channels: [
      channel('thong-bao', 'Thông báo', true),
      channel('thao-luan', 'Thảo luận', true),
      channel('tai-lieu', 'Tài liệu', false),
    ],
    code: 'course',
    description: 'Kênh cho một lớp học phần',
    name: 'Nhóm môn học',
  },
];
const envelope = (data: unknown) => ({ data: { data, success: true } }) as never;
const CREATED = { defaultChannel: { id: 'c-0', name: 'Chung' }, workspace: { id: 'ws-new' } };
const tpl404 = () =>
  new AxiosError('HTTP 404', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code: 'TPL_001', message: 'TPL_001' }, success: false },
    headers: {},
    status: 404,
    statusText: '',
  });

async function renderRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <CreateWorkspaceRoute />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Tạo nhóm' }));
const fillName = (name: string) =>
  fireEvent.changeText(screen.getByPlaceholderText('Ví dụ: Nhóm dự án A'), name);
const bodyOf = (i: number) => mockedPost.mock.calls[i]?.[1];
const configOf = (i: number) =>
  mockedPost.mock.calls[i]?.[2] as { headers: Record<string, string>; skipErrorToast: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  mockedGet.mockReset().mockResolvedValue(envelope(TEMPLATES));
  mockedPost.mockReset().mockResolvedValue(envelope(CREATED));
  jest.mocked(useFeature).mockImplementation((flag: string) => flag === 'workspaceTemplates');
});

describe('route workspaces/new — tạo nhóm bằng mẫu', () => {
  it('chọn mẫu + bỏ tick một kênh: POST /workspaces gửi templateCode + channelKeys còn tick, Idempotency-Key, không toast chung', async () => {
    mockedPost.mockResolvedValue(
      envelope({
        ...CREATED,
        template: {
          code: 'course',
          createdChannels: [{ id: '1', key: 'thong-bao', name: 'Thông báo' }],
          skipped: [],
        },
      }),
    );
    await renderRoute();
    await fillName('Nhóm Toán 12');
    await fireEvent.press(await screen.findByText('Nhóm môn học'));
    await fireEvent.press(screen.getByRole('checkbox', { name: /Kênh Thảo luận/ }));

    await submit();

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    expect(mockedPost.mock.calls[0]?.[0]).toBe('/workspaces');
    expect(bodyOf(0)).toEqual({
      channelKeys: ['thong-bao'],
      name: 'Nhóm Toán 12',
      templateCode: 'course',
    });
    expect(configOf(0).headers['Idempotency-Key']).toMatch(/^ws-create-.{8,}/);
    expect(configOf(0).skipErrorToast).toBe(true);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('success', 'Đã tạo 1 kênh theo mẫu.'),
    );
    expect(router.replace).toHaveBeenCalledWith({
      params: { wsId: 'ws-new' },
      pathname: '/workspaces/[wsId]',
    });
  });

  it('không chọn mẫu: body chỉ tên, KHÔNG có templateCode/channelKeys, lỗi vẫn toast chung', async () => {
    await renderRoute();
    await screen.findByText('Nhóm môn học');
    await fillName('Nhóm A');

    await submit();

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({ name: 'Nhóm A' });
    expect(configOf(0).skipErrorToast).toBe(false);
  });

  it('cờ `workspaceTemplates` tắt: KHÔNG gọi /workspace-templates, không có bước mẫu, vẫn tạo được nhóm', async () => {
    jest.mocked(useFeature).mockReturnValue(false);
    await renderRoute();
    await fillName('Nhóm A');

    await submit();

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1));
    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.queryByText('Mẫu nhóm (không bắt buộc)')).toBeNull();
    expect(bodyOf(0)).toEqual({ name: 'Nhóm A' });
  });

  it('BE trả TPL_001: về "Không dùng mẫu" + thông báo + tải lại danh sách mẫu; tạo lại là nhóm trơn với khoá MỚI', async () => {
    mockedPost.mockRejectedValueOnce(tpl404()).mockResolvedValueOnce(envelope(CREATED));
    await renderRoute();
    await fillName('Nhóm A');
    await fireEvent.press(await screen.findByText('Nhóm môn học'));
    expect(screen.getByRole('checkbox', { name: /Kênh Thông báo/ })).toBeChecked();

    await submit();

    expect(await screen.findByText(/Mẫu vừa bị tắt hoặc không còn/)).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));

    await submit();

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(2));
    expect(bodyOf(1)).toEqual({ name: 'Nhóm A' });
    expect(configOf(1).headers['Idempotency-Key']).not.toBe(configOf(0).headers['Idempotency-Key']);
  });
});
