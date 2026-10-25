import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { meetingRecordingService } from '../api/meeting-recap.service';
import { MAX_RENEW_ATTEMPTS, useRefreshingVideoSource } from '../hooks/useRefreshingVideoSource';
import { apiError, makeQueryClient } from './helpers';

/** Nguồn phát bản ghi (app.md §3 `RecordingPlayerScreen`, RR-15): URL ký STREAM, player lỗi (403 hết hạn) → xin URL mới; quá số lần → lỗi thật. */
jest.mock('../api/meeting-recap.service', () => ({ meetingRecapService: {}, meetingRecordingService: { url: jest.fn() } }));

const url = jest.mocked(meetingRecordingService.url);
const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

async function setup(recordingId = 'rec-1') {
  const client = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = await renderHook(() => useRefreshingVideoSource(recordingId), { wrapper });
  await flush();
  return hook;
}

beforeEach(() => jest.clearAllMocks());

describe('useRefreshingVideoSource', () => {
  it('xin URL STREAM lúc mở; player lỗi (URL hết hạn giữa chừng) → renew() trả URL MỚI để replace, không dựng lại player', async () => {
    url.mockResolvedValueOnce({ expiresAt: inFuture(900_000), mime: 'video/mp4', url: 'https://s3/rec?sig=1' });
    const { result } = await setup();
    expect(result.current.state).toEqual({ kind: 'ready', url: 'https://s3/rec?sig=1' });
    expect(url).toHaveBeenCalledWith('rec-1', 'STREAM');

    url.mockResolvedValueOnce({ expiresAt: inFuture(900_000), mime: 'video/mp4', url: 'https://s3/rec?sig=2' });
    let fresh: string | null = null;
    await act(async () => {
      fresh = await result.current.renew();
    });
    expect(fresh).toBe('https://s3/rec?sig=2');
    expect(result.current.state).toEqual({ kind: 'ready', url: 'https://s3/rec?sig=1' }); // nguồn ĐẦU giữ nguyên — player tự replace
  });

  it(`lỗi liên tiếp quá ${String(MAX_RENEW_ATTEMPTS)} lần → "Không phát được bản ghi" (không lặp vô hạn); "Thử lại" xin lại từ đầu`, async () => {
    url.mockResolvedValue({ expiresAt: inFuture(900_000), mime: 'video/mp4', url: 'https://s3/rec?sig=x' });
    const { result } = await setup();
    for (let i = 0; i < MAX_RENEW_ATTEMPTS; i += 1) await act(async () => void (await result.current.renew()));
    let last: string | null = 'chưa';
    await act(async () => {
      last = await result.current.renew();
    });
    expect(last).toBeNull();
    expect(result.current.state).toMatchObject({ gone: false, kind: 'error', message: 'Không phát được bản ghi.' });

    await act(async () => result.current.reload());
    await flush();
    expect(result.current.state).toMatchObject({ kind: 'ready' });
  });

  it('bản ghi đã xoá/hết hạn (404 REC_005) → trạng thái "gone" (màn nói "Bản ghi đã bị xoá hoặc hết hạn"), không thử lại', async () => {
    url.mockRejectedValue(apiError(404, 'REC_005'));
    const { result } = await setup();
    expect(result.current.state).toMatchObject({ gone: true, kind: 'error' });
    expect(url).toHaveBeenCalledTimes(1);
  });

  it('mất mạng khi xin URL → thử lại MỘT lần rồi offline (màn nói "Kết nối mạng để xem bản ghi")', async () => {
    url.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    const { result } = await setup();
    await waitFor(() => expect(result.current.state).toMatchObject({ kind: 'error', offline: true }), { timeout: 3000 });
    expect(url).toHaveBeenCalledTimes(2);
  });
});
