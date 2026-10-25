import { useEffect, useState } from 'react';

import type { Portfolio, SlugUnavailableReason } from '../api/portfolio.types';
import { SLUG_CHECK_DEBOUNCE_MS, SLUG_REGEX } from '../constants/portfolio.constants';
import { useChangeSlug } from '../queries/portfolio.mutations';
import { useSlugAvailability } from '../queries/portfolio.queries';
import {
  isVersionConflict,
  portfolioErrorMessage,
  SLUG_INVALID_MESSAGE,
  VERSION_CONFLICT_MESSAGE,
} from '../utils/portfolio-errors';

export type SlugTone = 'error' | 'hint' | 'success';

export interface SlugStatus {
  /** Được phép bấm "Đổi đường dẫn": đã đổi, đúng dạng và server báo dùng được (hoặc không kiểm được — server sẽ kiểm lại lúc lưu). */
  canSave: boolean;
  message: string;
  tone: SlugTone;
}

const REASON_MESSAGES: Record<SlugUnavailableReason, string> = {
  BANNED: 'Đường dẫn chứa từ không được phép.',
  INVALID: SLUG_INVALID_MESSAGE,
  RESERVED: 'Đường dẫn này được dành riêng, hãy chọn đường dẫn khác.',
  TAKEN: 'Đã có người dùng đường dẫn này.',
};

export interface UseSlugFieldArgs {
  /** Slug đang lưu ở server. */
  current: string;
  /** `Portfolio.version` làm `expectedVersion` — do form hồ sơ giữ (đổi slug cũng tăng `version`). */
  version: number;
  onSaved: (portfolio: Portfolio) => void;
}

/**
 * Ô đường dẫn (app.md p6-07 §3 "Thông tin"): gõ xong 500 ms mới hỏi `slug-available` (BE giới hạn 60 lượt/phút) và CHỈ khi slug đã đúng dạng ở máy — sai dạng
 * thì báo ngay `PORT_002` mà không tốn lượt gọi. Trạng thái: Đang kiểm tra · Có thể dùng · Đã có người dùng · Chứa từ không được phép · Dành riêng.
 * Đổi slug KHÔNG đi cùng nút "Lưu" của form hồ sơ: đó là endpoint riêng (`PUT /me/portfolio/slug`) có hậu quả riêng (slug cũ chuyển hướng 30 ngày).
 */
export function useSlugField({ current, onSaved, version }: UseSlugFieldArgs) {
  const [text, setText] = useState(current);
  const [settledText, setSettledText] = useState(current);
  const [saveError, setSaveError] = useState<string | null>(null);
  const change = useChangeSlug();

  const slug = text.trim().toLowerCase();
  const changed = slug !== current;
  const wellFormed = SLUG_REGEX.test(slug);

  useEffect(() => {
    const timer = setTimeout(() => setSettledText(slug), SLUG_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [slug]);

  const settled = settledText === slug;
  const check = useSlugAvailability(slug, changed && wellFormed && settled);

  const status = ((): SlugStatus => {
    if (!changed)
      return { canSave: false, message: 'Đây là đường dẫn hiện tại của bạn.', tone: 'hint' };
    if (!wellFormed) return { canSave: false, message: REASON_MESSAGES.INVALID, tone: 'error' };
    if (!settled || check.isFetching)
      return { canSave: false, message: 'Đang kiểm tra…', tone: 'hint' };
    if (check.isError)
      return {
        canSave: true,
        message: 'Chưa kiểm tra được đường dẫn — máy chủ sẽ kiểm lại khi lưu.',
        tone: 'hint',
      };
    if (check.data?.available) return { canSave: true, message: 'Có thể dùng.', tone: 'success' };
    return {
      canSave: false,
      message: REASON_MESSAGES[check.data?.reason ?? 'TAKEN'],
      tone: 'error',
    };
  })();

  const save = async (): Promise<void> => {
    setSaveError(null);
    try {
      const saved = await change.mutateAsync({ expectedVersion: version, slug });
      onSaved(saved);
    } catch (error) {
      // `RES_003`: hồ sơ vừa đổi ở nơi khác — câu hướng dẫn tải lại, không phải lỗi của slug.
      setSaveError(
        isVersionConflict(error) ? VERSION_CONFLICT_MESSAGE : portfolioErrorMessage(error),
      );
    }
  };

  return { changed, pending: change.isPending, save, saveError, setText, status, text };
}
