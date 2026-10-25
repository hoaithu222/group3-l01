import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';
import { cn } from '@/shared/utils/style/cn';

import type { BoardLabel } from '../api/boards.types';
import { LABEL_COLOR_NAME, LABEL_COLOR_TOKENS } from '../constants/kanban.constants';
import { labelDotClass } from './kanban/TaskLabels';

/** Tên nhãn tối đa 30 ký tự (be.md §3 `labelSchema`). */
const LABEL_NAME_MAX = 30;

export interface LabelFormProps {
  /** Nhãn đang sửa; `null` = nhãn mới. */
  editing: BoardLabel | null;
  error: unknown;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: { color: string; name: string }) => void;
}

/**
 * Tấm form tên + màu nhãn (dựng qua `LabelSheet`, mỗi lần mở một `key` mới). Màu chọn trong bộ token cố định
 * (be.md §2: KHÔNG hex tự do); mỗi màu là chấm màu + TÊN màu — màu không phải dấu hiệu duy nhất.
 *
 * ✅ Nút lưu nằm ở `footer` (đứng yên, chiếm trọn bề ngang) và lỗi máy chủ ở `alert` (ghim dưới tiêu đề) — trước đây cả
 * hai nằm CUỐI vùng cuộn: nút thành viên thuốc nhỏ dạt trái, bàn phím mở là bị che. State khởi tạo từ `editing`; ô tên
 * là UNCONTROLLED (IME-safe).
 */
export function LabelForm({ editing, error, pending, onClose, onSubmit }: LabelFormProps) {
  const [name, setName] = useState(editing?.name ?? '');
  const [color, setColor] = useState(editing?.color ?? LABEL_COLOR_TOKENS[0] ?? 'blue');
  const trimmed = name.trim();

  return (
    <BottomSheet
      alert={error ? <Alert description={toErrorMessage(error)} tone="error" /> : undefined}
      footer={
        <Button
          disabled={trimmed.length === 0}
          fullWidth
          label={editing ? 'Lưu nhãn' : 'Thêm nhãn'}
          loading={pending}
          onPress={() => onSubmit({ color, name: trimmed })}
        />
      }
      scrollable
      title={editing ? 'Sửa nhãn' : 'Thêm nhãn'}
      visible
      onClose={onClose}
    >
      <View className="gap-md">
        <Input
          defaultValue={editing?.name ?? ''}
          label="Tên nhãn"
          maxLength={LABEL_NAME_MAX}
          placeholder="Ví dụ: Khẩn cấp"
          required
          onChangeText={setName}
        />
        {/* `Section tone="default"` = đúng kiểu chữ nhãn của ô "Tên nhãn" ngay trên (16 semibold `fg-1`) — nhãn "Màu"
            cũ nhỏ hơn một bậc nên hai trường của cùng một form lệch nhau. */}
        <Section title="Màu" tone="default">
          <View
            accessibilityLabel="Màu nhãn"
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-xs"
          >
            {LABEL_COLOR_TOKENS.map((token) => (
              <Chip
                key={token}
                label={LABEL_COLOR_NAME[token] ?? token}
                leading={<View className={cn('h-3 w-3 rounded-full', labelDotClass(token))} />}
                role="radio"
                selected={color === token}
                size="sm"
                onPress={() => setColor(token)}
              />
            ))}
          </View>
        </Section>
      </View>
    </BottomSheet>
  );
}
