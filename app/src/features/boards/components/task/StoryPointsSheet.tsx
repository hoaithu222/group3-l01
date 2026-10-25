import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Input } from '@/shared/ui/input';

import { FALLBACK_TASK_LIMITS, STORY_POINT_STEPS } from '../../constants/task-detail.constants';

export interface StoryPointsSheetProps {
  error: string | null;
  saving: boolean;
  value: number | null;
  visible: boolean;
  onClose: () => void;
  onConfirm: (points: number | null) => void;
}

const asText = (value: number | null): string => (value === null ? '' : String(value));

/** Số nguyên 0..`storyPointsMax` (BE: `z.number().int().min(0).max(100)`); rỗng = bỏ điểm. */
function parsePoints(text: string): { ok: boolean; value: number | null } {
  if (text.trim() === '') return { ok: true, value: null };
  const value = Number(text);
  const ok = Number.isInteger(value) && value >= 0 && value <= FALLBACK_TASK_LIMITS.storyPointsMax;
  return { ok, value: ok ? value : null };
}

/**
 * Lưới bậc gợi ý: hàng 4 ô BẰNG NHAU (8 bậc ⇒ 2 hàng). Chip ôm chữ trong `flex-wrap` thì "0" hẹp, "13" rộng — hàng lởm
 * chởm và ô một chữ số chỉ vừa đầu ngón tay. Hàng cuối thiếu ô thì chèn ô trống `flex-1` để cột vẫn thẳng.
 */
const STEP_COLUMNS = 4;
const STEP_ROWS = Array.from(
  { length: Math.ceil(STORY_POINT_STEPS.length / STEP_COLUMNS) },
  (_, row) => STORY_POINT_STEPS.slice(row * STEP_COLUMNS, (row + 1) * STEP_COLUMNS),
);

/**
 * Điểm ước lượng (app.md §2 `StoryPointsSheet`): chip bậc gợi ý 0·1·2·3·5·8·13·21 để chạm nhanh + ô nhập
 * số cho giá trị khác. Chip chọn = điền vào ô (một nguồn sự thật là `draft`), nên luôn thấy số sẽ lưu.
 *
 * ✅ Dòng dưới ô nhập LUÔN có mặt — gợi ý khoảng hợp lệ, đổi sang tông lỗi khi số sai — và "Bỏ điểm" là nút xoá (×) của
 * chính ô nhập. Trước đây liên kết "Bỏ điểm" và câu giải thích thay chỗ nhau theo `draft` nên tấm nhảy cao/thấp mỗi lần
 * chạm chip.
 */
export function StoryPointsSheet({
  error,
  saving,
  value,
  visible,
  onClose,
  onConfirm,
}: StoryPointsSheetProps) {
  const [draft, setDraft] = useState(asText(value));
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(asText(value));
  }

  const parsed = parsePoints(draft);
  const max = FALLBACK_TASK_LIMITS.storyPointsMax;

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      description="Điểm giúp so sánh độ lớn giữa các thẻ."
      footer={
        <Button
          disabled={!parsed.ok}
          fullWidth
          label="Lưu"
          loading={saving}
          onPress={() => onConfirm(parsed.value)}
        />
      }
      scrollable
      title="Điểm ước lượng"
      visible={visible}
      onClose={onClose}
    >
      {/* Không `pb-md`: tấm có `footer`, khe dưới khối cuối do vùng đáy lo. */}
      <View className="gap-md">
        <View accessibilityLabel="Bậc gợi ý" accessibilityRole="radiogroup" className="gap-xs">
          {STEP_ROWS.map((row) => (
            <View key={row.join('-')} className="flex-row gap-xs">
              {row.map((step) => (
                <Chip
                  key={step}
                  fullWidth
                  label={String(step)}
                  role="radio"
                  selected={draft === String(step)}
                  onPress={() => setDraft(String(step))}
                />
              ))}
              {Array.from({ length: STEP_COLUMNS - row.length }, (_, index) => (
                <View key={`pad-${index}`} className="flex-1" />
              ))}
            </View>
          ))}
        </View>
        <Input
          clearable
          clearLabel="Bỏ điểm"
          digitsOnly
          keyboardType="number-pad"
          label="Số khác"
          maxLength={3}
          message={parsed.ok ? `Số nguyên từ 0 đến ${max}` : `Nhập số nguyên từ 0 đến ${max}`}
          messageTone={parsed.ok ? 'hint' : 'error'}
          placeholder="Để trống nếu chưa ước lượng"
          value={draft}
          onChangeText={setDraft}
        />
      </View>
    </BottomSheet>
  );
}
