import { Pressable, Text, View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';
import type { IconTileTone } from '@/shared/ui/icon-tile';

import { STUDY_VISIBILITIES, type StudyVisibility } from '../api/study.types';
import { VISIBILITY_META } from '../constants/study.constants';
import { SelectCard } from './editor/SelectCard';

export interface VisibilityValue {
  /** Chỉ có nghĩa khi `visibility === 'PUBLIC'`. */
  confirmPublic: boolean;
  visibility: StudyVisibility;
}

export interface VisibilityPickerProps {
  /** Đang mở từ màn nhóm/đã gắn nhóm thì cho chọn "Trong nhóm"; không thì tắt và giải thích. */
  canUseWorkspace: boolean;
  disabled?: boolean;
  value: VisibilityValue;
  workspaceName?: string;
  onChange: (value: VisibilityValue) => void;
}

/** Tông ô icon theo phạm vi: chỉ để phân biệt ba thẻ — nghĩa của phạm vi nằm ở icon + tên + mô tả, không ở màu. */
const VISIBILITY_TONE: Record<StudyVisibility, IconTileTone> = {
  PRIVATE: 'brand',
  PUBLIC: 'warning',
  WORKSPACE: 'info',
};

/**
 * Chọn phạm vi bộ học (app.md p4-01 §2 `VisibilityPicker`): ba THẺ CHỌN (icon + tên + mô tả từ `VISIBILITY_META`, vòng chọn đặc) —
 * Riêng tư · Trong nhóm · Công khai. Người soạn đọc được hệ quả của từng phạm vi ngay trên thẻ, không phải đoán từ một dòng chữ trơn.
 * Công khai BẮT BUỘC tick "Tôi có quyền chia sẻ nội dung này" (BE `STUDY_008` nếu thiếu `confirmPublic`) — nơi gọi khoá nút lưu tới
 * khi `confirmPublic` đúng (`isVisibilityValid`). "Trong nhóm" tắt (kèm lý do) khi không mở từ màn nhóm: BE `STUDY_003` nếu thiếu nhóm.
 */
export function VisibilityPicker({
  canUseWorkspace,
  disabled = false,
  onChange,
  value,
  workspaceName,
}: VisibilityPickerProps) {
  return (
    <View className="gap-sm">
      <Text className="text-body-md text-fg-2">Ai xem được bộ này?</Text>
      <View accessibilityLabel="Phạm vi bộ học" accessibilityRole="radiogroup" className="gap-xs">
        {STUDY_VISIBILITIES.map((visibility) => {
          const meta = VISIBILITY_META[visibility];
          const off = disabled || (visibility === 'WORKSPACE' && !canUseWorkspace);
          const description =
            visibility === 'WORKSPACE' && !canUseWorkspace
              ? 'Mở từ mục "Học" của nhóm để tạo bộ cho nhóm.'
              : visibility === 'WORKSPACE' && workspaceName
                ? `Thành viên nhóm "${workspaceName}" xem, học và sao chép được.`
                : meta.description;
          return (
            <SelectCard
              key={visibility}
              description={description}
              disabled={off}
              icon={meta.icon}
              label={meta.label}
              selected={value.visibility === visibility}
              tone={VISIBILITY_TONE[visibility]}
              onPress={() => onChange({ confirmPublic: false, visibility })}
            />
          );
        })}
      </View>

      {value.visibility === 'PUBLIC' ? (
        <View className="gap-xs rounded-sm border-medium border-border-warning-subtle bg-bg-1 p-sm">
          <Text className="text-caption-sm text-fg-2">
            Bộ công khai hiện ở mục Khám phá; ai cũng xem, học và sao chép được.
          </Text>
          <Pressable
            accessible={false}
            className="min-h-[44px] flex-row items-center gap-sm active:opacity-70"
            disabled={disabled}
            onPress={() => onChange({ ...value, confirmPublic: !value.confirmPublic })}
          >
            <Checkbox
              accessibilityLabel="Tôi có quyền chia sẻ nội dung này"
              checked={value.confirmPublic}
              disabled={disabled}
              onChange={(confirmPublic) => onChange({ ...value, confirmPublic })}
            />
            <Text className="flex-1 text-body-md text-fg-1">Tôi có quyền chia sẻ nội dung này</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** Công khai mà chưa tick xác nhận là không hợp lệ; các phạm vi khác luôn hợp lệ. */
export function isVisibilityValid(value: VisibilityValue): boolean {
  return value.visibility !== 'PUBLIC' || value.confirmPublic;
}
