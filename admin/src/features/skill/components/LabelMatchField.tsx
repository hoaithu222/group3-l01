import { memo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { Badge, Button, Text, TextareaField } from '@/shared/ui';
import { useDebounce } from '@/shared/hooks';
import { formatNumber } from '@/shared/utils/format';

import { useLabelSuggestions } from '../service/skill.queries';
import { appendLabel, parseLabels } from '../utils/skill-labels';

export interface LabelMatchFieldProps {
  disabled?: boolean;
}

/**
 * Nhãn khớp (admin.md p6-06 §2.2): nhập nhiều nhãn (phẩy/xuống dòng), hiện NGAY dạng chuẩn hoá ("Node.js" → `nodejs`) — cách task của nhóm được
 * so khớp; gợi ý nhãn phổ biến từ `GET /admin/skills/label-suggestions` (chỉ tên + số lần dùng), bấm để thêm.
 */
const LabelMatchField = memo(function LabelMatchField({ disabled }: LabelMatchFieldProps) {
  const { control, setValue } = useFormContext<{ labels: string }>();
  const text = useWatch({ control, name: 'labels' }) ?? '';
  const parsed = parseLabels(text);
  const last = parsed.raw[parsed.raw.length - 1] ?? '';
  const q = useDebounce(last, 400);
  const { data: suggestions } = useLabelSuggestions(q, !disabled);
  const fresh = (suggestions ?? [])
    .filter((s) => !parsed.normalized.includes(s.normalized))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <TextareaField
        description="Cách nhau bằng dấu phẩy hoặc xuống dòng, tối đa 10 nhãn. Hệ thống bỏ dấu, chữ hoa và ký tự đặc biệt khi so khớp."
        disabled={disabled}
        label="Nhãn task khớp"
        name="labels"
        required
        rows={2}
      />
      {parsed.normalized.length > 0 ? (
        <div aria-label="Dạng chuẩn hoá" className="flex flex-wrap items-center gap-1" role="group">
          <Text size="small" skin="muted">
            Khớp:
          </Text>
          {parsed.normalized.map((n) => (
            <Badge key={n} className="font-mono" color="neutral" size="sm" variant="outline">
              {n}
            </Badge>
          ))}
        </div>
      ) : null}
      {!disabled && fresh.length > 0 ? (
        <div aria-label="Nhãn phổ biến" className="flex flex-wrap items-center gap-1" role="group">
          <Text size="small" skin="muted">
            Gợi ý:
          </Text>
          {fresh.map((s) => (
            <Button
              key={s.normalized}
              size="xs"
              variant="ghost"
              onClick={() =>
                setValue('labels', appendLabel(text, s.name), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              {`${s.name} (${formatNumber(s.count)})`}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default LabelMatchField;
