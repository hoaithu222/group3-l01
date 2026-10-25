import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  eligibleResourcesPath,
  scanCancelPath,
  scanPath,
  scanReportPath,
  scansPath,
  sectionContextPath,
  targetSectionsPath,
} from './plagiarism.api';
import type {
  CreateScanPayload,
  CursorPage,
  EligibleResource,
  PlagiarismSection,
  ScanReport,
  ScanStatus,
  ScanSummary,
  SectionContext,
} from './plagiarism.types';

const IDEMPOTENCY_HEADER = 'Idempotency-Key';

async function cursorList<T>(url: string, params: Record<string, unknown>): Promise<CursorPage<T>> {
  const response = await apiClient.get<{ data: T[]; meta: { nextCursor: string | null } }>(url, { params });
  return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
}

/** Quét trùng lặp nội bộ (p7-05 be.md §4). Mutation bật `skipErrorToast` — màn tự hiện lỗi đúng chỗ (PLAG_001..004). */
export const plagiarismService = {
  eligibleResources(wsId: string, params: { q?: string; folderId?: string; cursor?: string; limit?: number }): Promise<CursorPage<EligibleResource>> {
    return cursorList<EligibleResource>(eligibleResourcesPath(wsId), { limit: 20, ...params });
  },

  async createScan(wsId: string, payload: CreateScanPayload, idempotencyKey: string): Promise<{ scanId: string; status: ScanStatus; expiresAt: string }> {
    const response = await apiClient.post(scansPath(wsId), payload, {
      headers: { [IDEMPOTENCY_HEADER]: idempotencyKey },
      skipErrorToast: true,
    });
    return unwrapData(response);
  },

  scans(wsId: string, params: { status?: ScanStatus; cursor?: string; limit?: number }): Promise<CursorPage<ScanSummary>> {
    return cursorList<ScanSummary>(scansPath(wsId), { limit: 20, ...params });
  },

  async scan(scanId: string): Promise<ScanSummary> {
    return unwrapData<ScanSummary>(await apiClient.get(scanPath(scanId), { skipErrorToast: true }));
  },

  async cancelScan(scanId: string): Promise<{ status: ScanStatus }> {
    return unwrapData(await apiClient.post(scanCancelPath(scanId), {}, { skipErrorToast: true }));
  },

  async deleteScan(scanId: string): Promise<void> {
    await apiClient.delete(scanPath(scanId), { skipErrorToast: true });
  },

  async report(scanId: string): Promise<ScanReport> {
    return unwrapData<ScanReport>(await apiClient.get(scanReportPath(scanId), { skipErrorToast: true }));
  },

  sections(scanId: string, resourceId: string, params: { sourceResourceId?: string; cursor?: string; limit?: number }): Promise<CursorPage<PlagiarismSection>> {
    return cursorList<PlagiarismSection>(targetSectionsPath(scanId, resourceId), { limit: 20, ...params });
  },

  async context(scanId: string, sectionId: string): Promise<SectionContext> {
    return unwrapData<SectionContext>(await apiClient.get(sectionContextPath(scanId, sectionId), { skipErrorToast: true }));
  },
};
