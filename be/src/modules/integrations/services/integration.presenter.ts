import {
  INTEGRATION_EVENT_TYPES,
  INTEGRATION_PROVIDER_TO_KEY,
  type IntegrationProviderKey,
  type IntegrationProviderValue,
  type IntegrationTargetScopeType,
} from "../../../core/constants/integration";
import type { IntegrationConfig, IntegrationEntity, UserIntegrationEntity } from "../entities/integration.interface";

/** Đích nhận tin. `name = null` khi NGƯỜI XEM không đọc được đích (kênh riêng tư) — app hiện "Kênh riêng tư", không lộ tên. */
export interface TargetView {
  scopeType: IntegrationTargetScopeType;
  scopeId: string;
  name: string | null;
  private: boolean;
}

/** Bản đầy đủ cho OWNER/ADMIN — KHÔNG có `credentials`, `webhookSecretHash`, `externalHookIds` (INT-08). */
export interface IntegrationView {
  id: string;
  workspaceId: string;
  provider: IntegrationProviderValue;
  providerKey: IntegrationProviderKey;
  externalName: string;
  scopes: string[];
  config: IntegrationConfig;
  supportedEvents: readonly string[];
  target: TargetView;
  status: string;
  statusReason: string | null;
  lastEventAt: string | null;
  version: number;
  createdBy: string;
  createdAt: string;
}

/** Bản rút gọn cho MEMBER: chỉ tên nhà cung cấp + kênh đích (không cấu hình, không trạng thái chi tiết). */
export interface IntegrationPublicView {
  id: string;
  provider: IntegrationProviderValue;
  providerKey: IntegrationProviderKey;
  externalName: string;
  target: TargetView;
}

/** Kết nối cá nhân — chỉ chủ tài khoản thấy (email Google là của chính họ). KHÔNG có token. */
export interface UserIntegrationView {
  id: string;
  provider: IntegrationProviderValue;
  providerKey: IntegrationProviderKey;
  accountLabel: string;
  calendarId: string;
  status: string;
  statusReason: string | null;
  createdAt: string;
}

export function presentIntegration(entity: IntegrationEntity, target: TargetView): IntegrationView {
  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    provider: entity.provider,
    providerKey: INTEGRATION_PROVIDER_TO_KEY[entity.provider],
    externalName: entity.externalName,
    scopes: entity.scopes,
    config: entity.config,
    supportedEvents: INTEGRATION_EVENT_TYPES[entity.provider],
    target,
    status: entity.status,
    statusReason: entity.statusReason,
    lastEventAt: entity.lastEventAt ? entity.lastEventAt.toISOString() : null,
    version: entity.version,
    createdBy: entity.createdBy,
    createdAt: entity.createdAt.toISOString(),
  };
}

export function presentPublicIntegration(entity: IntegrationEntity, target: TargetView): IntegrationPublicView {
  return { id: entity.id, provider: entity.provider, providerKey: INTEGRATION_PROVIDER_TO_KEY[entity.provider], externalName: entity.externalName, target };
}

export function presentUserIntegration(entity: UserIntegrationEntity): UserIntegrationView {
  return {
    id: entity.id,
    provider: entity.provider,
    providerKey: INTEGRATION_PROVIDER_TO_KEY[entity.provider],
    accountLabel: entity.externalAccountId,
    calendarId: entity.calendarId,
    status: entity.status,
    statusReason: entity.statusReason,
    createdAt: entity.createdAt.toISOString(),
  };
}
