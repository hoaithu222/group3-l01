import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { chatKeys, type MessagesData } from '@/features/chat';
import { makeData, makeMessage } from '@/features/chat/cache/apply-socket-event.fixtures';
import { useConnectionState } from '@/core/socket';

import { conversionService } from '../api/conversion.service';
import { ConvertToTaskSheet } from '../components/convert/ConvertToTaskSheet';
import { apiError, flushQuery, makeQueryClient, renderWithProviders, SCOPE } from './fixtures';

/**
 * `ConvertToTaskSheet` (app.md §3): chọn bảng/cột, tiêu đề mặc định 80 ký tự đầu, "Kèm trích dẫn"; `Idempotency-Key`; `WORKSPACE_MISMATCH` giải thích bằng lời; xong → "Mở" + chip `sourceRefs`.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }), useFeature: () => true }));
jest.mock('../api/conversion.service', () => ({
  conversionService: { listBoards: jest.fn(), listWorkspaces: jest.fn(), toTask: jest.fn() },
}));

const service = jest.mocked(conversionService);
const BOARDS = [
  { columns: [{ id: 'c1', title: 'Cần làm' }, { id: 'c2', title: 'Đang làm' }], id: 'b-1', name: 'Bảng Web' },
  { columns: [{ id: 'c9', title: 'Ý tưởng' }], id: 'b-2', name: 'Bảng Mobile' },
];
const RESULT = { sourceRef: { kind: 'TASK' as const, refId: 't-1' }, task: { boardId: 'b-1', id: 't-1', title: 'Sửa lỗi đăng nhập' } };

async function renderSheet(source = { content: 'Sửa lỗi đăng nhập giúp mình nhé\nchi tiết ở dưới', messageId: 'm-1', workspaceId: 'ws-1' as string | undefined }) {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(chatKeys.messages(SCOPE), makeData([{ data: [makeMessage({ id: 'm-1' })] }]));
  const onClose = jest.fn();
  await renderWithProviders(<ConvertToTaskSheet scope={SCOPE} source={source} visible onClose={onClose} />, queryClient);
  return { onClose, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useConnectionState).mockReturnValue('connected');
  service.listBoards.mockResolvedValue(BOARDS);
  service.listWorkspaces.mockResolvedValue([{ id: 'ws-1', name: 'Nhóm A' }, { id: 'ws-2', name: 'Nhóm B' }]);
  service.toTask.mockResolvedValue(RESULT);
});

describe('ConvertToTaskSheet', () => {
  it('kênh (nhóm cố định): KHÔNG hỏi nhóm; bảng của nhóm đó; tiêu đề mặc định = dòng đầu của tin', async () => {
    await renderSheet();

    expect(await screen.findByText('Bảng Web')).toBeOnTheScreen();
    expect(service.listWorkspaces).not.toHaveBeenCalled();
    expect(service.listBoards).toHaveBeenCalledWith('ws-1');
    expect(screen.getByDisplayValue('Sửa lỗi đăng nhập giúp mình nhé')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tạo công việc'));
    expect(service.toTask).not.toHaveBeenCalled(); // chưa chọn bảng → nút khoá
    await flushQuery();
  });

  it('chọn bảng → hiện cột (mặc định "Cột đầu tiên"); tạo → POST kèm Idempotency-Key và dữ liệu đã chọn', async () => {
    const { queryClient } = await renderSheet();
    await fireEvent.press(await screen.findByText('Bảng Web'));
    await fireEvent.press(screen.getByRole('radio', { name: 'Đang làm' }));

    await fireEvent.press(screen.getByText('Tạo công việc'));

    await waitFor(() => expect(service.toTask).toHaveBeenCalledTimes(1));
    const [messageId, input, key] = service.toTask.mock.calls[0]!;
    expect(messageId).toBe('m-1');
    expect(input).toEqual({ boardId: 'b-1', columnId: 'c2', includeQuote: true, title: 'Sửa lỗi đăng nhập giúp mình nhé' });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    // xong: chip nguồn được gắn vào tin trong cache + màn kết quả có "Mở công việc"
    expect(await screen.findByText(/Đã tạo công việc/)).toBeOnTheScreen();
    const data = queryClient.getQueryData<MessagesData>(chatKeys.messages(SCOPE));
    expect(data?.pages[0]?.data[0]?.sourceRefs).toEqual([expect.objectContaining({ kind: 'TASK', refId: 't-1' })]);
    await flushQuery();
  });

  it('"Mở công việc" đi tới thẻ vừa tạo (route của boards) và đóng tấm', async () => {
    const { onClose } = await renderSheet();
    await fireEvent.press(await screen.findByText('Bảng Web'));
    await fireEvent.press(screen.getByText('Tạo công việc'));

    await fireEvent.press(await screen.findByText('Mở công việc'));

    expect(onClose).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      params: { boardId: 'b-1', taskId: 't-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
    await flushQuery();
  });

  it('WORKSPACE_MISMATCH → giải thích bằng lời, tấm Ở LẠI để chọn lại bảng', async () => {
    service.toTask.mockRejectedValue(apiError(400, 'VAL_001', { reason: 'WORKSPACE_MISMATCH' }));
    await renderSheet();
    await fireEvent.press(await screen.findByText('Bảng Web'));

    await fireEvent.press(screen.getByText('Tạo công việc'));

    expect(await screen.findByText(/không thuộc cùng nhóm với tin nhắn/)).toBeOnTheScreen();
    expect(screen.getByText('Tạo công việc')).toBeOnTheScreen();
    await flushQuery();
  });

  it('hội thoại (không thuộc nhóm nào): hỏi NHÓM trước, rồi mới hiện bảng của nhóm đã chọn', async () => {
    await renderSheet({ content: 'Việc riêng', messageId: 'm-1', workspaceId: undefined });

    await fireEvent.press(await screen.findByText('Nhóm B'));

    await waitFor(() => expect(service.listBoards).toHaveBeenCalledWith('ws-2'));
    expect(await screen.findByText('Bảng Web')).toBeOnTheScreen();
    await flushQuery();
  });

  it('nhóm không có bảng nào → nói rõ; tiêu đề trống → nút tạo khoá', async () => {
    service.listBoards.mockResolvedValue([]);
    await renderSheet({ content: '', messageId: 'm-1', workspaceId: 'ws-1' });

    expect(await screen.findByText('Không có bảng nào bạn được tạo công việc')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Tạo công việc'));
    expect(service.toTask).not.toHaveBeenCalled();
  });
});
