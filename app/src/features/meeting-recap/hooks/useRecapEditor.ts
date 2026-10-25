import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { meetingRecapService } from '../api/meeting-recap.service';
import type { RecapDto } from '../api/meeting-recap.types';
import { applyRecap, usePublishRecap, useUpsertRecap } from '../queries/recap.queries';
import { errorCodeOf, isOfflineError, isVersionConflict, recapErrorMessage } from '../utils/recap-errors';

export interface RecapDraft {
  content: string;
  endedAt?: string;
  startedAt?: string;
}

const draftOf = (dto: RecapDto): RecapDraft => ({ content: dto.content, endedAt: dto.endedAt, startedAt: dto.startedAt });
const sameDraft = (a: RecapDraft, b: RecapDraft): boolean => a.content === b.content && a.startedAt === b.startedAt && a.endedAt === b.endedAt;

/**
 * Trạng thái trình soạn biên bản (app.md §3 `RecapEditorScreen`). Nháp chưa lưu CHỈ ở state màn này — không AsyncStorage (dữ liệu riêng
 * tư, app.md §5). `baseVersion` = phiên bản server LÚC bắt đầu sửa (CAS): người khác lưu chen giữa → 409 `RES_003` → `conflict` giữ
 * NGUYÊN bản đang nhập để người dùng chép lại, không bao giờ ghi đè im lặng.
 */
export function useRecapEditor(meetingId: string, initial: RecapDto) {
  const queryClient = useQueryClient();
  const upsert = useUpsertRecap(meetingId);
  const publishMutation = usePublishRecap(meetingId);
  const [draft, setDraft] = useState<RecapDraft>(() => draftOf(initial));
  const [saved, setSaved] = useState<RecapDraft>(() => draftOf(initial));
  const [baseVersion, setBaseVersion] = useState(initial.version);
  /** Bản của MÌNH lúc bị 409 — hiện ở khối "Bản của bạn" để chép lại/dùng lại. */
  const [mine, setMine] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<{ code: string | null; message: string } | null>(null);

  const dirty = !sameDraft(draft, saved);

  const fail = (err: unknown): null => {
    if (isVersionConflict(err)) {
      setMine(draft.content);
      setConflict(true);
    } else setError({ code: isOfflineError(err) ? 'OFFLINE' : errorCodeOf(err), message: recapErrorMessage(err) });
    return null;
  };

  const adopt = (dto: RecapDto, next: RecapDraft = draftOf(dto)) => {
    setBaseVersion(dto.version);
    setSaved(next);
  };

  /** Lưu nháp; trả bản server (hoặc `null` khi lỗi — lỗi đã nằm trong `error`/`conflict`). */
  const save = async (): Promise<RecapDto | null> => {
    setError(null);
    try {
      const dto = await upsert.mutateAsync({ ...draft, expectedVersion: initial.recapId === null && baseVersion === 0 ? undefined : baseVersion });
      adopt(dto, draft);
      return dto;
    } catch (err) {
      return fail(err);
    }
  };

  /** Lưu (nếu có thay đổi) rồi công bố với đúng phiên bản vừa lưu. */
  const publish = async (): Promise<RecapDto | null> => {
    let version = baseVersion;
    if (dirty || baseVersion === 0) {
      const stored = await save();
      if (!stored) return null;
      version = stored.version;
    }
    try {
      const dto = await publishMutation.mutateAsync(version);
      adopt(dto, draft);
      return dto;
    } catch (err) {
      return fail(err);
    }
  };

  /** "Xem bản mới" sau 409: nạp bản server vào ô soạn; bản của mình vẫn ở `mine` để chép/dùng lại (lần lưu sau là ghi đè CÓ CHỦ Ý). */
  const loadLatest = async (): Promise<void> => {
    try {
      const dto = await meetingRecapService.get(meetingId);
      applyRecap(queryClient, dto);
      adopt(dto);
      setDraft(draftOf(dto));
      setConflict(false);
    } catch (err) {
      fail(err);
    }
  };

  /** Gắn/gỡ tệp cũng tăng `version` ở server: nhận phiên bản mới CHỈ khi đó là thay đổi của chính mình (liền kề) — người khác chen giữa thì giữ bản cũ để lần lưu sau báo 409. */
  const adoptAttachment = (dto: RecapDto) => {
    applyRecap(queryClient, dto);
    if (baseVersion === 0 || dto.version === baseVersion + 1) setBaseVersion(dto.version);
  };

  return {
    adoptAttachment,
    baseVersion,
    conflict,
    dirty,
    draft,
    error,
    loadLatest,
    mine,
    publish,
    publishing: publishMutation.isPending,
    save,
    saving: upsert.isPending,
    setDraft: (patch: Partial<RecapDraft>) => setDraft((prev) => ({ ...prev, ...patch })),
    clearMine: () => setMine(null),
    restoreMine: () => {
      if (mine !== null) setDraft((prev) => ({ ...prev, content: mine }));
      setMine(null);
    },
  };
}

export type RecapEditor = ReturnType<typeof useRecapEditor>;
