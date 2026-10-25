import { isAxiosError } from 'axios';
import { useState } from 'react';

import { getErrorCode } from '@/core/api/client.helpers';

import type {
  IntegrationTargetScopeType,
  IntegrationView,
  UpdateIntegrationInput,
  WatchedResource,
} from '../api/integrations.types';
import { useUpdateIntegration } from '../queries/integrations.queries';

/** Nơi nhận vừa chọn (chưa lưu): kênh (`CHANNEL`) hoặc nhóm chat (`CONVERSATION`, luôn riêng tư). */
export interface TargetChoice {
  id: string;
  name: string;
  private: boolean;
  scopeType: IntegrationTargetScopeType;
}

/**
 * Bản nháp cấu hình một kết nối (repo · loại sự kiện · nơi nhận) và lưu có `expectedVersion`. Chỉ gửi phần ĐÃ đổi. `INT_005` gắn vào trường nơi nhận
 * (app.md §3 "lỗi tại trường kênh"); `RES_003` (409) → cờ `conflict` để màn hiện banner "đã đổi ở nơi khác" (cache đã được làm mới).
 * `targetScopeType` + `targetScopeId` luôn đi CÙNG NHAU (BE refine — thiếu một trong hai là 400).
 */
export function useIntegrationDraft(view: IntegrationView | undefined, wsId: string) {
  const [repos, setRepos] = useState<WatchedResource[] | null>(null);
  const [events, setEvents] = useState<string[] | null>(null);
  const [target, setTarget] = useState<TargetChoice | null>(null);
  const [targetError, setTargetError] = useState<string | undefined>();
  const [conflict, setConflict] = useState(false);
  const update = useUpdateIntegration(view?.id ?? '', wsId);

  const dirty = repos !== null || events !== null || target !== null;

  function reset(): void {
    setRepos(null);
    setEvents(null);
    setTarget(null);
    setTargetError(undefined);
  }

  function save(): void {
    if (!view || !dirty) return;
    const input: UpdateIntegrationInput = {
      expectedVersion: view.version,
      ...(repos ? { repos } : {}),
      ...(events ? { events } : {}),
      ...(target ? { targetScopeType: target.scopeType, targetScopeId: target.id } : {}),
    };
    setTargetError(undefined);
    setConflict(false);
    update.mutate(input, {
      onSuccess: reset,
      onError: (err) => {
        const code = isAxiosError(err) ? getErrorCode(err) : '';
        if (code === 'INT_005')
          setTargetError(
            'Không thể dùng nơi này để nhận thông báo — hãy chọn kênh hoặc nhóm chat bạn được gửi tin.',
          );
        if (code === 'RES_003') {
          setConflict(true);
          reset();
        }
      },
    });
  }

  return {
    repos: repos ?? view?.config.repos ?? [],
    events: events ?? view?.config.events ?? [],
    target,
    targetError,
    conflict,
    dirty,
    saving: update.isPending,
    setRepos,
    setEvents,
    setTarget: (t: TargetChoice) => {
      setTarget(t);
      setTargetError(undefined);
    },
    save,
    reset,
  };
}
