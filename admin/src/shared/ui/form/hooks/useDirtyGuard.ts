import { useBlocker } from 'react-router-dom';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

interface UseDirtyGuardOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  /** Set false to disable blocking. */
  enabled?: boolean;
}

/**
 * Blocks navigation when the form has unsaved changes.
 * Returns `{ isBlocked, proceed, cancel }` to power a confirmation dialog.
 *
 * Must be used inside a react-router DATA router (`useBlocker`). Hook này luôn đăng ký một blocker,
 * kể cả khi `enabled=false` — và router chỉ hỏi blocker đăng ký SAU CÙNG — nên chỉ gọi nó khi thực sự
 * cần chặn (`<Form dirtyGuard>` mount `FormDirtyGuard` đúng lúc đó, không gọi vô điều kiện).
 */
export function useDirtyGuard<T extends FieldValues>({
  form,
  enabled = true,
}: UseDirtyGuardOptions<T>) {
  // ⛔ Đọc `isDirty` NGAY TRONG render, không đọc lười bên trong callback của blocker: `formState` của
  // react-hook-form là Proxy, chỉ thuộc tính được đọc lúc render mới được theo dõi/tính. Đọc muộn
  // (trong callback) luôn ra `false` nếu chẳng component nào khác đọc `isDirty` — guard không bao giờ chặn.
  const isDirty = form.formState.isDirty;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      enabled && isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  return {
    isBlocked: blocker.state === 'blocked',
    proceed: () => blocker.proceed?.(),
    cancel: () => blocker.reset?.(),
  };
}
