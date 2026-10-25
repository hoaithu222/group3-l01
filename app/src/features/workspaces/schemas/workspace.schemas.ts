import { z } from 'zod';

import type { CapabilityLimits } from '@/core/capabilities';

/** Trần cứng phía BE (`LIMITS.workspace`, be.md p1-01 §9) — dùng khi `capabilities` chưa tải xong. */
const FALLBACK_WORKSPACE_LIMITS = { nameMin: 2, nameMax: 80, descriptionMax: 500 };

/** `capabilities.limits` khai `Record<string, unknown>` cố ý (xem `capabilities.types.ts`) — ép kiểu tại đây. */
export function readWorkspaceLimits(limits: CapabilityLimits | undefined): {
  nameMin: number;
  nameMax: number;
  descriptionMax: number;
} {
  const raw = limits?.workspace as Partial<typeof FALLBACK_WORKSPACE_LIMITS> | undefined;
  return {
    nameMin: raw?.nameMin ?? FALLBACK_WORKSPACE_LIMITS.nameMin,
    nameMax: raw?.nameMax ?? FALLBACK_WORKSPACE_LIMITS.nameMax,
    descriptionMax: raw?.descriptionMax ?? FALLBACK_WORKSPACE_LIMITS.descriptionMax,
  };
}

export function createWorkspaceSchema(limits: ReturnType<typeof readWorkspaceLimits>) {
  return z.object({
    name: z
      .string()
      .trim()
      // Ô TRỐNG có câu riêng: "tối thiểu 2 ký tự" cho một ô chưa gõ gì đọc như lỗi đếm, không phải lời nhắc phải nhập tên.
      .min(1, 'Nhập tên nhóm')
      .min(limits.nameMin, `Tên nhóm tối thiểu ${limits.nameMin} ký tự`)
      .max(limits.nameMax, `Tên nhóm tối đa ${limits.nameMax} ký tự`),
    description: z.string().trim().max(limits.descriptionMax, `Mô tả tối đa ${limits.descriptionMax} ký tự`).optional(),
  });
}

export type CreateWorkspaceFormValues = z.infer<ReturnType<typeof createWorkspaceSchema>>;

export function updateWorkspaceSchema(limits: ReturnType<typeof readWorkspaceLimits>) {
  return createWorkspaceSchema(limits);
}

export type UpdateWorkspaceFormValues = z.infer<ReturnType<typeof updateWorkspaceSchema>>;

/** Xác nhận chuyển quyền sở hữu — `confirmName` so khớp phía BE (`normalizeSearch`, không dấu). */
export const transferOwnerSchema = z.object({
  toUserId: z.string().min(1),
  confirmName: z.string().trim().min(1, 'Nhập tên người nhận để xác nhận'),
});

export type TransferOwnerFormValues = z.infer<typeof transferOwnerSchema>;
