import { useState } from 'react';
import { Text, View } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { FormInput } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';
import { Stepper } from '@/shared/ui/stepper';

import type { CreateMentorPostPayload } from '../api/mentor.types';
import { MENTOR_LIMITS as L } from '../constants/mentor.constants';
import { mentorPostFormSchema, type MentorPostFormValues } from '../schemas/mentor.schemas';
import { SkillsEditor } from './SkillsEditor';

export interface MentorPostFormProps {
  /** Lỗi cấp form từ server (`MENTOR_001`…) — hiện dưới form, giữ nguyên thứ đã nhập. */
  errorMessage?: string | null;
  /** Nhóm đã đủ 3 bài OPEN → khoá nút đăng + giải thích (app.md §3). */
  locked?: boolean;
  submitting: boolean;
  onSubmit: (payload: CreateMentorPostPayload) => void;
}

/** Hàng số liệu có ô icon tông màu — CÙNG icon/tông với khối "Thông tin" của chi tiết bài (giờ · người · hạn): điền gì thấy nấy. */
function NumberRow({
  icon,
  label,
  max,
  min,
  onChange,
  tone,
  unit,
  value,
}: {
  icon: IconName;
  label: string;
  max: number;
  min: number;
  tone: IconTileTone;
  unit: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View className="min-h-[56px] flex-row items-center justify-between gap-sm">
      <IconTile name={icon} size="sm" tone={tone} />
      <Text className="flex-1 text-body-md text-fg-1">{label}</Text>
      <Stepper
        accessibilityLabel={label}
        formatValue={(v) => `${v} ${unit}`}
        max={max}
        min={min}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

/**
 * Form đăng bài tìm cố vấn (app.md §3): tiêu đề, mô tả, kỹ năng (chip ≤ 10), giờ/tuần, số cố vấn (1–3), hạn (3–60 ngày).
 * Lỗi Zod tại trường (`onTouched`); thiếu kỹ năng báo ngay dưới ô kỹ năng khi bấm đăng.
 */
export function MentorPostForm({
  errorMessage,
  locked,
  onSubmit,
  submitting,
}: MentorPostFormProps) {
  const form = useZodForm<MentorPostFormValues, MentorPostFormValues>(mentorPostFormSchema, {
    defaultValues: { description: '', title: '' },
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [hours, setHours] = useState(2);
  const [mentors, setMentors] = useState(1);
  const [days, setDays] = useState(14);

  const submit = form.handleSubmit((values) => {
    if (skills.length === 0) {
      setSkillsError('Cần ít nhất 1 kỹ năng');
      return;
    }
    onSubmit({
      ...values,
      commitmentHoursPerWeek: hours,
      expiresInDays: days,
      mentorsNeeded: mentors,
      skills,
    });
  });

  // Hai khối có tiêu đề: nội dung bài (người đọc bài thấy gì) và yêu cầu (số liệu cố vấn cân nhắc) — form không còn là một cột ô liền tù tì.
  return (
    <View className="gap-xl py-xs">
      <Section icon="edit" title="Nội dung bài">
        <View className="gap-md">
          <FormInput<MentorPostFormValues>
            control={form.control}
            label="Tiêu đề"
            maxLength={L.titleMax}
            name="title"
            placeholder="Ví dụ: Cần cố vấn kiến trúc backend cho đồ án"
            required
          />
          <FormInput<MentorPostFormValues>
            control={form.control}
            label="Mô tả khó khăn"
            maxLength={L.descriptionMax}
            multiline
            name="description"
            placeholder="Nhóm đang làm gì, vướng ở đâu, mong cố vấn giúp gì"
            required
          />
          <SkillsEditor
            error={skillsError}
            value={skills}
            onChange={(next) => {
              setSkills(next);
              if (next.length > 0) setSkillsError(null);
            }}
          />
        </View>
      </Section>
      <Section icon="support" title="Yêu cầu cố vấn">
        <Card className="gap-0 py-2xs">
          <NumberRow
            icon="timer"
            label="Cam kết mỗi tuần"
            max={L.commitmentHoursMax}
            min={1}
            tone="info"
            unit="giờ"
            value={hours}
            onChange={setHours}
          />
          <Divider />
          <NumberRow
            icon="add-team"
            label="Số cố vấn cần"
            max={L.mentorsNeededMax}
            min={1}
            tone="success"
            unit="người"
            value={mentors}
            onChange={setMentors}
          />
          <Divider />
          <NumberRow
            icon="calendar"
            label="Nhận đơn trong"
            max={L.expiresInDaysMax}
            min={L.expiresInDaysMin}
            tone="warning"
            unit="ngày"
            value={days}
            onChange={setDays}
          />
        </Card>
      </Section>
      {locked ? (
        <Alert
          description={`Nhóm đã có ${L.postsOpenPerWorkspace} bài đang mở — hãy đóng bớt bài trước khi đăng bài mới.`}
          tone="warning"
        />
      ) : null}
      {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
      <Button
        disabled={locked}
        fullWidth
        iconLeft="upload"
        label="Đăng bài"
        loading={submitting}
        onPress={submit}
      />
    </View>
  );
}
