import { render, screen, within } from '@testing-library/react-native';

import { SpeakerLayout } from '../../../components/stage/SpeakerLayout';
import { makePerson } from '../../fixtures';
import { makeRenderVideo } from './stage-helpers';

const lan = makePerson({ name: 'Lan', userId: 'u1' });
const nam = makePerson({ name: 'Nam', userId: 'u2' });
const mai = makePerson({ name: 'Mai', userId: 'u3' });

function mount(over: { people?: typeof lan[]; pinnedUserId?: string | null } = {}) {
  return render(
    <SpeakerLayout
      people={over.people ?? [lan, nam, mai]}
      pinnedUserId={over.pinnedUserId ?? null}
      renderVideo={makeRenderVideo()}
      onLongPressTile={jest.fn()}
    />,
  );
}

/** Bố cục Diễn giả (app.md §3.2): một người lớn + dải ô nhỏ; người lớn là người được ghim, không thì người đầu danh sách. */
describe('SpeakerLayout', () => {
  it('người đầu danh sách là ô lớn, những người còn lại nằm trong dải ô nhỏ', async () => {
    await mount();

    const strip = screen.getByTestId('thumbnail-strip');
    expect(within(strip).getAllByRole('button')).toHaveLength(2);
    expect(within(strip).getByLabelText(/Nam/)).toBeOnTheScreen();
    expect(within(strip).getByLabelText(/Mai/)).toBeOnTheScreen();
    expect(within(strip).queryByLabelText(/Lan/)).toBeNull();
    // Ô lớn = ô còn lại ngoài dải: ba người, hai ở dải.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('người được ghim chiếm ô lớn dù không đứng đầu danh sách', async () => {
    await mount({ pinnedUserId: 'u3' });

    const strip = screen.getByTestId('thumbnail-strip');
    expect(within(strip).queryByLabelText(/Mai/)).toBeNull();
    expect(within(strip).getByLabelText(/Lan/)).toBeOnTheScreen();
    expect(within(strip).getByLabelText(/Nam/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/Mai.*Đã ghim/)).toBeOnTheScreen();
  });

  it('ghim một người ĐÃ RỜI phòng thì không có "ghim ma" chiếm sân khấu — quay về người đầu danh sách', async () => {
    await mount({ pinnedUserId: 'da-roi' });

    expect(within(screen.getByTestId('thumbnail-strip')).queryByLabelText(/Lan/)).toBeNull();
    expect(screen.queryByText('Đã ghim')).toBeNull();
  });

  it('chỉ một người → chỉ ô lớn, không có dải ô nhỏ', async () => {
    await mount({ people: [lan] });

    expect(screen.queryByTestId('thumbnail-strip')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('danh sách rỗng → không vẽ gì', async () => {
    const view = await mount({ people: [] });

    expect(view.toJSON()).toBeNull();
  });
});
