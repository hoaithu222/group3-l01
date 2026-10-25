/** Đường dẫn endpoint p5-03 (be.md §4, khớp `be/src/modules/integrations/integrations.routes.ts`) — nối sau `appConfig.apiBaseUrl`. */

export const PROVIDERS_PATH = '/integrations/providers';
export const ME_INTEGRATIONS_PATH = '/me/integrations';
export const CONNECT_CALENDAR_PATH = '/me/integrations/google-calendar/connect';

export function workspaceIntegrationsPath(wsId: string): string {
  return `/workspaces/${wsId}/integrations`;
}

export function connectPath(wsId: string, providerKey: string): string {
  return `/workspaces/${wsId}/integrations/${providerKey}/connect`;
}

export function integrationPath(id: string): string {
  return `/integrations/${id}`;
}

export function resourcesPath(id: string): string {
  return `/integrations/${id}/resources`;
}

export function eventsPath(id: string): string {
  return `/integrations/${id}/events`;
}

export function replayPath(id: string, eventId: string): string {
  return `/integrations/${id}/events/${eventId}/replay`;
}

export function meIntegrationPath(id: string): string {
  return `/me/integrations/${id}`;
}

/** Kênh của nhóm để chọn nơi nhận — gọi THẲNG endpoint của p1-03 (không import `features/channels`). */
export function workspaceChannelsPath(wsId: string): string {
  return `/workspaces/${wsId}/channels`;
}

/** Nhóm chat (GROUP) của tôi — endpoint của p1-05 (`be/src/modules/conversations`), lọc theo nhóm bằng query `workspaceId`; không import `features/conversations`. */
export const CONVERSATIONS_PATH = '/conversations';
