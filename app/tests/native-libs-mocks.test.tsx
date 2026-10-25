import fs from 'node:fs';
import path from 'node:path';
import { createRef } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as ScreenOrientation from 'expo-screen-orientation';
import Mapbox, { Camera, MapView, StyleURL } from '@rnmapbox/maps';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import * as SkiaModule from '@shopify/react-native-skia';
import { Canvas, Path, Skia, StrokeCap } from '@shopify/react-native-skia';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import WebView from 'react-native-webview';

import { messagingMock, resetMessagingMock } from '../__mocks__/@react-native-firebase/messaging';
import { mapMethods, mapboxStatics, resetMapboxMock } from '../__mocks__/@rnmapbox/maps';
import { resetLocationMock } from '../__mocks__/expo-location';
import { resetScreenOrientationMock } from '../__mocks__/expo-screen-orientation';
import { resetWebViewMock, webViewMethods } from '../__mocks__/react-native-webview';

/**
 * Bảo hành cho các bản mock gói native thêm ở "W1-APP-NATIVE-CONFIG" (`__mocks__/`, đăng ký ở `jest.setup.js`) và cho việc `yjs`/`y-protocols`/
 * `@hocuspocus/provider` chạy được trong Jest. Không test tính năng — chỉ chứng minh: nạp được, mặc định đúng, cách dùng ghi ở đầu từng mock chạy thật.
 * Lane dùng các gói này (docs, whiteboard, o2o, portfolio, live quiz, push iOS) dựa vào những điều dưới đây; hỏng ở đây = hỏng ở mọi test của họ.
 */
describe('react-native-webview', () => {
  beforeEach(resetWebViewMock);

  it('render giữ nguyên prop, onMessage nhận được sự kiện, ref có phương thức dùng chung', async () => {
    const onMessage = jest.fn();
    const ref = createRef<WebView>();
    const screen = await render(
      <WebView ref={ref} source={{ uri: 'about:blank' }} testID="editor" onMessage={onMessage} />,
    );

    expect(screen.getByTestId('editor').props.source).toEqual({ uri: 'about:blank' });
    fireEvent(screen.getByTestId('editor'), 'message', {
      nativeEvent: { data: '{"type":"ready"}' },
    });
    expect(onMessage).toHaveBeenCalledTimes(1);

    ref.current?.injectJavaScript('true;');
    expect(webViewMethods.injectJavaScript).toHaveBeenCalledWith('true;');
  });
});

describe('@shopify/react-native-skia', () => {
  it('component thành View có testID, Skia.Path ghi lại thao tác, enum trả tên khoá', async () => {
    const path = Skia.Path.Make().moveTo(0, 0).lineTo(10, 10);
    expect((path as unknown as { ops: unknown[] }).ops).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 10, 10],
    ]);
    expect(StrokeCap.Round).toBe('Round');

    const screen = await render(
      <Canvas>
        <Path color="black" path={path} />
      </Canvas>,
    );
    expect(screen.getByTestId('skia-Canvas')).toBeOnTheScreen();
    expect(screen.getByTestId('skia-Path').props.color).toBe('black');
  });

  it('mô-đun KHÔNG là thenable — nạp lười `await import()` không treo (Jest ở đây không chạy được import động nên kiểm thẳng thuộc tính)', () => {
    expect((SkiaModule as { then?: unknown }).then).toBeUndefined();
    expect((SkiaModule as { default?: unknown }).default).toBeUndefined();
  });
});

