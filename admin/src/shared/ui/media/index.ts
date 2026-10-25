/**
 * Ảnh và tệp
 *
 * Thêm component mới vào nhóm này thì thêm dòng export ở đây.
 */

export { default as Image } from './Image';
export type { ImageProps, ImageFit, ImageRounded } from './Image';
export type { ImageName } from '@/assets/image';

export { default as ImagePreview } from './ImagePreview';
export type { ImagePreviewProps, ImagePreviewSize, ImagePreviewRounded } from './ImagePreview';

export { default as ImageLightbox, ToolBtn as LightboxToolButton } from './ImageLightbox';
export type {
  ImageLightboxProps,
  ImageLightboxNavigation,
  ImageAnnotationConfig,
} from './ImageLightbox';

export { default as Upload } from './Upload';
export type { UploadProps } from './Upload';

export { default as Dropzone } from './Dropzone';
export type { DropzoneProps, DropzonePayload, DropzoneKind } from './Dropzone';

export { default as FileBadge } from './FileBadge';
export type { FileBadgeProps } from './FileBadge';

export { default as FileCard } from './FileCard';
export type { FileCardProps } from './FileCard';

export { default as FileList } from './FileList';
export type { FileListProps } from './FileList';

export { useUpload } from './useUpload';
export type { UseUploadOptions, UseUploadReturn } from './useUpload';

export type {
  UploadFile,
  UploadFileStatus,
  UploadVariant,
  UploadSize,
  UploadHandler,
  ValidationError,
  FileTypeStyle,
  UploadIconSlots,
} from './upload.types';

export type {
  DropzoneState,
  DropzoneSize,
  FileCardDensity,
  FileBadgeSkin,
  FileBadgeSize,
} from './upload.theme';

export {
  formatFileSize,
  getFileTypeStyle,
  isImageFile,
  matchesAccept,
  validateFile,
} from './upload.utils';
