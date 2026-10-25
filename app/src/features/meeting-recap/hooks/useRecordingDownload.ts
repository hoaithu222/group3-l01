import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { meetingRecordingService } from '../api/meeting-recap.service';
import { recapErrorMessage } from '../utils/recap-errors';
import { startRecordingDownload, type RecordingDownload } from '../utils/recording-files';

export interface RecordingDownloadState {
  /** 0..1 khi đang tải; `null` = không tải. */
  progress: number | null;
  recordingId: string | null;
}

const IDLE: RecordingDownloadState = { progress: null, recordingId: null };

/**
 * Tải bản ghi về máy (chỉ khi `myActions.canDownload` — chủ trì/đồng chủ trì/OWNER): xin URL `DOWNLOAD` (60 s, KHÔNG cache) rồi tải NGAY,
 * xong mở bảng chia sẻ (`expo-sharing`) để người dùng lưu. Một lượt tải tại một thời điểm; "Huỷ"/rời màn giữa chừng thì dừng + xoá bản dở
 * và KHÔNG báo lỗi. ⛔ Không xoá tệp ngay sau `shareAsync`: Android trả promise lúc intent vừa phát đi, xoá sớm là ứng dụng đích không đọc được.
 */
export function useRecordingDownload() {
  const [state, setState] = useState<RecordingDownloadState>(IDLE);
  const task = useRef<RecordingDownload | null>(null);
  /** Mã lượt tải đang chạy — huỷ = đặt `null`, mọi bước sau `await` của lượt cũ tự bỏ. */
  const running = useRef<number | null>(null);
  const seq = useRef(0);

  const cancel = useCallback(async () => {
    const current = task.current;
    running.current = null;
    task.current = null;
    setState(IDLE);
    await current?.cancel();
  }, []);

  useEffect(() => () => void cancel(), [cancel]);

  const download = useCallback(async (recordingId: string) => {
    if (running.current !== null) return;
    seq.current += 1;
    const token = seq.current;
    running.current = token;
    const alive = () => running.current === token;
    setState({ progress: 0, recordingId });
    try {
      const { url } = await meetingRecordingService.url(recordingId, 'DOWNLOAD');
      if (!alive()) return;
      task.current = startRecordingDownload(url, recordingId, (ratio) => {
        if (alive()) setState({ progress: ratio, recordingId });
      });
      const uri = await task.current.promise;
      if (!alive()) return;
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: 'Lưu bản ghi cuộc họp', mimeType: 'video/mp4' });
      else showToast('success', 'Đã tải bản ghi về máy.');
    } catch (error) {
      if (alive()) showToast('error', recapErrorMessage(error));
    } finally {
      if (alive()) {
        running.current = null;
        task.current = null;
        setState(IDLE);
      }
    }
  }, []);

  return { cancel, download, state };
}
