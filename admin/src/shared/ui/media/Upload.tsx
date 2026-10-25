/**
 * Upload — kit2 dropzone + inline file picker.
 *
 * 2 variants (Figma node 1392:5648 + 1365:7530):
 *  - `dropzone` (default) — vùng dashed border, folder icon hero, button "Chọn file".
 *  - `inline` — input-like compact với prefix icon + label.
 *
 * Tính năng hiện đại:
 *  - Drag & drop với highlight state
 *  - Click root để mở file picker
 *  - `accept` (extension hoặc MIME wildcard) + `maxSize` + `maxFiles`
 *  - `multiple` — single hoặc multi files
 *  - Validation callback `onReject` cho file bị filter
 *  - Disabled / error state có style riêng
 *  - Keyboard accessible (Enter/Space → open dialog)
 *
 * KHÔNG quản lý state file list — caller dùng `useUpload` hook hoặc tự manage.
 * Upload chỉ emit `onFiles(File[])` khi user chọn xong.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { SystemIcon, type SystemIconName } from '@/shared/ui/icons/Icons';
import Button, { type ButtonVariant } from '@/shared/ui/actions/Button';
import Text from '@/shared/ui/primitives/Text';
import { cn } from '@/shared/utils/style/cn';
import type { UploadSize, UploadVariant, ValidationError } from './upload.types';
import { validateFile, formatFileSize } from './upload.utils';
import { readDirectoryDrop } from './drop.utils';
import { dropzoneStyles, inlineTriggerStyles, type DropzoneSize } from './upload.theme';

export interface UploadProps {
  variant?: UploadVariant;
  size?: UploadSize;
  /** Cho phép chọn nhiều file (default: false) */
  multiple?: boolean;
  /** Chọn cả thư mục (webkitdirectory) — file kèm `webkitRelativePath`. */
  directory?: boolean;
  /**
   * CHỈ cho kéo-thả thư mục, chặn kéo-thả tệp lẻ. File lẻ → `onReject`.
   * (Folder được đọc đệ quy qua FileSystemEntry, kèm `webkitRelativePath`.)
   */
  directoryOnly?: boolean;
  /** Accept string — extension (".pdf,.docx") hoặc MIME ("image/*,application/pdf") */
  accept?: string;
  /** Max size mỗi file (bytes). Pass `5 * 1024 ** 3` cho 5GB. */
  maxSize?: number;
  /** Max tổng số file user có thể giữ (validate ở caller — Upload chỉ giới hạn lần chọn) */
  maxFiles?: number;
  /** Số file đang có hiện tại — dùng để tính remaining khi multiple */
  currentCount?: number;
  /** Emit khi user chọn xong (đã pass validation) */
  onFiles?: (files: File[]) => void;
  /**
   * CHỈ với `directoryOnly` + KÉO-THẢ: đường dẫn mọi thư mục vừa thả, kể cả
   * thư mục RỖNG (không có file nào thì `onFiles` không bắn).
   *
   * ⚠️ KHÔNG bắn khi chọn bằng nút "Chọn thư mục": input `webkitdirectory` chỉ
   * trả về danh sách FILE, trình duyệt không hề báo thư mục rỗng — đó là giới
   * hạn của Web API, không phải thiếu sót ở đây.
   */
  onDirectories?: (folderPaths: string[]) => void;
  /** Emit khi file bị reject */
  onReject?: (rejections: { file: File; error: ValidationError }[]) => void;
  /** Hiển thị error text dưới component (form integration) */
  error?: string;
  disabled?: boolean;
  /** ─ Slots ─ */
  /** Override icon hero ở dropzone empty state */
  heroIcon?: ReactNode;
  /** Override title text (dropzone) */
  title?: ReactNode;
  /** Override description text (dropzone) */
  description?: ReactNode;
  /** Override label text (inline) */
  label?: ReactNode;
  /** Override icon prefix (inline) */
  prefixIcon?: ReactNode;
  /** Custom button label (dropzone) */
  buttonLabel?: string;
  /**
   * Kiểu nút cho `variant="button"` — mặc định `stroke` (viền, không tô đặc) để
   * nút chọn tệp không tranh nhấn với nút hành động chính của form.
   */
  buttonVariant?: ButtonVariant;
  /** Nút chiếm trọn bề ngang (`variant="button"`). */
  buttonFullWidth?: boolean;
  /** Custom trailing actions (inline) */
  trailing?: ReactNode;
  /** ─ DOM ─ */
  id?: string;
  name?: string;
  className?: string;
  /** Aria label cho accessibility (mặc định inferred từ title/label) */
  'aria-label'?: string;
  /**
   * Trỏ tới id của NHÃN thật đang hiện trên màn — ưu tiên hơn `aria-label` khi
   * cả hai cùng có (quy tắc tính tên trợ năng). Dùng khi nhãn đã được vẽ ở nơi
   * khác (vd `FormItem`), tránh phải chép lại chuỗi nhãn vào `aria-label`.
   */
  'aria-labelledby'?: string;
  /** id của dòng mô tả / dòng lỗi đi kèm. */
  'aria-describedby'?: string;
}

