/**
 * Đường dẫn endpoint ví nhóm (p6-04 be.md §4) — nối sau `appConfig.apiBaseUrl`.
 * `grep` một lần ở đây là thấy hết mặt tiếp xúc backend của feature.
 */

const ws = (workspaceId: string) => `/workspaces/${workspaceId}`;

export const walletPath = (workspaceId: string) => `${ws(workspaceId)}/wallet`;
export const walletSummaryPath = (workspaceId: string) => `${walletPath(workspaceId)}/summary`;
export const walletRemindPath = (workspaceId: string) => `${walletPath(workspaceId)}/remind`;
export const walletExportPath = (workspaceId: string) => `${walletPath(workspaceId)}/export`;
export const walletPayeePath = (workspaceId: string, userId: string) =>
  `${walletPath(workspaceId)}/payees/${userId}/payment-info`;

export const workspaceExpensesPath = (workspaceId: string) => `${ws(workspaceId)}/expenses`;
export const expensePath = (expenseId: string) => `/expenses/${expenseId}`;
export const expenseAdjustmentsPath = (expenseId: string) =>
  `${expensePath(expenseId)}/adjustments`;

export const workspaceSettlementsPath = (workspaceId: string) => `${ws(workspaceId)}/settlements`;
export const settlementActionPath = (
  settlementId: string,
  action: 'cancel' | 'confirm' | 'reject',
) => `/settlements/${settlementId}/${action}`;

export const PAYMENT_PROFILES_PATH = '/me/payment-profiles';
export const paymentProfileDefaultPath = (profileId: string) =>
  `${PAYMENT_PROFILES_PATH}/${profileId}/default`;
export const paymentProfilePath = (profileId: string) => `${PAYMENT_PROFILES_PATH}/${profileId}`;

/**
 * Ba đường dẫn dưới đây thuộc module KHÁC (workspaces · members · conversations
 * · channels) — khai lại ở đây vì luật "không import chéo feature"
 * (`feature-structure.md`), cùng cách `boards`/`channels` đã làm.
 */
export const workspaceDetailPath = ws;
export const workspaceMembersPath = (workspaceId: string) => `${ws(workspaceId)}/members`;
export const workspaceChannelsPath = (workspaceId: string) => `${ws(workspaceId)}/channels`;
export const CONVERSATIONS_PATH = '/conversations';
