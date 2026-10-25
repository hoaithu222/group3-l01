import type { User, UserCreateInput, UserUpdateInput } from "../entities/user.interface";

export interface UserListParams {
  limit: number;
  offset: number;
  q?: string;
  role?: string;
  status?: string;
}

/**
 * IUserRepository — interface cho user repository.
 * Impl: InMemoryUserRepository (test), PrismaUserRepository (production).
 */
export interface IUserRepository {
  /** Tìm user theo id */
  findById(id: string): Promise<User | null>;
  /** Tìm user theo email (dùng cho login) */
  findByEmail(email: string): Promise<User | null>;
  /** Lấy danh sách user có phân trang */
  findMany(limit: number, offset: number): Promise<{ data: User[]; total: number }>;
  /** Lấy danh sách user có phân trang + lọc theo từ khoá/role/status (admin) */
  findManyFiltered(params: UserListParams): Promise<{ data: User[]; total: number }>;
  /** Tạo user mới */
  create(input: UserCreateInput): Promise<User>;
  /** Cập nhật user theo id */
  update(id: string, input: UserUpdateInput): Promise<User | null>;
  /** Đổi trạng thái tài khoản (ACTIVE/LOCKED/PENDING_DELETION/ANONYMIZED) */
  setStatus(id: string, status: string): Promise<User | null>;
  /** Xoá user theo id */
  delete(id: string): Promise<boolean>;
}
