import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';

import type { BoardDetail } from '../../api/boards.types';
import { useUpdateBoard } from '../../queries/boards.queries';
import { getErrorCode } from '../../utils/error-details';

/**
 * Tên + mô tả bảng. Ô nhập UNCONTROLLED (`defaultValue`) và giữ nguyên khi bảng
 * bị người khác sửa: `RES_003` chỉ hiện banner và tải lại `version` mới, ⛔ không
 * đè chữ người dùng đang gõ (`app.md` §3: "409 → banner + tải lại giữ form").
 */
export function BoardInfoSection({
  board,
  nameMax,
  onConflict,
}: {
  board: BoardDetail;
  nameMax: number;
  /** Gọi khi 409 để màn tải lại `detail` (lấy `version` mới) mà không remount form. */
  onConflict: () => void;
}) {
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description ?? '');
  const update = useUpdateBoard(board.id);

  const trimmed = name.trim();
  const dirty = trimmed !== board.name || description.trim() !== (board.description ?? '');
  const conflict = getErrorCode(update.error) === 'RES_003';

  const save = () =>
    update.mutate(
      { description: description.trim(), expectedVersion: board.version, name: trimmed },
      { onError: (error) => getErrorCode(error) === 'RES_003' && onConflict() },
    );

  return (
    <Section icon="alert-information" title="Thông tin">
      <View className="gap-sm">
        {conflict ? (
          <Alert
            description="Bảng đã được người khác thay đổi. Đã tải lại phiên bản mới — kiểm tra rồi bấm Lưu lần nữa."
            title="Bảng đã thay đổi"
            tone="warning"
          />
        ) : update.error ? (
          <Alert description={toErrorMessage(update.error)} tone="error" />
        ) : null}
        <Input
          defaultValue={board.name}
          label="Tên bảng"
          maxLength={nameMax}
          placeholder="Ví dụ: Đồ án học kỳ 1"
          required
          onChangeText={setName}
        />
        <Input
          defaultValue={board.description ?? ''}
          label="Mô tả"
          multiline
          placeholder="Bảng này dùng để làm gì? (không bắt buộc)"
          onChangeText={setDescription}
        />
        <Button
          disabled={!dirty || trimmed.length === 0}
          label="Lưu thông tin"
          loading={update.isPending}
          onPress={save}
        />
      </View>
    </Section>
  );
}
