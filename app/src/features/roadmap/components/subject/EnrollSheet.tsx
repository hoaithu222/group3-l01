import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { DatePicker } from '@/shared/ui/date-picker';
import { Section } from '@/shared/ui/section';
import { toApiDate } from '@/shared/utils/datetime';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { RoadmapSubjectDetailDto } from '../../api/roadmap.types';
import { roadmapErrorMessage } from '../../constants/roadmap-error-codes.constants';
import { useEnrollSubject } from '../../queries/roadmap.queries';
import { dateKeyToDay, formatPlanDay, formatStudySpan, todayDay } from '../../utils/roadmap-dates';
import { plannedDateForLesson } from '../../utils/roadmap-schedule';
import { MetaTag } from '../common/MetaTag';
import { StudyDaysPicker } from './StudyDaysPicker';

export interface EnrollSheetProps {
  subject: RoadmapSubjectDetailDto;
  visible: boolean;
  onClose: () => void;
}

const DAY_MS = 86_400_000;

interface DaysPreset {
  days: number[];
  label: string;
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.length === right.length && left.every((day, i) => day === right[i]);
}

/** Nhịp học chọn nhanh — "Theo gợi ý" (của môn) đứng đầu; nhịp trùng nhau chỉ hiện một lần. */
function buildPresets(defaults: readonly number[], unit: string): DaysPreset[] {
  const presets: DaysPreset[] = [];
  const add = (label: string, days: number[]) => {
    if (days.length > 0 && !presets.some((preset) => sameDays(preset.days, days)))
      presets.push({ days, label });
  };
  add('Theo gợi ý', [...defaults]);
  add(`3 ${unit}/tuần`, [1, 3, 5]);
  add('Cuối tuần', [6, 7]);
  add('Mỗi ngày', [1, 2, 3, 4, 5, 6, 7]);
  return presets;
}

/**
 * Đăng ký lộ trình (README §4 luồng 2) — chọn ngày bắt đầu + nhịp học (chip chọn nhanh hoặc từng thứ), xem trước lịch
 * NGAY khi đổi (buổi đầu, ngày xong dự kiến, kéo dài bao lâu), rồi `POST enroll` (Idempotency-Key).
 */
