/** Đường dẫn endpoint capabilities — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). */
export const capabilitiesApi = {
  /** GET — cờ tính năng + hạn mức hiện hành của hệ thống. */
  get: '/capabilities',
} as const;
