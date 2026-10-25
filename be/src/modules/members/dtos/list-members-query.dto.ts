import { z } from "zod";

export const listMembersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]).optional(),
  // BANNED chỉ OWNER/ADMIN xem được — kiểm ở service (be.md §4 PERM_001 khi MEMBER lọc BANNED).
  status: z.enum(["ACTIVE", "BANNED"]).default("ACTIVE"),
  sort: z.enum(["role", "name", "joinedAt"]).default("role"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListMembersQueryDto = z.infer<typeof listMembersQuerySchema>;

export const adminListMembersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]).optional(),
  status: z.enum(["ACTIVE", "PENDING", "LEFT", "REMOVED", "BANNED"]).optional(),
  sort: z.enum(["role", "name", "joinedAt"]).default("joinedAt"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListMembersQueryDto = z.infer<typeof adminListMembersQuerySchema>;
