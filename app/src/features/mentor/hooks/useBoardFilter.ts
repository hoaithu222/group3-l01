import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import type { MentorFeedFilter } from '../api/mentor.types';

const DEBOUNCE_MS = 300;

/**
 * Bộ lọc bảng tin giữ trong URL params (`?q=&skills=a,b` — app.md §5, deep link được). Ô tìm gõ vào state cục bộ rồi mới đẩy
 * lên URL sau 300 ms (gửi server, không lọc tại chỗ); ⛔ không ghi ngược vào `SearchInput` (uncontrolled — tránh mất dấu IME).
 */
export function useBoardFilter() {
  const params = useLocalSearchParams<{ q?: string; skills?: string }>();
  const [draftQ, setDraftQ] = useState(params.q ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.q ?? '') !== draftQ.trim()) router.setParams({ q: draftQ.trim() || undefined });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQ, params.q]);

  const skills = useMemo(
    () => (params.skills ? params.skills.split(',').filter(Boolean) : []),
    [params.skills],
  );
  const filter = useMemo<MentorFeedFilter>(
    () => ({ q: params.q || undefined, skills }),
    [params.q, skills],
  );

  return {
    clear: () => {
      setDraftQ('');
      router.setParams({ q: undefined, skills: undefined });
    },
    filter,
    initialQ: params.q ?? '',
    setQuery: setDraftQ,
    setSkills: (next: string[]) =>
      router.setParams({ skills: next.length ? next.join(',') : undefined }),
    skills,
  };
}
