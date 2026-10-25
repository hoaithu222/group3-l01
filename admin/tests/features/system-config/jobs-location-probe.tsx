import { useLocation } from 'react-router-dom';

/**
 * In ra `pathname + search` hiện tại (`data-testid="location"`) để bài kiểm đọc
 * URL mà không cần mock router. Đứng riêng một file vì
 * `react-refresh/only-export-components` cấm trộn export component với hàm.
 */
export default function JobsLocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}
