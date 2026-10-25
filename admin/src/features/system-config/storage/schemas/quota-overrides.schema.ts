import { z } from 'zod';

import { OBJECT_ID_RE } from '../constants/storage.constants';
import {
  QUOTA_GIB_MAX,
  QUOTA_GIB_MIN,
  QUOTA_OVERRIDES_MAX,
} from '../constants/quota-overrides.constants';

const overrideSchema = z.object({
  workspaceId: z.string().regex(OBJECT_ID_RE, 'Mã nhóm không hợp lệ'),
  /** Hạn mức hiển thị bằng GiB; gửi BE dưới dạng byte (`overridesPatch`). */
  gib: z
    .number({ error: 'Nhập hạn mức (GiB)' })
    .min(QUOTA_GIB_MIN, `Tối thiểu ${QUOTA_GIB_MIN.toLocaleString('vi-VN')} GiB`)
    .max(QUOTA_GIB_MAX, `Tối đa ${QUOTA_GIB_MAX} GiB`),
});

/** Schema form "Hạn mức riêng theo nhóm" — GIỐNG schema `resource.quotaOverrides` phía BE (0,5–100 GiB, ≤ 500 nhóm). */
export const quotaOverridesSchema = z.object({
  overrides: z.array(overrideSchema).max(QUOTA_OVERRIDES_MAX, `Tối đa ${QUOTA_OVERRIDES_MAX} nhóm`),
});

export type QuotaOverridesFormValues = z.infer<typeof quotaOverridesSchema>;
export type QuotaOverrideRow = QuotaOverridesFormValues['overrides'][number];
