import { appConfig } from '@/core/config/env.config';
import { useBreakpoint } from '@/shared/theme';

import { locationsService } from '../api/locations.service';
import { makeNear } from './o2o-test-utils';

/**
 * Đồ dùng chung của các test màn "Địa điểm & in ấn" (`LocationMapScreen.*.test.tsx`). KHÔNG phải test.
 * ⚠️ `jest.mock(...)` KHÔNG đặt ở đây được (hoist theo từng file test) — mỗi file test tự khai bộ mock giống nhau.
 */
export const location = jest.requireMock('expo-location') as {
  deniedPermission: object;
  getCurrentPositionAsync: jest.Mock;
  getForegroundPermissionsAsync: jest.Mock;
  requestForegroundPermissionsAsync: jest.Mock;
  resetLocationMock: () => void;
};
export const mapbox = jest.requireMock('@rnmapbox/maps') as {
  cameraMethods: Record<string, jest.Mock>;
  resetMapboxMock: () => void;
};
export const near = jest.mocked(locationsService.near);
const mockedBreakpoint = jest.mocked(useBreakpoint);

export const UNDETERMINED = {
  status: 'undetermined',
  granted: false,
  canAskAgain: true,
  expires: 'never',
};
export const SAIGON = { coords: { latitude: 10.762, longitude: 106.66 }, timestamp: 1 };
export const CAFE = makeNear();
export const PRINT = makeNear({
  id: 'loc-2',
  name: 'In nhanh Bách Khoa',
  type: 'PRINT_SHOP',
  distanceM: 1200,
  openNow: false,
  ratingAvg: 0,
  ratingCount: 0,
  noiseAvg: 0,
  amenities: ['printer'],
  shop: { id: 'shop-1', displayName: 'In nhanh Bách Khoa', acceptingOrders: true },
});

export function phone(isTablet = false) {
  mockedBreakpoint.mockReturnValue({ isTablet } as ReturnType<typeof useBreakpoint>);
}

let restoreToken: (() => void) | undefined;
/** Có token Mapbox (cho `useMapSupport` ra `ready` với mock module native). Gỡ bằng `restoreMapMocks` ở `afterEach`. */
export function withMapbox() {
  restoreToken = jest.replaceProperty(appConfig, 'mapboxToken', 'pk.test-token').restore;
}

export function resetMapMocks() {
  jest.clearAllMocks();
  location.resetLocationMock();
  mapbox.resetMapboxMock();
  near.mockResolvedValue([CAFE, PRINT]);
  phone();
}

export function restoreMapMocks() {
  restoreToken?.();
  restoreToken = undefined;
}
