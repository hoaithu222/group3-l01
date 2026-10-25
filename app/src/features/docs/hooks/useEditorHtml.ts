import { useEffect, useState } from 'react';

import { logger } from '@/shared/utils/logger';

import { loadEditorHtml } from '../utils/load-editor-html';

export type EditorHtmlState =
  { status: 'error' } | { status: 'loading' } | { html: string; status: 'ready' };

/** Nạp HTML bundle soạn thảo (một lần, có đệm) — `attempt` đổi (nút "Thử lại") thì nạp lại. Lỗi → `error`, không ném. */
export function useEditorHtml(attempt = 0): EditorHtmlState {
  const [result, setResult] = useState<{ attempt: number; html: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEditorHtml().then(
      (html) => {
        if (!cancelled) setResult({ attempt, html });
      },
      (error: unknown) => {
        logger.warn('[docs] Không nạp được editor.html', error);
        if (!cancelled) setResult({ attempt, html: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (result?.attempt !== attempt) return { status: 'loading' };
  return result.html ? { html: result.html, status: 'ready' } : { status: 'error' };
}
