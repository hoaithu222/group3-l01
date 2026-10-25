import { useCallback, useState } from 'react';

import { useDisclosure } from './useDisclosure';

interface UseDeleteWithConfirmOptions {
  /** Caller-supplied delete operation; receives the pending id. */
  onConfirm: (id: number) => Promise<void>;
}

interface UseDeleteWithConfirmReturn {
  isOpen: boolean;
  pendingId: number | null;
  pendingName: string;
  isDeleting: boolean;
  requestDelete: (id: number, name: string) => void;
  confirm: () => Promise<void>;
  cancel: () => void;
}

/**
 * Composable confirm-then-delete pattern. Caller renders ConfirmDialog with
 * `isOpen`, `pendingName`, then wires `confirm` to dialog's onConfirm and
 * `cancel` to onCancel. Pending id snapshots at request time so list refetches
 * cannot drift the target.
 */
export const useDeleteWithConfirm = (
  options: UseDeleteWithConfirmOptions,
): UseDeleteWithConfirmReturn => {
  const { onConfirm } = options;
  const { isOpen, open, close } = useDisclosure();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const reset = useCallback(() => {
    setPendingId(null);
    setPendingName('');
  }, []);

  const requestDelete = useCallback(
    (id: number, name: string) => {
      setPendingId(id);
      setPendingName(name);
      open();
    },
    [open],
  );

  const confirm = useCallback(async () => {
    if (pendingId == null) return;
    setIsDeleting(true);
    try {
      await onConfirm(pendingId);
      close();
      reset();
    } finally {
      setIsDeleting(false);
    }
  }, [pendingId, onConfirm, close, reset]);

  const cancel = useCallback(() => {
    close();
    reset();
  }, [close, reset]);

  return {
    isOpen,
    pendingId,
    pendingName,
    isDeleting,
    requestDelete,
    confirm,
    cancel,
  };
};
