import { useFormContext, useWatch } from 'react-hook-form';

import { Badge, Callout, TextareaField } from '@/shared/ui';

import { useDebouncedPreview } from '../hooks/useDebouncedPreview';
import { BODY_MD_MAX, type LessonFormValues } from '../schemas/lesson.schema';
import BlockPreview from './BlockPreview';

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption-12-medium text-fg-4">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((text, i) => (
          <Badge key={i} color="neutral" variant="tinted">
            {text}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/**
 * Tab "Nội dung" của `LessonEditorPage` (admin.md §2): `Textarea` markdown bên trái + xem trước khối bên
 * phải qua `POST /admin/roadmap/preview` (debounce 600 ms, `useDebouncedPreview`). Mục tiêu/checklist/tài
 * liệu tách tự động hiện dạng chip — CHỈ để admin thấy trước những gì sẽ tách ra khỏi thân bài khi lưu
 * (`build-lesson-content`, be.md §5.2), KHÔNG sửa được ở đây. Đọc `bodyMd` qua ambient RHF context của
 * `<Form>` bao ngoài (`LessonEditorPage`) — không nhận `form` qua props, theo mẫu field kit2.
 */
export default function MarkdownEditor() {
  const { control } = useFormContext<LessonFormValues>();
  const bodyMd = useWatch({ control, name: 'bodyMd' }) ?? '';
  const { preview, isLoading, isError } = useDebouncedPreview(bodyMd);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <TextareaField
        description="Markdown thô — mục '## Mục tiêu buổi học', '## Checklist cuối buổi', '## Đọc thêm & Tài nguyên' tự tách ra khỏi thân khi lưu."
        label="Nội dung (markdown)"
        maxLength={BODY_MD_MAX}
        minHeight={520}
        name="bodyMd"
        placeholder={'## Mục tiêu buổi học\n- …\n\n## Nội dung\n…'}
      />

      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-body-14-medium text-fg-1">Xem trước</span>
          {isLoading && <span className="text-caption-12 text-fg-4">Đang dựng…</span>}
        </div>

        {isError && (
          <Callout
            description="Kiểm tra cú pháp markdown rồi thử lại."
            intent="error"
            title="Không dựng được nội dung"
          />
        )}
        {preview && preview.warnings.length > 0 && (
          <Callout
            description={preview.warnings.join('; ')}
            intent="warning"
            title={`${preview.warnings.length} cảnh báo khi dựng nội dung`}
          />
        )}

        {preview && (
          <>
            <ChipGroup items={preview.objectives} label="Mục tiêu (tách tự động)" />
            <ChipGroup items={preview.checklist.map((c) => c.text)} label="Checklist cuối buổi (tách tự động)" />
            <ChipGroup items={preview.resources.map((r) => r.title)} label="Đọc thêm & Tài nguyên (tách tự động)" />
          </>
        )}

        <div className="min-h-[420px] flex-1 overflow-auto rounded-md border border-border-2 bg-bg-2 p-4">
          <BlockPreview blocks={preview?.blocks ?? []} />
        </div>
      </div>
    </div>
  );
}
