import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import type { TemplateSelection } from '@/shared/workspace-templates';
import { useFeature } from '@/shell/capabilities';

import { workspaceTemplatesService } from '../api/workspace-templates.service';
import { WorkspaceTemplateStep } from '../components/WorkspaceTemplateStep';
import { renderWithProviders, TEMPLATES } from './fixtures';

/**
 * Bước CHỌN MẪU của form tạo nhóm (app.md p5-04 §3 "Tạo nhóm – bước mẫu"). Là bước PHỤ: cờ tắt/chưa biết hoặc chưa có mẫu ⇒ không hiện gì
 * (và không bắn request); tải lỗi ⇒ báo + "Thử lại" mà vẫn tạo được nhóm không mẫu; mẫu đang chọn biến mất khỏi danh sách ⇒ về "Không dùng mẫu".
 */

jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../api/workspace-templates.service', () => ({
  workspaceTemplatesService: { list: jest.fn() },
}));

const mockedList = jest.mocked(workspaceTemplatesService.list);
const changes: (TemplateSelection | null)[] = [];

function Host({
  initial = null,
  refreshToken = 0,
}: {
  initial?: TemplateSelection | null;
  refreshToken?: number;
}) {
  const [value, setValue] = useState<TemplateSelection | null>(initial);
  return (
    <WorkspaceTemplateStep
      disabled={false}
      refreshToken={refreshToken}
      value={value}
      onChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  changes.length = 0;
  mockedList.mockReset().mockResolvedValue(TEMPLATES);
  jest.mocked(useFeature).mockReturnValue(true);
});

describe('WorkspaceTemplateStep', () => {
  it('cờ `workspaceTemplates` TẮT hoặc CHƯA biết: không hiện gì và KHÔNG gọi API', async () => {
    for (const flag of [false, undefined]) {
      jest.mocked(useFeature).mockReturnValue(flag);
      const view = await renderWithProviders(<Host />);

      expect(screen.queryByText('Mẫu nhóm (không bắt buộc)')).toBeNull();
      expect(screen.queryByText('Không dùng mẫu')).toBeNull();
      await view.unmount();
    }
    expect(mockedList).not.toHaveBeenCalled();
    expect(jest.mocked(useFeature)).toHaveBeenCalledWith('workspaceTemplates');
  });

  it('cờ bật: tiêu đề + "Không dùng mẫu" + ba mẫu; chọn mẫu ⇒ kênh defaultSelected được tick', async () => {
    await renderWithProviders(<Host />);

    expect(await screen.findByText('Mẫu nhóm (không bắt buộc)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Đồ án'));

    expect(changes).toEqual([{ channelKeys: ['tien-do'], code: 'capstone' }]);
    expect(screen.getByRole('checkbox', { name: /Kênh Tiến độ/ })).toBeChecked();
  });

  it('chưa có mẫu nào đang bật: không hiện gì (đừng vẽ khối rỗng)', async () => {
    mockedList.mockResolvedValue([]);
    const { queryClient } = await renderWithProviders(<Host />);

    // Chờ lượt tải XONG (không còn khung chờ) rồi mới kết luận "không hiện gì".
    await waitFor(() =>
      expect(queryClient.getQueryState(['workspace-templates', 'list'])?.status).toBe('success'),
    );
    expect(screen.queryByText('Mẫu nhóm (không bắt buộc)')).toBeNull();
    expect(screen.queryByText('Không dùng mẫu')).toBeNull();
  });

  it('tải lỗi: báo bằng một khối cảnh báo + "Thử lại"; người dùng vẫn tạo được nhóm không mẫu', async () => {
    mockedList.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(TEMPLATES);
    await renderWithProviders(<Host />);

    expect(
      await screen.findByText('Không tải được mẫu nhóm. Bạn vẫn có thể tạo nhóm không dùng mẫu.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Nhóm môn học')).toBeOnTheScreen();
  });

  it('mẫu đang chọn không còn trong danh sách vừa tải (admin vừa tắt): tự về "Không dùng mẫu"', async () => {
    await renderWithProviders(<Host initial={{ channelKeys: ['x'], code: 'da-tat' }} />);

    await waitFor(() => expect(changes).toEqual([null]));
  });

  it('refreshToken tăng (BE vừa từ chối mẫu): tải LẠI danh sách để mẫu đã tắt biến mất', async () => {
    const view = await renderWithProviders(<Host refreshToken={0} />);
    await screen.findByText('Nhóm môn học');
    expect(mockedList).toHaveBeenCalledTimes(1);

    mockedList.mockResolvedValue(TEMPLATES.slice(1));
    await view.rerender(<Host refreshToken={1} />);

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Nhóm môn học')).toBeNull());
  });
});
