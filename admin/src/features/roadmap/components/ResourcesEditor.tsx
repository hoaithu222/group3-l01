import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { createAssetUploader } from '@/core/uploads/asset-upload.adapter';
import { Button, FileField, SelectField, SortableFieldArray, TextField, TextareaField } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import type { LessonFormValues } from '../schemas/lesson.schema';
import {
  emptyResource,
  RESOURCE_GROUP_SUGGESTIONS,
  RESOURCE_KIND_OPTIONS,
  RESOURCE_NOTE_MAX,
  RESOURCES_MAX,
} from '../schemas/resource.schema';

function ResourceRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control } = useFormContext<LessonFormValues>();
  const kind = useWatch({ control, name: `resources.${index}.kind` as const });
  // Tệp PDF — scope `ROADMAP` kind `FILE` (be.md §9 `upload.scopeRestrict.ROADMAP.FILE`: PDF ≤ 20 MiB),
  // KHÁC `useRoadmapImageUpload` (kind `IMAGE`, dùng cho ảnh bìa môn/ảnh buổi).
  const uploadPdf = useMemo(() => createAssetUploader({ scope: 'ROADMAP', kind: 'FILE' }), []);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border-2 bg-bg-2 p-3">
      <div className="flex items-start gap-2">
        <SortableFieldArray.DragHandle className="mt-2.5" />
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField label="Loại" name={`resources.${index}.kind`} options={RESOURCE_KIND_OPTIONS} />
          <TextField
            description={`Gợi ý: ${RESOURCE_GROUP_SUGGESTIONS.join(' · ')}`}
            label="Nhóm hiển thị"
            name={`resources.${index}.group`}
            placeholder="Tài liệu chính thức…"
          />
        </div>
        <Button aria-label="Xoá tài liệu" size="sm" variant="ghost" onClick={onRemove}>
          <SystemIcon name="trash-outline" size={16} />
        </Button>
      </div>

      <TextField label="Tiêu đề" name={`resources.${index}.title`} required />

      {(kind === 'LINK' || kind === 'VIDEO' || kind === 'TOOL') && (
        <TextField label="URL" name={`resources.${index}.url`} placeholder="https://…" required />
      )}
      {kind === 'FILE' && (
        <FileField
          accept="application/pdf"
          filesTitle="Tệp PDF"
          label="Tệp PDF"
          maxSize={20}
          name={`resources.${index}.file`}
          onUpload={uploadPdf}
        />
      )}
      {kind === 'NOTE' && (
        <TextareaField
          label="Nội dung (markdown)"
          maxLength={RESOURCE_NOTE_MAX}
          name={`resources.${index}.bodyMd`}
          rows={4}
          showCount
        />
      )}

      <TextField
        description="Hiện dưới tiêu đề trong tab Tài liệu — vd lý do nên đọc."
        label="Ghi chú"
        name={`resources.${index}.note`}
      />
    </div>
  );
}

/**
 * Tab "Tài liệu" của `LessonEditorPage` (admin.md §2) — `SortableFieldArray` kéo-thả thứ tự, bind trực
 * tiếp vào `resources` của form gộp (`lesson.schema.ts`). Không có endpoint riêng: mảng này gửi nguyên
 * trong `PATCH .../lessons/:id` khi bấm "Lưu" (be.md §3 `patchLessonSchema.resources`).
 */
export default function ResourcesEditor() {
  return (
    <SortableFieldArray<LessonFormValues, 'resources'> name="resources">
      {({ fields, append, remove }) => (
        <div className="flex flex-col gap-3">
          {fields.length === 0 ? (
            <p className="text-body-14 text-fg-4">Chưa có tài liệu nào — thêm liên kết, video, tệp hoặc ghi chú.</p>
          ) : null}
          {fields.map((field, index) => (
            <SortableFieldArray.Item key={field.id} id={field.id}>
              <ResourceRow index={index} onRemove={() => remove(index)} />
            </SortableFieldArray.Item>
          ))}
          <Button
            className="self-start"
            disabled={fields.length >= RESOURCES_MAX}
            size="sm"
            startIcon={<SystemIcon name="plus-outline" size={14} />}
            variant="stroke"
            onClick={() => append(emptyResource(fields.length))}
          >
            Thêm tài liệu
          </Button>
        </div>
      )}
    </SortableFieldArray>
  );
}
