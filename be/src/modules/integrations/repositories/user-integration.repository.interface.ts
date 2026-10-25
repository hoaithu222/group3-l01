import type { SealedSecret } from "../../../core/utils/crypto";
import type { IntegrationProviderValue } from "../../../core/constants/integration";
import type { IntegrationStatusValue, UserIntegrationEntity } from "../entities/integration.interface";
import type { OutboxEventInput } from "../../../infrastructure/queue";

export interface UpsertUserIntegrationInput {
  userId: string;
  provider: IntegrationProviderValue;
  externalAccountId: string;
  credentials: SealedSecret | null;
  tokenExpiresAt: Date | null;
  outbox?: (userIntegrationId: string) => OutboxEventInput[];
}

/** Truy cập `UserIntegration` (kết nối cá nhân — Google Calendar). */
export interface IUserIntegrationRepository {
  findById(id: string): Promise<UserIntegrationEntity | null>;
  listByUser(userId: string): Promise<UserIntegrationEntity[]>;
  findByUserProvider(userId: string, provider: IntegrationProviderValue): Promise<UserIntegrationEntity | null>;
  /** Nối lại đúng tài khoản cũ hoặc đổi tài khoản: một người chỉ có MỘT kết nối mỗi nhà cung cấp (`@@unique([userId, provider])`). */
  upsert(input: UpsertUserIntegrationInput): Promise<UserIntegrationEntity>;
  saveCredentials(id: string, credentials: SealedSecret | null, tokenExpiresAt: Date | null): Promise<void>;
  /** Đổi trạng thái; `clearCredentials` xoá token khi REVOKED. */
  setStatus(id: string, status: IntegrationStatusValue, reason: string | null, clearCredentials?: boolean): Promise<UserIntegrationEntity | null>;
  delete(id: string): Promise<void>;
  /** Kết nối ACTIVE của các người dùng (danh sách người tham dự cuộc họp). */
  findActiveByUserIds(userIds: string[], provider: IntegrationProviderValue): Promise<UserIntegrationEntity[]>;
}