describe('@rnmapbox/maps', () => {
  beforeEach(resetMapboxMock);

  it('default lẫn named import cùng chạy; setAccessToken là jest.fn; ref MapView/Camera có phương thức', async () => {
    await Mapbox.setAccessToken('pk.test');
    expect(mapboxStatics.setAccessToken).toHaveBeenCalledWith('pk.test');
    expect(StyleURL.Street).toBe('Street');

    const mapRef = createRef<MapView>();
    const cameraRef = createRef<Camera>();
    const screen = await render(
      <MapView ref={mapRef} testID="map">
        <Camera ref={cameraRef} centerCoordinate={[105.85, 21.03]} zoomLevel={14} />
      </MapView>,
    );

    expect(screen.getByTestId('map')).toBeOnTheScreen();
    expect(screen.getByTestId('mapbox-Camera').props.zoomLevel).toBe(14);
    expect(await mapRef.current?.getCenter()).toEqual([105.8542, 21.0285]);
    expect(mapMethods.getCenter).toHaveBeenCalledTimes(1);
  });
});

describe('expo-location', () => {
  beforeEach(resetLocationMock);

  it('mặc định: quyền đã cấp, vị trí Hà Nội; đổi được sang bị từ chối', async () => {
    expect((await Location.requestForegroundPermissionsAsync()).granted).toBe(true);
    const { coords } = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    expect(coords.latitude).toBeCloseTo(21.0285, 3);

    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValueOnce({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    expect((await Location.requestForegroundPermissionsAsync()).granted).toBe(false);
  });
});

describe('expo-screen-orientation', () => {
  beforeEach(resetScreenOrientationMock);

  it('lockAsync ghi nhớ khoá; unlockAsync trả về DEFAULT', async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    expect(await ScreenOrientation.getOrientationLockAsync()).toBe(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    );
    await ScreenOrientation.unlockAsync();
    expect(await ScreenOrientation.getOrientationLockAsync()).toBe(
      ScreenOrientation.OrientationLock.DEFAULT,
    );
  });
});

describe('@react-native-firebase/messaging', () => {
  beforeEach(resetMessagingMock);

  it('API modular dẫn về một bộ mock; onTokenRefresh nhận sự kiện rồi gỡ được', async () => {
    expect(await getToken(getMessaging())).toBe('mock-fcm-token');
    expect(messagingMock.getToken).toHaveBeenCalledTimes(1);
    expect(AuthorizationStatus.AUTHORIZED).toBe(1);

    const listener = jest.fn();
    const unsubscribe = onTokenRefresh(getMessaging(), listener);
    messagingMock.emitTokenRefresh('token-moi');
    expect(listener).toHaveBeenCalledWith('token-moi');
    unsubscribe();
    messagingMock.emitTokenRefresh('token-nua');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('yjs + y-protocols + @hocuspocus/provider (chạy thật, không mock)', () => {
  it('hai Y.Doc trao đổi update thì hội tụ (kiểm luôn đường getRandomValues của shim webcrypto)', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    expect(a.clientID).not.toBe(b.clientID);
    a.getMap('m').set('k', 'v');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(b.getMap('m').get('k')).toBe('v');
  });

  it('awareness mã hoá/giải mã trạng thái người dùng', () => {
    const doc = new Y.Doc();
    const sender = new Awareness(doc);
    sender.setLocalStateField('user', { name: 'An', color: '#f00' });
    const receiver = new Awareness(new Y.Doc());
    applyAwarenessUpdate(receiver, encodeAwarenessUpdate(sender, [sender.clientID]), 'remote');
    expect(receiver.getStates().get(sender.clientID)).toEqual({
      user: { name: 'An', color: '#f00' },
    });
    sender.destroy();
    receiver.destroy();
  });

  it('@hocuspocus/provider nạp được (3.4.4 — cùng major với collab server)', () => {
    expect(typeof HocuspocusProvider).toBe('function');
    // Đọc phiên bản ĐÃ CÀI (package.json của gói không nằm trong `exports` nên không `require` được) — khớp `collab/package.json`.
    const manifest = path.join(
      __dirname,
      '..',
      'node_modules',
      '@hocuspocus',
      'provider',
      'package.json',
    );
    expect((JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version: string }).version).toBe(
      '3.4.4',
    );
  });
});
