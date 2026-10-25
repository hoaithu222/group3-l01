import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { whiteboardCollabService } from '../api/whiteboard-collab.service';
import { whiteboardService } from '../api/whiteboard.service';
import type { Collaborator, MemberOption } from '../api/whiteboard.types';
import {
  AddCollaboratorSheet,
  type AddCollaboratorSheetProps,
} from '../components/AddCollaboratorSheet';
import { apiError, renderWithProviders, WB_ID, WS_ID } from './wb.harness';

jest.mock('../api/whiteboard.service', () => ({
  whiteboardService: { memberOptions: jest.fn() },
}));
jest.mock('../api/whiteboard-collab.service', () => ({
  whiteboardCollabService: { addCollaborators: jest.fn() },
}));

const memberOptions = jest.mocked(whiteboardService.memberOptions);
const addCollaborators = jest.mocked(whiteboardCollabService.addCollaborators);

const member = (userId: string, name: string): MemberOption => ({ name, role: 'MEMBER', userId });
const collaborator = (userId: string, name: string): Collaborator => ({
  addedAt: '2026-09-27T00:00:00.000Z',
  name,
  role: 'EDITOR',
  userId,
});

function makeProps(over: Partial<AddCollaboratorSheetProps> = {}): AddCollaboratorSheetProps {
  return { existing: [], onClose: jest.fn(), visible: true, wbId: WB_ID, wsId: WS_ID, ...over };
}

/** Hàng thành viên là `ListItem` bấm được: tên trợ năng = tên người (thêm lý do khoá khi chạm trần). */
const row = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  memberOptions.mockReset();
  addCollaborators.mockReset();
});

describe('AddCollaboratorSheet', () => {
  it('ẩn người đã cộng tác; nhóm quyền có tiêu đề; chọn hai người + "Chỉ xem" rồi gửi đúng danh sách và vai', async () => {
    memberOptions.mockResolvedValue([
      member('u1', 'An'),
      member('u2', 'Bình'),
      member('u3', 'Chi'),
    ]);
    addCollaborators.mockResolvedValue([]);
    const props = makeProps({ existing: [collaborator('u3', 'Chi')] });
    await renderWithProviders(<AddCollaboratorSheet {...props} />);

    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(screen.queryByText('Chi')).toBeNull();
    // Vai CHUNG cho lượt mời có tiêu đề riêng (không trông như bộ lọc danh sách); mặc định "Được vẽ".
    expect(screen.getByText('Quyền cho người được thêm')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Được vẽ' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Chọn người để thêm' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Chỉ xem' }));
    await fireEvent.press(row('An'));
    await fireEvent.press(row('Bình'));
    expect(row('An')).toBeSelected();
    expect(row('Bình')).toBeSelected();

    await fireEvent.press(screen.getByRole('button', { name: 'Thêm 2 người' }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(addCollaborators).toHaveBeenCalledWith(WB_ID, ['u1', 'u2'], 'VIEWER');
  });

  it('chạm lại một hàng đã chọn thì bỏ chọn', async () => {
    memberOptions.mockResolvedValue([member('u1', 'An'), member('u2', 'Bình')]);
    await renderWithProviders(<AddCollaboratorSheet {...makeProps()} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'An' }));
    expect(screen.getByRole('button', { name: 'Thêm 1 người' })).toBeOnTheScreen();
    await fireEvent.press(row('An'));
    expect(row('An')).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Chọn người để thêm' })).toBeDisabled();
  });

  it('chạm trần 20 người: hàng CHƯA chọn khoá kèm lý do, hàng đã chọn vẫn bỏ chọn được', async () => {
    const people = Array.from({ length: 21 }, (_, i) =>
      member(`u${String(i)}`, `Người ${String(i)}`),
    );
    memberOptions.mockResolvedValue(people);
    await renderWithProviders(<AddCollaboratorSheet {...makeProps()} />);
    await screen.findByText('Người 0');

    for (const person of people.slice(0, 20)) await fireEvent.press(row(person.name));

    const last = row(/^Người 20/);
    expect(last).toBeDisabled();
    expect(screen.getByText('Đã chọn đủ 20 người')).toBeOnTheScreen();
    await fireEvent.press(last);
    expect(screen.getByRole('button', { name: 'Thêm 20 người' })).toBeOnTheScreen();

    await fireEvent.press(row('Người 0'));
    expect(row('Người 20')).toBeEnabled();
    expect(screen.queryByText('Đã chọn đủ 20 người')).toBeNull();
  });

  it('lỗi gửi (đủ người cộng tác) hiện ở khối cảnh báo, tấm vẫn mở để thử lại', async () => {
    memberOptions.mockResolvedValue([member('u1', 'An')]);
    addCollaborators.mockRejectedValue(apiError(409, 'WB_004'));
    const props = makeProps();
    await renderWithProviders(<AddCollaboratorSheet {...props} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'An' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Thêm 1 người' }));

    expect(await screen.findByText('Bảng trắng đã đủ số người cộng tác tối đa.')).toBeOnTheScreen();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('tải danh sách lỗi: nói lý do + "Thử lại" tải lại được', async () => {
    memberOptions
      .mockRejectedValueOnce(apiError(404, 'CFG_005'))
      .mockResolvedValue([member('u1', 'An')]);
    await renderWithProviders(<AddCollaboratorSheet {...makeProps()} />);

    expect(await screen.findByText('Tính năng bảng trắng cộng tác đang tắt.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('An')).toBeOnTheScreen();
    expect(memberOptions).toHaveBeenCalledTimes(2);
  });

  it('không còn ai để mời: báo rõ thay cho danh sách trống', async () => {
    memberOptions.mockResolvedValue([member('u1', 'An')]);
    await renderWithProviders(
      <AddCollaboratorSheet {...makeProps({ existing: [collaborator('u1', 'An')] })} />,
    );

    expect(await screen.findByText('Không còn thành viên nào để thêm.')).toBeOnTheScreen();
  });
});
