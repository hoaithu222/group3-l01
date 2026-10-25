/**
 * FileField — RHF-aware wrapper trên `Upload` + `FileList` (kit2 upload system).
 *
 * Value shape:
 *   - `multiple === false`: `UploadedFile | null`
 *   - `multiple === true` : `UploadedFile[]`
 *
 * Field auto manages: validate, drag-drop, progress, error, retry, remove.
 * Pass `onUpload(file, { onProgress, signal })` để upload thực tế.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import FormItem from '../FormItem';
import { useFormField } from '../hooks/useFormField';
import { useFieldA11y } from '../hooks/useFieldA11y';
import Upload from '@/shared/ui/media/Upload';
import FileList from '@/shared/ui/media/FileList';
import { useUpload } from '@/shared/ui/media/useUpload';
import type { UploadFile, UploadHandler, UploadVariant } from '@/shared/ui/media/upload.types';
import type { FileCardVariant } from '@/shared/ui/media/upload.theme';

export interface UploadedFile {
  id?: string;
  name: string;
  url: string;
  size?: number;
}

export interface FileFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
  className?: string;
  /** Upload variant (default: dropzone) */
  variant?: UploadVariant;
  /** Kiểu file đã tải: `detailed` (badge+meta, mặc định) · `simple` (paperclip+tên). */
  fileCardVariant?: FileCardVariant;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  /** maxSize in MB */
  maxSize?: number;
  /** Handler upload — nếu không pass sẽ chỉ preview object URL */
  onUpload?: UploadHandler;
  /** Override label trên FileList */
  filesTitle?: string;
}

function toUploadedFile(file: UploadFile): UploadedFile {
  return {
    id: file.id,
    name: file.name,
    url: file.url ?? file.previewUrl ?? '',
    size: file.size,
  };
}

function fromUploadedFile(item: UploadedFile): UploadFile {
  return {
    id: item.id ?? item.url,
    name: item.name,
    size: item.size ?? 0,
    type: '',
    status: 'success',
    progress: 100,
    url: item.url,
  };
}

function FileField({
  name,
  label,
  required,
  description,
  disabled,
  className,
  variant = 'dropzone',
  fileCardVariant,
  accept,
  multiple = false,
  maxFiles,
  maxSize = 10,
  onUpload,
  filesTitle,
}: FileFieldProps) {
  const { field, fieldState, readOnly } = useFormField(name);
  const { setError, clearErrors } = useFormContext();
  const error = fieldState.error?.message;
  const a11y = useFieldA11y({ label, description, error });

  const initialValue = field.value;
  const initialFiles = useMemo<UploadFile[]>(() => {
    if (!initialValue) return [];
    if (Array.isArray(initialValue)) return (initialValue as UploadedFile[]).map(fromUploadedFile);
    return [fromUploadedFile(initialValue as UploadedFile)];
  }, [initialValue]);

  const { files, addFiles, removeFile, cancelFile, retryFile } = useUpload({
    initialFiles,
    multiple,
    accept,
    maxSize: maxSize * 1024 * 1024,
    maxFiles,
    onUpload,
    autoUpload: !!onUpload,
    onReject: (rejections) => {
      if (rejections[0]) setError(name, { message: rejections[0].error.message });
    },
    onFileSettled: (settled) => {
      if (settled.status !== 'success') return;
      clearErrors(name);
    },
  });

  // Sync field value với files list — chỉ giữ file đã upload thành công.
  useEffect(() => {
    const successFiles = files.filter((f) => f.status === 'success').map(toUploadedFile);
    if (multiple) {
      field.onChange(successFiles);
    } else {
      field.onChange(successFiles[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, multiple]);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      clearErrors(name);
      addFiles(incoming);
    },
    [addFiles, clearErrors, name],
  );

  if (readOnly) {
    const list = Array.isArray(initialValue)
      ? (initialValue as UploadedFile[])
      : initialValue
        ? [initialValue as UploadedFile]
        : [];
    return (
      <FormItem className={className} label={label}>
        {list.length ? (
          <div className="flex flex-col gap-1">
            {list.map((f) => (
              <a
                key={f.url}
                className="text-body-14 text-primary-5 hover:underline"
                href={f.url}
                rel="noreferrer"
                target="_blank"
              >
                {f.name}
              </a>
            ))}
          </div>
        ) : (
          <span className="text-body-14 text-fg-4">—</span>
        )}
      </FormItem>
    );
  }

  return (
    <FormItem
      {...a11y.item}
      className={className}
      description={description}
      error={error}
      label={label}
      required={required}
    >
      <div className="flex flex-col gap-3">
        <Upload
          accept={accept}
          aria-describedby={a11y.trigger['aria-describedby']}
          aria-labelledby={a11y.trigger['aria-labelledby']}
          currentCount={files.length}
          disabled={disabled}
          maxFiles={maxFiles}
          maxSize={maxSize * 1024 * 1024}
          multiple={multiple}
          variant={variant}
          onFiles={handleFiles}
          onReject={(rejections) => {
            if (rejections[0]) setError(name, { message: rejections[0].error.message });
          }}
        />
        {files.length > 0 ? (
          <FileList
            density="cozy"
            disabled={disabled}
            files={files}
            title={filesTitle}
            variant={fileCardVariant}
            onCancel={(f) => cancelFile(f.id)}
            onRemove={(f) => removeFile(f.id)}
            onRetry={(f) => retryFile(f.id)}
          />
        ) : null}
      </div>
    </FormItem>
  );
}

export default FileField;
