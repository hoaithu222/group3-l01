import type { TemplateChannelValues, TemplateFormValues } from '../schemas/template.schema';
import type {
  TemplateChannel,
  TemplateUpdateFields,
  WorkspaceTemplate,
} from '../types/templates.types';

/** Bản ghi của server → giá trị form. */
export function toTemplateForm(template: WorkspaceTemplate): TemplateFormValues {
  return {
    name: template.name,
    description: template.description,
    isActive: template.isActive,
    channels: template.channels.map((c) => ({ ...c })),
  };
}

/** Chuẩn hoá một hàng để so sánh/gửi: cắt khoảng trắng đầu-cuối như schema (`.trim()`) sẽ làm khi lưu. */
const cleanChannel = (c: TemplateChannelValues): TemplateChannel => ({
  key: c.key.trim(),
  name: c.name.trim(),
  description: c.description.trim(),
  type: c.type,
  visibility: c.visibility,
  postingPolicy: c.postingPolicy,
  defaultSelected: c.defaultSelected,
});

const sameChannel = (a: TemplateChannel, b: TemplateChannel): boolean =>
  a.key === b.key &&
  a.name === b.name &&
  a.description === b.description &&
  a.type === b.type &&
  a.visibility === b.visibility &&
  a.postingPolicy === b.postingPolicy &&
  a.defaultSelected === b.defaultSelected;

/**
 * Phần THAY ĐỔI so với bản server — chỉ gửi trường đã đổi (BE ghi tên các trường vào nhật ký và chỉ cần ≥ 1 trường).
 * Rỗng = không có gì để lưu (nút Lưu khoá). Thứ tự hàng kênh là một phần dữ liệu: đổi thứ tự = đổi `channels`.
 */
export function diffTemplate(
  values: TemplateFormValues,
  server: WorkspaceTemplate,
): TemplateUpdateFields {
  const patch: TemplateUpdateFields = {};
  const name = values.name.trim();
  const description = values.description.trim();
  if (name !== server.name) patch.name = name;
  if (description !== server.description) patch.description = description;
  if (values.isActive !== server.isActive) patch.isActive = values.isActive;

  const channels = values.channels.map(cleanChannel);
  const changed =
    channels.length !== server.channels.length ||
    channels.some((c, i) => !sameChannel(c, server.channels[i]));
  if (changed) patch.channels = channels;
  return patch;
}

/** Tóm tắt một dòng cho hộp thoại lý do: liệt kê trường đổi bằng tên tiếng Việt. */
const FIELD_LABELS: Readonly<Record<keyof TemplateUpdateFields, string>> = {
  name: 'tên',
  description: 'mô tả',
  isActive: 'trạng thái bật/tắt',
  order: 'thứ tự',
  channels: 'danh sách kênh',
};

export function summarizePatch(patch: TemplateUpdateFields): string {
  const labels = (Object.keys(patch) as (keyof TemplateUpdateFields)[]).map((k) => FIELD_LABELS[k]);
  return labels.length ? `Thay đổi: ${labels.join(', ')}.` : 'Không có thay đổi.';
}
