import { fireEvent, render, screen } from '@testing-library/react-native';

import type {
  IntegrationPublicView,
  IntegrationView,
  ProviderInfo,
} from '../api/integrations.types';
import { ProviderCard } from '../components/ProviderCard';

/** Thẻ nhà cung cấp (p5-03 app.md §3/§8): MEMBER chỉ xem (không nút); OWNER/ADMIN có Kết nối/Quản lý; nhà cung cấp chưa bật → giải thích, không nút. */
const github: ProviderInfo = {
  provider: 'GITHUB',
  key: 'github',
  label: 'GitHub',
  kind: 'WORKSPACE',
  configured: true,
  enabled: true,
  available: true,
  events: ['push'],
};

const full: IntegrationView = {
  id: '650000000000000000000001',
  workspaceId: '650000000000000000000002',
  provider: 'GITHUB',
  providerKey: 'github',
  externalName: 'vci-org',
  scopes: [],
  config: { repos: [], events: ['push'] },
  supportedEvents: ['push'],
  target: {
    scopeType: 'CHANNEL',
    scopeId: '650000000000000000000003',
    name: 'chung',
    private: false,
  },
  status: 'ERROR',
  statusReason: 'TARGET_FORBIDDEN',
  lastEventAt: null,
  version: 2,
  createdBy: 'u1',
  createdAt: '2026-09-20T00:00:00.000Z',
};

const publicView: IntegrationPublicView = {
  id: full.id,
  provider: 'GITHUB',
  providerKey: 'github',
  externalName: 'vci-org',
  target: { ...full.target, name: null, private: true },
};

const onConnect = jest.fn();
const onOpen = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('ProviderCard', () => {
  it('MEMBER: thấy tài khoản + kênh nhận (riêng tư không lộ tên), KHÔNG có nút', async () => {
    await render(
      <ProviderCard
        busy={false}
        canManage={false}
        connections={[publicView]}
        provider={github}
        onConnect={onConnect}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText('vci-org')).toBeOnTheScreen();
    expect(screen.getByText('Kênh riêng tư')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ADMIN: trạng thái bằng chữ, "Quản lý" mở chi tiết, "Kết nối thêm" gọi kết nối', async () => {
    await render(
      <ProviderCard
        busy={false}
        canManage
        connections={[full]}
        provider={github}
        onConnect={onConnect}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByText(/Lỗi · #chung/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Quản lý' }));
    expect(onOpen).toHaveBeenCalledWith(full.id);
    await fireEvent.press(screen.getByRole('button', { name: 'Kết nối thêm' }));
    expect(onConnect).toHaveBeenCalledWith(github);
  });

  it('nhà cung cấp chưa bật → không có nút Kết nối, có câu giải thích; đang bận → nút bị khoá', async () => {
    await render(
      <ProviderCard
        busy={false}
        canManage
        connections={[]}
        provider={{ ...github, available: false }}
        onConnect={onConnect}
        onOpen={onOpen}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Kết nối' })).toBeNull();
    expect(screen.getByText('Nhà cung cấp chưa được bật trên hệ thống.')).toBeOnTheScreen();

    await render(
      <ProviderCard
        busy
        canManage
        connections={[]}
        provider={github}
        onConnect={onConnect}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByRole('button', { name: 'Kết nối' })).toBeDisabled();
  });
});
