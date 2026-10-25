import { Spinner } from '@/shared/ui';

export const LazyLoadFallback = () => (
  <div className="flex min-h-dvh items-center justify-center bg-bg-base">
    <div className="flex flex-col items-center gap-4">
      <Spinner color="primary" />
      <span className="text-body-14 text-fg-3">Đang tải...</span>
    </div>
  </div>
);
