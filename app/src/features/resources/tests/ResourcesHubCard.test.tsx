import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { resourcesService } from '../api/resources.service';
import { ResourcesHubCard } from '../components/ResourcesHubCard';
import { renderWithProviders } from './render-helpers';

/** Card cho hub workspace: ẩn theo cờ `project`, khi chưa biết vai trò, và với GUEST; mở đúng route gốc. */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../api/resources.service', () => ({
  MIN_SEARCH_LENGTH: 2,
  resourcesService: { workspaceAccess: jest.fn() },
}));

const mockedFeature = jest.mocked(useFeature);
const mockedAccess = jest.mocked(resourcesService.workspaceAccess);

beforeEach(() => {
  jest.clearAllMocks();
  mockedAccess.mockResolvedValue({ id: 'ws-1', myRole: 'MEMBER', name: 'N', status: 'ACTIVE' });
});

describe('ResourcesHubCard', () => {
  it('cờ `project` tắt ⇒ không vẽ gì', async () => {
    mockedFeature.mockReturnValue(false);
    await renderWithProviders(<ResourcesHubCard wsId="ws-1" />);
    expect(screen.queryByText('Tài liệu')).toBeNull();
  });

  it('capabilities chưa tải (undefined) ⇒ cũng ẩn, không chớp', async () => {
    mockedFeature.mockReturnValue(undefined);
    await renderWithProviders(<ResourcesHubCard wsId="ws-1" />);
    expect(screen.queryByText('Tài liệu')).toBeNull();
  });

  it('cờ bật ⇒ hiện mục "Tài liệu" là MỘT dòng bấm được (không còn nút [Mở] riêng); bấm đi tới gốc kho của đúng workspace', async () => {
    mockedFeature.mockReturnValue(true);
    await renderWithProviders(<ResourcesHubCard wsId="ws-1" />);

    expect(await screen.findByText('Tài liệu')).toBeOnTheScreen();
    expect(screen.queryByText('Mở')).toBeNull();
    await fireEvent.press(screen.getByText('Kho tài liệu'));
    expect(router.push).toHaveBeenCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/resources',
    });
  });

  it('GUEST ⇒ ẩn dù cờ bật', async () => {
    mockedFeature.mockReturnValue(true);
    mockedAccess.mockResolvedValue({ id: 'ws-1', myRole: 'GUEST', name: 'N', status: 'ACTIVE' });
    await renderWithProviders(<ResourcesHubCard wsId="ws-1" />);

    await waitFor(() => expect(mockedAccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Tài liệu')).toBeNull();
  });
});
