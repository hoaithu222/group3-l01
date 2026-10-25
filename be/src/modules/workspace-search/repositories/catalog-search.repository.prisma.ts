import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { rawObjectIds } from "../../../infrastructure/database/mongo-raw";
import { beforeCursor, ejsonDate, oid, type MongoFilter } from "../../../core/utils/search-query";
import type {
  ICatalogSearchRepository,
  MeetingRow,
  MeetingSearchInput,
  MemberRow,
  ResourceRow,
  ResourceSearchInput,
  SearchUserBrief,
} from "./search.repository.interface";

const tokenFilters = (field: string, regexes: readonly string[]): MongoFilter[] =>
  regexes.map((r) => ({ [field]: { $regex: r } }));

/**
 * Đọc danh bạ (người, kho tài liệu, cuộc họp) — chỉ đọc. Lọc chuỗi dùng `findRaw` với regex ĐÃ escape (Prisma `contains` không
 * escape ký tự đặc biệt), rồi đọc lại chi tiết bằng Prisma có kiểu theo danh sách id.
 */
export class PrismaCatalogSearchRepository implements ICatalogSearchRepository {
  async userNames(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async userBriefs(ids: readonly string[]): Promise<Map<string, SearchUserBrief>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(users.map((u) => [u.id, { name: u.name, avatarAssetId: u.avatarAssetId ?? null }]));
  }

  async listActiveMembers(workspaceId: string, limit: number): Promise<MemberRow[]> {
    const now = Date.now();
    const rows = await prisma.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE" },
      take: limit,
      select: { userId: true, role: true, displayName: true, expiresAt: true },
    });
    return rows
      .filter((r) => !(r.role === "GUEST" && r.expiresAt && r.expiresAt.getTime() <= now))
      .map((r) => ({ userId: r.userId, role: r.role, displayName: r.displayName }));
  }

  async matchUsersByName(userIds: readonly string[], regexes: readonly string[]): Promise<Map<string, SearchUserBrief>> {
    if (userIds.length === 0) return new Map();
    const raw = await prisma.user.findRaw({
      filter: {
        _id: { $in: userIds.map(oid) },
        status: "ACTIVE",
        $and: tokenFilters("normalizedName", regexes),
      } as Prisma.InputJsonObject,
      options: { projection: { name: 1, avatarAssetId: 1 } },
    });
    const out = new Map<string, SearchUserBrief>();
    if (Array.isArray(raw)) {
      // Extended JSON: ObjectId → `{ $oid }`; `avatarAssetId` vắng/null khi chưa đặt ảnh (hoặc đã ẩn danh hoá).
      for (const doc of raw as { _id?: { $oid?: string }; name?: string; avatarAssetId?: { $oid?: string } | null }[]) {
        const id = doc._id?.$oid;
        if (id && typeof doc.name === "string") out.set(id, { name: doc.name, avatarAssetId: doc.avatarAssetId?.$oid ?? null });
      }
    }
    return out;
  }

  async searchResources(input: ResourceSearchInput): Promise<ResourceRow[]> {
    const raw = await prisma.resource.findRaw({
      filter: {
        workspaceId: oid(input.workspaceId),
        deletedAt: null,
        ...(input.uploadedBy ? { uploadedBy: oid(input.uploadedBy) } : {}),
        $and: [
          ...tokenFilters("normalizedName", input.regexes),
          ...(input.before ? [beforeCursor(input.before)] : []),
          ...(input.from ? [{ createdAt: { $gte: ejsonDate(input.from) } }] : []),
          ...(input.to ? [{ createdAt: { $lte: ejsonDate(input.to) } }] : []),
        ],
      } as Prisma.InputJsonObject,
      options: { sort: { createdAt: -1, _id: -1 }, limit: input.limit, projection: { _id: 1 } },
    });
    const ids = rawObjectIds(raw);
    if (ids.length === 0) return [];
    const docs = await prisma.resource.findMany({
      where: { id: { in: ids } },
      select: { id: true, assetId: true, name: true, mime: true, size: true, type: true, createdAt: true },
    });
    const byId = new Map(docs.map((d) => [d.id, d]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  async searchMeetings(input: MeetingSearchInput): Promise<MeetingRow[]> {
    const visibleTo: MongoFilter[] = [];
    if (input.includeWorkspaceVisible) visibleTo.push({ visibility: "WORKSPACE" });
    if (input.attendeeMeetingIds.length > 0) visibleTo.push({ _id: { $in: input.attendeeMeetingIds.map(oid) } });
    if (visibleTo.length === 0) return [];

    const raw = await prisma.meeting.findRaw({
      filter: {
        workspaceId: oid(input.workspaceId),
        deletedAt: null,
        $and: [
          ...tokenFilters("normalizedTitle", input.regexes),
          { $or: visibleTo },
          ...(input.before ? [beforeCursor(input.before, "startAt")] : []),
        ],
      } as Prisma.InputJsonObject,
      options: { sort: { startAt: -1, _id: -1 }, limit: input.limit, projection: { _id: 1 } },
    });
    const ids = rawObjectIds(raw);
    if (ids.length === 0) return [];
    const docs = await prisma.meeting.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, title: true, startAt: true, endAt: true, status: true },
    });
    const byId = new Map(docs.map((d) => [d.id, d]));
    return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }

  async attendeeMeetingIds(workspaceId: string, userId: string): Promise<string[]> {
    // `removedAt` do module `meetings` ghi — chấp nhận cả `null` lẫn vắng mặt (Prisma+Mongo `{ field: null }` không khớp field vắng).
    const rows = await prisma.meetingAttendee.findMany({
      where: { workspaceId, userId, OR: [{ removedAt: null }, { removedAt: { isSet: false } }] },
      select: { meetingId: true },
    });
    return rows.map((r) => r.meetingId);
  }
}
