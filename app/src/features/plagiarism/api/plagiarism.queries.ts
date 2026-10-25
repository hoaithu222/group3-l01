import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { plagiarismKeys } from './plagiarism.keys';
import { plagiarismService } from './plagiarism.service';
import type { CreateScanPayload, ScanStatus } from './plagiarism.types';

export function useEligibleResourcesInfinite(wsId: string, q: string | undefined, folderId: string | undefined) {
  return useInfiniteQuery({
    enabled: Boolean(wsId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => plagiarismService.eligibleResources(wsId, { q, folderId, cursor: pageParam }),
    queryKey: plagiarismKeys.eligible(wsId, q, folderId),
  });
}

export function useScansInfinite(wsId: string, status: ScanStatus | undefined) {
  return useInfiniteQuery({
    enabled: Boolean(wsId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => plagiarismService.scans(wsId, { status, cursor: pageParam }),
    queryKey: plagiarismKeys.scans(wsId, status),
  });
}

export function useScan(scanId: string) {
  return useQuery({
    enabled: Boolean(scanId),
    queryFn: () => plagiarismService.scan(scanId),
    queryKey: plagiarismKeys.scan(scanId),
    retry: false,
  });
}

/** Báo cáo/kết quả bất biến sau `COMPLETED` — `staleTime` dài (app.md §4). */
export function useReport(scanId: string, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(scanId),
    queryFn: () => plagiarismService.report(scanId),
    queryKey: plagiarismKeys.report(scanId),
    retry: false,
    staleTime: 10 * 60_000,
  });
}

export function useSectionsInfinite(scanId: string, resourceId: string, sourceResourceId: string | undefined) {
  return useInfiniteQuery({
    enabled: Boolean(scanId) && Boolean(resourceId),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => plagiarismService.sections(scanId, resourceId, { sourceResourceId, cursor: pageParam }),
    queryKey: plagiarismKeys.sections(scanId, resourceId, sourceResourceId),
  });
}

/** Nội dung tài liệu — KHÔNG cache lâu, KHÔNG persist ra ổ đĩa (app.md §4). */
export function useSectionContext(scanId: string, sectionId: string | null) {
  return useQuery({
    enabled: Boolean(scanId) && Boolean(sectionId),
    gcTime: 5 * 60_000,
    queryFn: () => plagiarismService.context(scanId, sectionId as string),
    queryKey: plagiarismKeys.context(scanId, sectionId ?? ''),
    staleTime: 0,
  });
}

export function useCreateScan(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { idempotencyKey: string; payload: CreateScanPayload }) => plagiarismService.createScan(wsId, vars.payload, vars.idempotencyKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: plagiarismKeys.scans(wsId, undefined) });
    },
  });
}

export function useCancelScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scanId: string) => plagiarismService.cancelScan(scanId),
    onSuccess: (_data, scanId) => {
      void qc.invalidateQueries({ queryKey: plagiarismKeys.scan(scanId) });
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'scans'] });
    },
  });
}

export function useDeleteScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scanId: string) => plagiarismService.deleteScan(scanId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['plagiarism', 'scans'] });
    },
  });
}
