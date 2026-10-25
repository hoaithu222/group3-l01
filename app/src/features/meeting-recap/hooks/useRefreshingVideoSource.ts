import { useCallback, useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { meetingRecordingService } from '../api/meeting-recap.service';
import type { RecordingUrl } from '../api/meeting-recap.types';
import { isGoneError, isOfflineError, recapErrorMessage } from '../utils/recap-errors';

/** Số lần tự xin URL mới khi player báo lỗi — quá thì coi là lỗi thật (không phải hết hạn), tránh vòng lặp. */
export const MAX_RENEW_ATTEMPTS = 3;
/** Xin sẵn URL mới trước khi URL đang phát hết hạn — lỗi 403 giữa chừng thì thay ngay, không chờ mạng. */
const PREFETCH_BEFORE_MS = 60_000;
/** URL xin sẵn chỉ dùng khi còn hạn ít nhất chừng này. */
const MIN_VALIDITY_MS = 15_000;
/** `setTimeout` kẹp ở 2^31 ms — quá thì bắn NGAY (Android/iOS đều vậy). */
const MAX_TIMEOUT_MS = 2_000_000_000;

export type VideoSourceState =
  | { kind: 'error'; gone: boolean; message: string; offline: boolean }
  | { kind: 'loading' }
  | { kind: 'ready'; url: string };

const remainingMs = (u: RecordingUrl): number => new Date(u.expiresAt).getTime() - serverNowMs();
const errorState = (err: unknown): VideoSourceState => ({
  gone: isGoneError(err),
  kind: 'error',
  message: recapErrorMessage(err),
  offline: isOfflineError(err),
});

/**
 * Nguồn phát của MỘT bản ghi (app.md §3 `RecordingPlayerScreen`, §4.1 URL KHÔNG cache — `gcTime: 0`): xin `url?purpose=STREAM` (ký 900 s)
 * lúc mở; trước khi hết hạn 60 s xin sẵn URL mới; player báo lỗi (403 hết hạn giữa chừng) → `renew()` trả URL để `replaceAsync` giữ vị
 * trí phát. 404/`REC_005` → "đã bị xoá hoặc hết hạn"; mất mạng → "Kết nối để xem bản ghi". Giờ tính theo GIỜ SERVER (`serverNowMs`).
 */
export function useRefreshingVideoSource(recordingId: string | undefined) {
  const initial = useQuery({
    enabled: Boolean(recordingId),
    gcTime: 0,
    queryFn: () => meetingRecordingService.url(recordingId ?? '', 'STREAM'),
    queryKey: ['meetings', 'recording-url', recordingId ?? '', 'STREAM'],
    retry: (failureCount, error) => !isGoneError(error) && failureCount < 1,
    staleTime: Infinity,
  });
  /** Lỗi của lượt `renew` (player đã nạp URL đầu rồi mới hỏng) — đè lên trạng thái của lượt đầu. */
  const [renewError, setRenewError] = useState<VideoSourceState | null>(null);
  /** URL player đang dùng sau lần `renew` gần nhất (`null` = vẫn là URL đầu). */
  const [renewed, setRenewed] = useState<RecordingUrl | null>(null);
  const prefetched = useRef<RecordingUrl | null>(null);
  const attempts = useRef(0);
  const active = renewed ?? initial.data;

  // Xin sẵn URL mới 60 s trước khi URL ĐANG PHÁT hết hạn — hẹn lại mỗi lần đổi URL.
  useEffect(() => {
    if (!recordingId || !active) return undefined;
    const delay = Math.min(Math.max(0, remainingMs(active) - PREFETCH_BEFORE_MS), MAX_TIMEOUT_MS);
    const timer = setTimeout(() => {
      meetingRecordingService
        .url(recordingId, 'STREAM')
        .then((fresh) => {
          prefetched.current = fresh;
        })
        .catch(() => undefined);
    }, delay);
    return () => clearTimeout(timer);
  }, [active, recordingId]);

  /** Player lỗi → URL mới (dùng bản xin sẵn nếu còn hạn); `null` khi đã thử quá số lần hoặc bản ghi không còn (state chuyển `error`). */
  const renew = useCallback(async (): Promise<string | null> => {
    if (!recordingId) return null;
    if (attempts.current >= MAX_RENEW_ATTEMPTS) {
      setRenewError({ gone: false, kind: 'error', message: 'Không phát được bản ghi.', offline: false });
      return null;
    }
    attempts.current += 1;
    const cached = prefetched.current && remainingMs(prefetched.current) > MIN_VALIDITY_MS ? prefetched.current : null;
    prefetched.current = null;
    try {
      const fresh = cached ?? (await meetingRecordingService.url(recordingId, 'STREAM'));
      setRenewed(fresh);
      return fresh.url;
    } catch (err) {
      setRenewError(errorState(err));
      return null;
    }
  }, [recordingId]);

  /** "Thử lại" trên màn lỗi: xoá bộ đếm và xin lại từ đầu. */
  const reload = useCallback(() => {
    attempts.current = 0;
    setRenewError(null);
    setRenewed(null);
    void initial.refetch();
  }, [initial]);

  const state: VideoSourceState =
    renewError ??
    (initial.isError ? errorState(initial.error) : initial.data ? { kind: 'ready', url: initial.data.url } : { kind: 'loading' });

  return { reload, renew, state };
}
