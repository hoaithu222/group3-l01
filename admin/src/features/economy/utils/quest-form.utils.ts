import type { DefaultValues } from 'react-hook-form';

import type { QuestFormValues } from '../schemas/quest.schema';
import type {
  AdminCoinQuest,
  CreateQuestPayload,
  UpdateQuestPayload,
} from '../types/economy-catalog.types';

export function emptyQuestValues(): DefaultValues<QuestFormValues> {
  return {
    code: '',
    title: '',
    description: '',
    metric: 'tasksDone',
    target: undefined,
    coins: undefined,
    order: 0,
    isActive: true,
    reason: '',
  };
}

/** Giá trị form từ nhiệm vụ đã lưu (sửa). */
export function questToValues(q: AdminCoinQuest): QuestFormValues {
  return {
    code: q.code,
    title: q.title,
    description: q.description,
    metric: q.metric,
    target: q.target,
    coins: q.coins,
    order: q.order,
    isActive: q.isActive,
    reason: '',
  };
}

const FIELDS = ['title', 'description', 'metric', 'target', 'coins', 'order', 'isActive'] as const;

/** Đã đổi trường nào ngoài lý do chưa — chặn gửi bản sửa rỗng. */
export function hasQuestChanges(q: AdminCoinQuest, v: QuestFormValues): boolean {
  const before = questToValues(q);
  return FIELDS.some(
    (key) => (key === 'title' || key === 'description' ? v[key].trim() : v[key]) !== before[key],
  );
}

export function toCreateQuestPayload(v: QuestFormValues): CreateQuestPayload {
  return {
    code: v.code,
    title: v.title,
    description: v.description,
    metric: v.metric,
    target: v.target,
    coins: v.coins,
    isActive: v.isActive,
    order: v.order,
    reason: v.reason,
  };
}

/** Chỉ gửi trường ĐÃ ĐỔI (BE: `code` không đổi được; đổi `metric`/`target` chỉ tác dụng từ ngày sau cho tiến độ chưa nhận). */
export function toUpdateQuestPayload(q: AdminCoinQuest, v: QuestFormValues): UpdateQuestPayload {
  const before = questToValues(q);
  const diff = <K extends (typeof FIELDS)[number]>(key: K) =>
    v[key] !== before[key] ? ({ [key]: v[key] } as Pick<QuestFormValues, K>) : {};
  return {
    id: q.id,
    expectedVersion: q.version,
    reason: v.reason,
    ...diff('title'),
    ...diff('description'),
    ...diff('metric'),
    ...diff('target'),
    ...diff('coins'),
    ...diff('order'),
    ...diff('isActive'),
  };
}
