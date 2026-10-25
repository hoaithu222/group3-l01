/**
 * useUpload — state hook quản lý danh sách file + lifecycle upload.
 *
 * Trách nhiệm:
 *  - Giữ ordered list `UploadFile[]` với id ổn định
 *  - Auto khởi tạo previewUrl (object URL) cho image, auto-revoke khi remove
 *  - Validate file (size + accept) trước khi push vào list
 *  - Optional `onUpload(file, { onProgress, signal })` → khi pass sẽ tự đẩy
 *    file qua handler ngay sau khi addFiles. Caller có thể skip để upload thủ công.
 *  - Hỗ trợ cancel mid-upload (AbortController per file)
 *  - retry / clear / replace
 *
 * Không phụ thuộc React Query — caller có thể wrap bằng useMutation tuỳ ý.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { UploadFile, UploadHandler, ValidationError } from './upload.types';
import { generateFileId, isImageFile, validateFile } from './upload.utils';

export interface UseUploadOptions {
  /** Initial files (vd. files đã upload trước đó để hiển thị) */
  initialFiles?: UploadFile[];
  multiple?: boolean;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  /** Handler upload thực tế. Pass undefined để pure-state mode. */
  onUpload?: UploadHandler;
  /** Tự động trigger upload khi file được add (default true nếu có onUpload) */
  autoUpload?: boolean;
  /** Callback khi 1 file kết thúc lifecycle (success hoặc error) */
  onFileSettled?: (file: UploadFile) => void;
  /** Callback khi file bị reject ở bước validation */
  onReject?: (rejections: { file: File; error: ValidationError }[]) => void;
}

export interface UseUploadReturn {
  files: UploadFile[];
  /** Push File[] mới — auto validate + auto upload nếu autoUpload=true */
  addFiles: (files: File[]) => UploadFile[];
  /** Xoá theo id (sẽ cancel nếu đang upload) */
  removeFile: (id: string) => void;
  /** Cancel upload đang chạy (giữ entry với status="paused") */
  cancelFile: (id: string) => void;
  /** Retry file lỗi hoặc paused */
  retryFile: (id: string) => void;
  /** Update file (partial merge) — hữu ích nếu caller upload thủ công */
  updateFile: (id: string, patch: Partial<UploadFile>) => void;
  /** Clear toàn bộ */
  clear: () => void;
  /** True nếu đang có ≥ 1 file uploading */
  isUploading: boolean;
}

