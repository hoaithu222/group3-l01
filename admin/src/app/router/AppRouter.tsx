import { RouterProvider } from 'react-router-dom';

import { router } from './create-router';

/**
 * Điểm gắn router vào cây React.
 *
 * File này CHỈ export component. Thực thể `router` nằm ở `create-router.tsx`
 * vì `createBrowserRouter()` trả về một object, không phải component — để
 * chung một file làm vỡ Fast Refresh (`react-refresh/only-export-components`).
 */
export const AppRouter = () => <RouterProvider router={router} />;
