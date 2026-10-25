import { prisma } from "../../../infrastructure/database";

export interface UploaderInfo {
  id: string;
  name: string;
  /** `User.avatarAssetId` — presenter đổi sang URL ảnh ký sẵn (`avatarUrlOf`); `null` = chưa đặt ảnh / đã ẩn danh hoá. */
  avatarAssetId: string | null;
}

/** Tra tên + ảnh người tải lên để dựng `ResourceDto.uploadedBy` — 1 truy vấn batch/trang (không N+1). */
export interface IUserDirectory {
  findMany(ids: string[]): Promise<Map<string, UploaderInfo>>;
}

export class PrismaUserDirectory implements IUserDirectory {
  async findMany(ids: string[]): Promise<Map<string, UploaderInfo>> {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return new Map();
    const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, avatarAssetId: true } });
    return new Map(users.map((u) => [u.id, { id: u.id, name: u.name, avatarAssetId: u.avatarAssetId }]));
  }
}

export class InMemoryUserDirectory implements IUserDirectory {
  readonly users = new Map<string, UploaderInfo>();

  findMany(ids: string[]): Promise<Map<string, UploaderInfo>> {
    const out = new Map<string, UploaderInfo>();
    for (const id of ids) {
      const found = this.users.get(id);
      if (found) out.set(id, found);
    }
    return Promise.resolve(out);
  }
}