export function EnrollSheet({ onClose, subject, visible }: EnrollSheetProps) {
  // ⛔ Không cross-import bản `newLocalId` của `study` (feature-structure.md) — chỉ MỘT chỗ cần idempotency key ở
  // đây nên sinh trực tiếp, không đáng thêm hẳn một util.
  const [idempotencyKey] = useState(
    () => `roadmap-enroll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const [startDate, setStartDate] = useState(() => new Date());
  const [studyDays, setStudyDays] = useState<number[]>(() => [...subject.defaultStudyDays]);
  const mutation = useEnrollSubject(subject.id);
  // ⛔ `Date.now()` chỉ được gọi trong lazy initializer của `useState` (React Compiler coi đây là nơi AN TOÀN
  // DUY NHẤT cho lời gọi không thuần trong thân component — cùng mẫu `@/shared/hooks/useNow`).
  const [now] = useState(() => Date.now());
  const minDate = new Date(now - 30 * DAY_MS);
  const maxDate = new Date(now + 180 * DAY_MS);
  const today = todayDay(now);
  const unit = subject.lessonLabel.toLowerCase();
  const presets = useMemo(
    () => buildPresets(subject.defaultStudyDays, unit),
    [subject.defaultStudyDays, unit],
  );

  const preview = useMemo(() => {
    if (studyDays.length === 0) return null;
    const anchor = { anchorDate: startDate, anchorNumber: 1, studyDays };
    const first = dateKeyToDay(plannedDateForLesson(anchor, 1));
    const last = dateKeyToDay(plannedDateForLesson(anchor, subject.lessonCount));
    return first !== null && last !== null ? { first, last } : null;
  }, [startDate, studyDays, subject.lessonCount]);

  // ⚠️ Xoá lỗi cũ khi đóng: tấm chỉ ẩn (không huỷ) nên mở lại mà không `reset()` thì khe `alert` còn treo lỗi của lần trước.
  const close = () => {
    if (!mutation.isPending) mutation.reset();
    onClose();
  };

  const submit = async () => {
    try {
      await mutation.mutateAsync({
        idempotencyKey,
        payload: { startDate: toApiDate(startDate) ?? '', studyDays },
      });
      // Rung "xong việc" SAU khi máy chủ nhận đăng ký (không phải lúc bấm) — cùng nhịp với toast thành công.
      hapticSuccess();
      showToast('success', `Đã bắt đầu lộ trình ${subject.title}`);
      onClose();
    } catch {
      // Lỗi đã nằm ở `mutation.error` ⇒ hiện ở khe `alert` bên dưới; `catch` chỉ để lời hứa bị từ chối không thành lỗi chưa bắt.
    }
  };

  return (
    <BottomSheet
      // ✅ Lỗi đăng ký ở khe `alert` (đứng yên dưới tiêu đề, tấm vẫn mở để thử lại). ❌ Bản trước bắn toast — `ToastHost` gắn ở
      // gốc app (`AppProviders`) nằm DƯỚI cửa sổ native `<Modal>` của tấm, nên lỗi bị che và nút trông như không ăn.
      alert={
        mutation.error ? (
          <Alert description={roadmapErrorMessage(mutation.error)} tone="error" />
        ) : undefined
      }
      footer={
        <Button
          disabled={studyDays.length === 0}
          fullWidth
          label="Bắt đầu lộ trình"
          loading={mutation.isPending}
          onPress={() => void submit()}
        />
      }
      scrollable
      title="Bắt đầu lộ trình"
      visible={visible}
      onClose={close}
    >
      <View className="gap-lg">
        <DatePicker
          label="Ngày bắt đầu"
          maxDate={maxDate}
          minDate={minDate}
          value={startDate}
          onChange={setStartDate}
        />

        {/* ✅ `Section` thay cho dòng chữ đậm tự dựng: tiêu đề nhóm mang vai `header` (trình đọc màn hình nhảy theo heading được). */}
        <Section title="Học vào những ngày nào?" tone="default">
          <View className="gap-sm">
            <View
              accessibilityLabel="Nhịp học chọn nhanh"
              accessibilityRole="radiogroup"
              className="flex-row flex-wrap gap-xs"
            >
              {presets.map((preset) => (
                <Chip
                  key={preset.label}
                  label={preset.label}
                  role="radio"
                  selected={sameDays(preset.days, studyDays)}
                  size="sm"
                  onPress={() => {
                    if (!sameDays(preset.days, studyDays)) hapticSelection();
                    setStudyDays([...preset.days].sort((a, b) => a - b));
                  }}
                />
              ))}
            </View>
            <StudyDaysPicker value={studyDays} onChange={setStudyDays} />
          </View>
        </Section>

        {preview ? (
          <View className="gap-xs rounded-md bg-surface-primary p-md">
            <Text className="text-label-md font-semibold text-fg-1">Lịch dự kiến</Text>
            <MetaTag
              icon="calendar"
              label={`${subject.lessonLabel} 1: ${formatPlanDay(preview.first, today, { weekday: 'long' })}`}
              tone="brand"
            />
            <MetaTag
              icon="clock"
              label={`${String(studyDays.length)} ${unit}/tuần · tổng ${String(subject.lessonCount)} ${unit}`}
            />
            <MetaTag
              icon="checkmark-circle"
              label={`Xong dự kiến ${formatPlanDay(preview.last, today, { relative: false, weekday: 'long' })} · ${formatStudySpan(preview.first, preview.last)}`}
              tone="success"
            />
          </View>
        ) : (
          <MetaTag
            icon="alert-warning"
            label="Chọn ít nhất một ngày học trong tuần."
            tone="warning"
          />
        )}
      </View>
    </BottomSheet>
  );
}
