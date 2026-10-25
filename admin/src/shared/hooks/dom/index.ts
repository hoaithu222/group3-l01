/**
 * Chạm API trình duyệt / DOM
 */

export { useClickOutside } from './useClickOutside';
export { useCopyToClipboard } from './useCopyToClipboard';
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsLaptop,
  useIsDesktop,
  useIsCoarsePointer,
  usePrefersReducedMotion,
} from './useMediaQuery';
export { useBeforeUnload } from './useBeforeUnload';
export { useMultiTabSync, useMultiTabBroadcaster } from './useMultiTabSync';
export { useNetworkStatus } from './useNetworkStatus';
export type { NetworkStatus } from './useNetworkStatus';
export { useDrawerResize } from './useDrawerResize';
export type { UseDrawerResizeParams, UseDrawerResizeReturn } from './useDrawerResize';
export { useElementSize } from './useElementSize';
export type { ElementSize } from './useElementSize';
export { useFullscreen } from './useFullscreen';