export function useUpload(options: UseUploadOptions = {}): UseUploadReturn {
  const {
    initialFiles = [],
    multiple = true,
    accept,
    maxSize,
    maxFiles,
    onUpload,
    autoUpload = !!onUpload,
    onFileSettled,
    onReject,
  } = options;

  const [files, setFiles] = useState<UploadFile[]>(initialFiles);
  const abortMapRef = useRef(new Map<string, AbortController>());
  const previewMapRef = useRef(new Map<string, string>());
  // Ref "luôn mới" để callback không phải dựng lại theo state.
  //
  // ⛔ Gán trong useLayoutEffect, KHÔNG gán thẳng lúc render: ghi ref khi đang
  // render là hành vi không an toàn với concurrent rendering (React có thể bỏ
  // dở một lượt render rồi chạy lại) và bị rule `react-hooks/refs` chặn cứng.
  // Mọi chỗ đọc các ref này đều nằm trong event handler / hàm async — tức chạy
  // SAU commit — nên dời sang layout effect không đổi ngữ nghĩa.
  const filesRef = useRef(files);
  const onUploadRef = useRef(onUpload);
  const onFileSettledRef = useRef(onFileSettled);
  useLayoutEffect(() => {
    filesRef.current = files;
    onUploadRef.current = onUpload;
    onFileSettledRef.current = onFileSettled;
  });

  // Cleanup object URLs khi unmount.
  useEffect(() => {
    const map = previewMapRef.current;
    const aborts = abortMapRef.current;
    return () => {
      map.forEach((url) => URL.revokeObjectURL(url));
      map.clear();
      aborts.forEach((c) => c.abort());
      aborts.clear();
    };
  }, []);

  const patchFile = useCallback((id: string, patch: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const runUpload = useCallback(
    async (entry: UploadFile) => {
      const handler = onUploadRef.current;
      if (!handler || !entry.file) return;

      const controller = new AbortController();
      abortMapRef.current.set(entry.id, controller);
      patchFile(entry.id, { status: 'uploading', progress: 0, error: undefined });

      try {
        const url = await handler(entry.file, {
          onProgress: (pct) => patchFile(entry.id, { progress: pct }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const next: Partial<UploadFile> = {
          status: 'success',
          progress: 100,
          url,
        };
        patchFile(entry.id, next);
        onFileSettledRef.current?.({ ...entry, ...next });
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          patchFile(entry.id, { status: 'paused' });
          return;
        }
        const message = err instanceof Error ? err.message : 'Tải lên thất bại';
        const next: Partial<UploadFile> = { status: 'error', error: message };
        patchFile(entry.id, next);
        onFileSettledRef.current?.({ ...entry, ...next });
      } finally {
        abortMapRef.current.delete(entry.id);
      }
    },
    [patchFile],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return [];
      const rejections: { file: File; error: ValidationError }[] = [];
      const accepted: UploadFile[] = [];

      const remaining =
        maxFiles !== undefined
          ? Math.max(0, maxFiles - filesRef.current.length)
          : Number.POSITIVE_INFINITY;

      incoming.forEach((file, i) => {
        if (i >= remaining) {
          rejections.push({
            file,
            error: {
              code: 'too-many-files',
              message: `Vượt quá số lượng tối đa (${maxFiles})`,
            },
          });
          return;
        }
        const err = validateFile(file, { accept, maxSize });
        if (err) {
          rejections.push({ file, error: err });
          return;
        }
        const id = generateFileId();
        let previewUrl: string | undefined;
        if (isImageFile(file)) {
          previewUrl = URL.createObjectURL(file);
          previewMapRef.current.set(id, previewUrl);
        }
        accepted.push({
          id,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: autoUpload ? 'uploading' : 'pending',
          progress: 0,
          previewUrl,
        });
      });

      if (rejections.length > 0) onReject?.(rejections);
      if (accepted.length === 0) return [];

      setFiles((prev) => (multiple ? [...prev, ...accepted] : accepted.slice(0, 1)));

      if (autoUpload) {
        accepted.forEach((entry) => {
          void runUpload(entry);
        });
      }
      return accepted;
    },
    [accept, autoUpload, maxFiles, maxSize, multiple, onReject, runUpload],
  );

  const cleanupEntry = useCallback((id: string) => {
    const url = previewMapRef.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previewMapRef.current.delete(id);
    }
    abortMapRef.current.get(id)?.abort();
    abortMapRef.current.delete(id);
  }, []);

  const removeFile = useCallback(
    (id: string) => {
      cleanupEntry(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    },
    [cleanupEntry],
  );

  const cancelFile = useCallback((id: string) => {
    abortMapRef.current.get(id)?.abort();
  }, []);

  const retryFile = useCallback(
    (id: string) => {
      const entry = filesRef.current.find((f) => f.id === id);
      if (!entry) return;
      void runUpload(entry);
    },
    [runUpload],
  );

  const updateFile = useCallback(
    (id: string, patch: Partial<UploadFile>) => patchFile(id, patch),
    [patchFile],
  );

  const clear = useCallback(() => {
    filesRef.current.forEach((f) => cleanupEntry(f.id));
    setFiles([]);
  }, [cleanupEntry]);

  const isUploading = useMemo(() => files.some((f) => f.status === 'uploading'), [files]);

  return {
    files,
    addFiles,
    removeFile,
    cancelFile,
    retryFile,
    updateFile,
    clear,
    isUploading,
  };
}
