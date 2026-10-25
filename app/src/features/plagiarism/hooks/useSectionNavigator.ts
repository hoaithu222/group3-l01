import { useMemo, useState } from 'react';

import type { PlagiarismSection } from '../api/plagiarism.types';

/**
 * Đoạn trước/sau, giữ vị trí khi xoay màn/đổi bố cục (app.md `useSectionNavigator`) — chỉ giữ `sectionId` đang chọn (KHÔNG
 * giữ chỉ số), tự tra lại vị trí mỗi lần render từ danh sách `sections` hiện có. Chưa chọn gì thì mặc định đoạn đầu tiên.
 */
export function useSectionNavigator(sections: PlagiarismSection[]) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const index = useMemo(() => {
    if (sectionId === null) return sections.length > 0 ? 0 : -1;
    const found = sections.findIndex((s) => s.id === sectionId);
    return found >= 0 ? found : sections.length > 0 ? 0 : -1;
  }, [sections, sectionId]);

  const current = index >= 0 ? sections[index] : null;

  const next = index >= 0 && index < sections.length - 1 ? sections[index + 1] : undefined;
  const prev = index > 0 ? sections[index - 1] : undefined;

  return {
    goNext: next ? () => setSectionId(next.id) : undefined,
    goPrev: prev ? () => setSectionId(prev.id) : undefined,
    position: current ? `${index + 1}/${sections.length}` : '',
    section: current,
    selectSection: setSectionId,
  };
}