const DEFAULT_HERO_ICON: SystemIconName = 'folder-outline';
const DEFAULT_INLINE_ICON: SystemIconName = 'file-outline';

function buildAcceptDescription(accept?: string, maxSize?: number): string {
  const parts: string[] = [];
  if (maxSize) parts.push(`Tối đa ${formatFileSize(maxSize)}/tệp`);
  if (accept) parts.push(`Hỗ trợ ${accept.replace(/\s/g, '')}`);
  return parts.join(' - ');
}

const Upload = forwardRef<HTMLDivElement, UploadProps>(function Upload(
  {
    variant = 'dropzone',
    size = 'md',
    multiple = false,
    directory = false,
    directoryOnly = false,
    accept,
    maxSize,
    maxFiles,
    currentCount = 0,
    onFiles,
    onDirectories,
    onReject,
    error,
    disabled,
    heroIcon,
    title,
    description,
    label,
    prefixIcon,
    buttonLabel = 'Chọn file',
    buttonVariant = 'stroke',
    buttonFullWidth = false,
    trailing,
    id,
    name,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
  },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `upload-${reactId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // `webkitdirectory`/`directory` là attr ngoài type React → set trực tiếp lên
  // DOM (spread JSX không render ổn định) để folder picker hoạt động.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (directory) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    } else {
      el.removeAttribute('webkitdirectory');
      el.removeAttribute('directory');
    }
  }, [directory]);

  const openPicker = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const processFiles = useCallback(
    (fileList: FileList | File[] | null) => {
      if (!fileList || fileList.length === 0) return;
      const accepted: File[] = [];
      const rejected: { file: File; error: ValidationError }[] = [];

      const remainingSlots =
        maxFiles !== undefined ? Math.max(0, maxFiles - currentCount) : Number.POSITIVE_INFINITY;

      Array.from(fileList).forEach((file, index) => {
        if (index >= remainingSlots) {
          rejected.push({
            file,
            error: {
              code: 'too-many-files',
              message: `Vượt quá số lượng tối đa (${maxFiles})`,
            },
          });
          return;
        }
        const validation = validateFile(file, { accept, maxSize });
        if (validation) {
          rejected.push({ file, error: validation });
        } else {
          accepted.push(file);
        }
      });

      if (accepted.length > 0) onFiles?.(accepted);
      if (rejected.length > 0) onReject?.(rejected);
    },
    [accept, currentCount, maxFiles, maxSize, onFiles, onReject],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      processFiles(e.target.files);
      // reset để có thể chọn lại cùng file
      e.target.value = '';
    },
    [processFiles],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (!dragOver) setDragOver(true);
    },
    [disabled, dragOver],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (disabled) return;

      // Chỉ-thư-mục: chặn tệp lẻ, đọc đệ quy file trong các thư mục được thả.
      if (directoryOnly) {
        const { files, folderPaths, hasRootFile } = await readDirectoryDrop(e.dataTransfer);
        if (hasRootFile) {
          onReject?.([
            {
              file: new File([], ''),
              error: {
                code: 'file-invalid-type',
                message: 'Chỉ được kéo thả thư mục, không được kéo thả tệp',
              },
            },
          ]);
        }
        // Bắn TRƯỚC `processFiles`: thư mục rỗng không có file nào nên
        // `processFiles` sẽ không gọi `onFiles`, caller chỉ còn đường này để
        // biết người dùng vừa thả cái gì.
        if (folderPaths.length > 0) onDirectories?.(folderPaths);
        processFiles(files);
        return;
      }

      processFiles(e.dataTransfer.files);
    },
    [directoryOnly, disabled, onDirectories, onReject, processFiles],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPicker();
      }
    },
    [openPicker],
  );

  const stateKey = disabled ? 'disabled' : error ? 'error' : dragOver ? 'dragOver' : 'idle';

  const hiddenInput = (
    <input
      ref={inputRef}
      accept={accept}
      disabled={disabled}
      hidden
      id={inputId}
      // Chọn thư mục → multiple ngầm định; webkitdirectory set qua ref (useEffect).
      multiple={multiple || directory}
      name={name}
      type="file"
      onChange={handleInputChange}
    />
  );

  if (variant === 'button') {
    // Chỉ một `<Button>` kit2 — KHÔNG khung ô nhập. Dùng cho HÀNH ĐỘNG (quét
    // OCR, tải tệp lên); `inline` trông như ô để gõ nên không hợp vai đó.
    //
    // Vẫn nhận kéo-thả: nút là đích thả hợp lệ, và người dùng đã quen thả tệp
    // vào bất cứ chỗ nào trông có thể nhận tệp.
    const buttonText = label ?? buttonLabel;

    return (
      <div ref={ref} className={className}>
        <Button
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabel ?? (typeof buttonText === 'string' ? buttonText : 'Chọn file')}
          aria-labelledby={ariaLabelledBy}
          disabled={disabled}
          fullWidth={buttonFullWidth}
          size={size}
          startIcon={prefixIcon}
          type="button"
          variant={buttonVariant}
          onClick={openPicker}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {buttonText}
        </Button>
        {hiddenInput}
        {error ? (
          <Text className="mt-1 block" size="tiny" skin="error">
            {error}
          </Text>
        ) : null}
      </div>
    );
  }

  if (variant === 'inline') {
    const inlineState = disabled
      ? 'disabled'
      : error
        ? 'error'
        : currentCount > 0
          ? 'filled'
          : 'idle';
    const inlineSlots = inlineTriggerStyles({ state: inlineState, size });
    const computedLabel =
      label ?? (currentCount > 0 ? `${currentCount} tệp đã chọn` : 'Tải file lên');

    return (
      <div ref={ref} className={className}>
        <div
          aria-describedby={ariaDescribedBy}
          aria-disabled={disabled || undefined}
          aria-label={
            ariaLabel ?? (typeof computedLabel === 'string' ? computedLabel : 'Chọn file')
          }
          aria-labelledby={ariaLabelledBy}
          className={inlineSlots.root()}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={openPicker}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onKeyDown={handleKeyDown}
        >
          <span className={inlineSlots.icon()}>
            {prefixIcon ?? <SystemIcon name={DEFAULT_INLINE_ICON} size={16} />}
          </span>
          <span className={inlineSlots.label()}>{computedLabel}</span>
          {trailing ? <span className={inlineSlots.trailing()}>{trailing}</span> : null}
        </div>
        {hiddenInput}
        {error ? (
          <Text className="mt-1 block" size="tiny" skin="error">
            {error}
          </Text>
        ) : null}
      </div>
    );
  }

  const dropzoneSize = size as DropzoneSize;
  const slots = dropzoneStyles({ state: stateKey, size: dropzoneSize });
  const computedDescription = description ?? (buildAcceptDescription(accept, maxSize) || null);
  const computedTitle = title ?? 'Tải lên từ máy tính, kéo hoặc thả tệp';

  return (
    <div ref={ref} className={className}>
      <div
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel ?? (typeof computedTitle === 'string' ? computedTitle : 'Chọn file')}
        aria-labelledby={ariaLabelledBy}
        className={slots.root()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
      >
        <span aria-hidden className={slots.glow({ class: cn(dragOver && 'opacity-100') })} />
        <span className={slots.hero()}>
          {heroIcon ?? (
            <SystemIcon
              name={DEFAULT_HERO_ICON}
              size={size === 'lg' ? 48 : size === 'sm' ? 32 : 40}
            />
          )}
        </span>
        <div className="flex flex-col items-center gap-1">
          <p className={slots.title()}>{computedTitle}</p>
          {computedDescription ? (
            <p className={slots.description()}>{computedDescription}</p>
          ) : null}
        </div>
        <div className={slots.actions()}>
          <Button
            disabled={disabled}
            size="md"
            skin="neutral"
            type="button"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              openPicker();
            }}
          >
            {buttonLabel}
          </Button>
        </div>
      </div>
      {hiddenInput}
      {error ? (
        <Text className="mt-1 block" size="tiny" skin="error">
          {error}
        </Text>
      ) : null}
    </div>
  );
});

export default Upload;
