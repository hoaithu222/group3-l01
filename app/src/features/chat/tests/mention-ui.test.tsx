import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { render, userEvent } from '@testing-library/react-native';

import { MentionAllConfirmDialog } from '../mentions/MentionAllConfirmDialog';
import { MentionChipText } from '../mentions/MentionChipText';
import { MentionPickerSheet } from '../mentions/MentionPickerSheet';
import {
  MentionRenderContext,
  type MentionRenderContextValue,
} from '../mentions/mention-render.context';

const MINH = '507f1f77bcf86cd799439011';
const ME = '507f1f77bcf86cd799439099';

function withContext(value: MentionRenderContextValue, children: ReactNode) {
  return (
    <MentionRenderContext.Provider value={value}>
      <Text>{children}</Text>
    </MentionRenderContext.Provider>
  );
}

describe('MentionPickerSheet', () => {
  const users = [
    { userId: 'u1', name: 'Minh Tú', avatarUrl: null },
    { userId: 'u2', name: 'An', avatarUrl: null },
  ];

  it('hiện "@Tất cả (N người)" CHỈ khi canMentionAll, và gọi đúng callback', async () => {
    const onPickAll = jest.fn();
    const screen = await render(
      <MentionPickerSheet
        loading={false}
        result={{ users, canMentionAll: true, allCount: 57 }}
        onPickAll={onPickAll}
        onPickUser={jest.fn()}
      />,
    );
    await userEvent.press(screen.getByText('@Tất cả (57 người)'));
    expect(onPickAll).toHaveBeenCalledTimes(1);
  });

  it('không có quyền @all thì không có mục "@Tất cả"', async () => {
    const screen = await render(
      <MentionPickerSheet
        loading={false}
        result={{ users, canMentionAll: false }}
        onPickAll={jest.fn()}
        onPickUser={jest.fn()}
      />,
    );
    expect(screen.queryByText(/Tất cả/)).toBeNull();
    expect(screen.getByText('Minh Tú')).toBeOnTheScreen();
  });

  it('chọn một người trả về đúng user (không lộ email — kiểu dữ liệu không có trường email)', async () => {
    const onPickUser = jest.fn();
    const screen = await render(
      <MentionPickerSheet
        loading={false}
        result={{ users, canMentionAll: false }}
        onPickAll={jest.fn()}
        onPickUser={onPickUser}
      />,
    );
    await userEvent.press(screen.getByText('An'));
    expect(onPickUser).toHaveBeenCalledWith(users[1]);
  });

  it('không có ai → câu rỗng; đang tải thì KHÔNG hiện câu rỗng', async () => {
    const empty = await render(
      <MentionPickerSheet
        loading={false}
        result={{ users: [], canMentionAll: false }}
        onPickAll={jest.fn()}
        onPickUser={jest.fn()}
      />,
    );
    expect(empty.getByText('Không tìm thấy người trong cuộc trò chuyện')).toBeOnTheScreen();

    const loading = await render(
      <MentionPickerSheet
        loading
        result={undefined}
        onPickAll={jest.fn()}
        onPickUser={jest.fn()}
      />,
    );
    expect(loading.queryByText('Không tìm thấy người trong cuộc trò chuyện')).toBeNull();
  });
});

describe('MentionChipText — render marker thành tên (TH-07)', () => {
  const mentions = [{ type: 'USER' as const, targetId: MINH, label: 'Minh cũ' }];

  it('tên HIỆN TẠI (resolveName) thắng nhãn ảnh chụp; marker/id không lộ ra chữ', async () => {
    const screen = await render(
      withContext(
        { resolveName: () => 'Minh mới' },
        <MentionChipText mentions={mentions} text={`Nhờ @{u:${MINH}} xem`} tone="default" />,
      ),
    );
    expect(screen.getByText('@Minh mới')).toBeOnTheScreen();
    expect(screen.queryByText(new RegExp(MINH))).toBeNull();
  });

  it('không có resolveName → dùng nhãn ảnh chụp; không có nhãn → "@người dùng"', async () => {
    const snapshot = await render(
      <Text>
        <MentionChipText mentions={mentions} text={`@{u:${MINH}}`} tone="default" />
      </Text>,
    );
    expect(snapshot.getByText('@Minh cũ')).toBeOnTheScreen();

    const unknown = await render(
      <Text>
        <MentionChipText mentions={[]} text={`@{u:${MINH}}`} tone="default" />
      </Text>,
    );
    expect(unknown.getByText('@người dùng')).toBeOnTheScreen();
  });

  it('@all hiện "@Tất cả"', async () => {
    const screen = await render(
      <Text>
        <MentionChipText mentions={[]} text="Họp @{all} nhé" tone="default" />
      </Text>,
    );
    expect(screen.getByText('@Tất cả')).toBeOnTheScreen();
  });

  it('chạm chip gọi onPressMention với đúng userId; không có onPressMention thì chip không bấm được', async () => {
    const onPressMention = jest.fn();
    const pressable = await render(
      withContext(
        { onPressMention, currentUserId: ME },
        <MentionChipText mentions={mentions} text={`@{u:${MINH}}`} tone="default" />,
      ),
    );
    await userEvent.press(pressable.getByText('@Minh cũ'));
    expect(onPressMention).toHaveBeenCalledWith(MINH);

    const inert = await render(
      <Text>
        <MentionChipText mentions={mentions} text={`@{u:${MINH}}`} tone="default" />
      </Text>,
    );
    expect(inert.getByText('@Minh cũ').props.onPress).toBeUndefined();
  });

  it('chữ không có marker đi qua nguyên vẹn', async () => {
    const screen = await render(
      <Text>
        <MentionChipText mentions={[]} text="xin chào" tone="default" />
      </Text>,
    );
    expect(screen.getByText('xin chào')).toBeOnTheScreen();
  });
});

describe('MentionAllConfirmDialog — xác nhận @Tất cả cho nhóm đông', () => {
  it('hỏi bằng đúng số người sẽ nhận; Tiếp tục / Huỷ gọi đúng callback', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const screen = await render(
      <MentionAllConfirmDialog count={57} onCancel={onCancel} onConfirm={onConfirm} />,
    );
    expect(screen.getByText('Nhắc tên sẽ báo cho 57 người. Tiếp tục?')).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Tiếp tục'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByText('Huỷ'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('không có số người chờ xác nhận (count undefined) thì không hiện gì', async () => {
    const screen = await render(
      <MentionAllConfirmDialog count={undefined} onCancel={jest.fn()} onConfirm={jest.fn()} />,
    );
    expect(screen.queryByText('Tiếp tục')).toBeNull();
  });
});
