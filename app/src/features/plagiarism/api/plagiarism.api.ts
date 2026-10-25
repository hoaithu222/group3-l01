/**
 * Đường dẫn endpoint Quét trùng lặp nội bộ (p7-05 be.md §4) — nối sau `appConfig.apiBaseUrl`.
 */

export const eligibleResourcesPath = (wsId: string) => `/workspaces/${wsId}/plagiarism/eligible-resources`;
export const scansPath = (wsId: string) => `/workspaces/${wsId}/plagiarism/scans`;
export const scanPath = (scanId: string) => `/plagiarism/scans/${scanId}`;
export const scanReportPath = (scanId: string) => `${scanPath(scanId)}/report`;
export const scanCancelPath = (scanId: string) => `${scanPath(scanId)}/cancel`;
export const targetSectionsPath = (scanId: string, resourceId: string) => `${scanPath(scanId)}/targets/${resourceId}/sections`;
export const sectionContextPath = (scanId: string, sectionId: string) => `${scanPath(scanId)}/sections/${sectionId}/context`;
