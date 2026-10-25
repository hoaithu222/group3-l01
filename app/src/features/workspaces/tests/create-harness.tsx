import { fireEvent, screen } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import type { TemplateStepProps } from '@/shared/workspace-templates';

import { workspacesService } from '../api/workspaces.service';

/**
 * Đồ dùng chung của các test form TẠO NHÓM có bước mẫu (`CreateWorkspaceScreen.*.test.tsx`).
 *
 * ⚠️ `jest.mock(...)` (expo-router, capabilities, toast, service) PHẢI nằm trong TỪNG file test: babel-jest chỉ hoist trong chính file
 * đó. File này chỉ dùng lại các module đã bị mock — nạp nó SAU các `jest.mock`.
 */
export const mockedCreate = jest.mocked(workspacesService.create);

export const CREATED = {
  defaultChannel: { id: 'c-0', name: 'Chung' },
  workspace: { id: 'ws-new' },
} as never;

/** Bước mẫu GIẢ nối qua slot `renderTemplateStep` — `workspaces` không import feature `workspace-templates`. */
export const lastStep: { props: TemplateStepProps | undefined } = { props: undefined };

export function renderStep(props: TemplateStepProps) {
  lastStep.props = props;
  return (
    <View>
      <Text>{`Mẫu: ${props.value ? `${props.value.code}[${props.value.channelKeys.join(',')}]` : 'không'}`}</Text>
      <Text>{`Làm mới: ${props.refreshToken}`}</Text>
      <Button
        label="Chọn mẫu môn học"
        onPress={() => props.onChange({ channelKeys: ['thong-bao', 'thao-luan'], code: 'course' })}
      />
      <Button label="Bỏ chọn mẫu" onPress={() => props.onChange(null)} />
    </View>
  );
}

/** Lỗi HTTP có thân `{ error: { code } }` như `errorHandler` của BE. */
export function apiError(status: number, code: string): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, message: code }, success: false },
    headers: {},
    status,
    statusText: '',
  });
}

export const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

export async function fillName(name: string): Promise<void> {
  await fireEvent.changeText(screen.getByPlaceholderText('Ví dụ: Nhóm dự án A'), name);
}

export const submit = () => fireEvent.press(screen.getByRole('button', { name: 'Tạo nhóm' }));

/** Khoá `Idempotency-Key` của lượt gọi thứ `index` (đối số thứ hai của `workspacesService.create`). */
export const keyOf = (index: number) => mockedCreate.mock.calls[index]?.[1];

/** Body của lượt gọi thứ `index`. */
export const bodyOf = (index: number) => mockedCreate.mock.calls[index]?.[0];
