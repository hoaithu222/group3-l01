import { Suspense, type LazyExoticComponent, type ComponentType } from 'react';
import { LazyErrorBoundary } from './LazyErrorBoundary';
import { LazyLoadFallback } from './LazyLoadFallback';

export interface LazyLoadProps {
  component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
}

export function LazyLoad({ component: LazyComponent }: LazyLoadProps) {
  return (
    <LazyErrorBoundary>
      <Suspense fallback={<LazyLoadFallback />}>
        <LazyComponent />
      </Suspense>
    </LazyErrorBoundary>
  );
}
