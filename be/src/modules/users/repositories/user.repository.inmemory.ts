import { randomBytes } from "crypto";
import type { IUserRepository, UserListParams } from "./user.repository.interface";
import type { User, UserCreateInput, UserUpdateInput } from "../entities/user.interface";
import { normalizeSearch } from "../../../core/utils/normalize";
import { normalizeEmail } from "../../../core/auth/normalize-email";

/** In-memory store dùng cho development / test */
const store = new Map<string, User>();

/** ID dạng 24 hex char — giống MongoDB ObjectId để tương thích `objectIdSchema` khi test qua route thật. */
function nextId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * InMemoryUserRepository — lưu trữ trong RAM.
 * Dùng khi chưa có DB hoặc trong unit test.
 * Implements IUserRepository.
 */
export class InMemoryUserRepository implements IUserRepository {
  /** Xoá toàn bộ store — dùng trong test */
  static clearStore(): void {
    store.clear();
  }

  async findById(id: string): Promise<User | null> {
    return store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const wanted = normalizeEmail(email);
    for (const u of store.values()) {
      if (u.email === wanted) return u;
    }
    return null;
  }

  async findMany(limit = 10, offset = 0): Promise<{ data: User[]; total: number }> {
    const arr = Array.from(store.values());
    const total = arr.length;
    const data = arr.slice(offset, offset + limit);
    return { data, total };
  }

  async findManyFiltered(params: UserListParams): Promise<{ data: User[]; total: number }> {
    const { limit, offset, q, role, status } = params;
    const normalizedQ = q ? normalizeSearch(q) : undefined;
    const filtered = Array.from(store.values()).filter((u) => {
      if (role && u.role !== role) return false;
      if (status && (u.status ?? "ACTIVE") !== status) return false;
      if (normalizedQ) {
        const matchesName = normalizeSearch(u.name).includes(normalizedQ);
        const matchesEmail = u.email.toLowerCase().includes(q!.toLowerCase());
        if (!matchesName && !matchesEmail) return false;
      }
      return true;
    });
    return { data: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  async create(input: UserCreateInput): Promise<User> {
    const now = new Date();
    const user: User = {
      id: nextId(),
      email: normalizeEmail(input.email),
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash,
      status: "ACTIVE",
      emailVerified: input.emailVerified ?? false,
      sessionVersion: 1,
      avatarAssetId: null,
      phone: input.phone ?? null,
      privacy: null,
      createdAt: now,
      updatedAt: now,
    };
    store.set(user.id, user);
    return user;
  }

  async update(id: string, input: UserUpdateInput): Promise<User | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated: User = {
      ...existing,
      ...(input.email !== undefined && { email: normalizeEmail(input.email) }),
      ...(input.emailVerified !== undefined && { emailVerified: input.emailVerified }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.passwordHash !== undefined && { passwordHash: input.passwordHash }),
      ...(input.avatarAssetId !== undefined && { avatarAssetId: input.avatarAssetId }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.privacy !== undefined && { privacy: input.privacy }),
      updatedAt: new Date(),
    };
    store.set(id, updated);
    return updated;
  }

  async setStatus(id: string, status: string): Promise<User | null> {
    const existing = store.get(id);
    if (!existing) return null;
    const updated: User = { ...existing, status, updatedAt: new Date() };
    store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return store.delete(id);
  }
}
