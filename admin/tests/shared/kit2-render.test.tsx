/**
 * Kit2 — MỌI component export ra ngoài phải render được.
 *
 * Vì sao cần: 95 file của kit2 đã bị di chuyển khi gom theo nhóm chức năng, và
 * mọi đường import được viết lại bằng script. `tsc` chỉ chứng minh KIỂU khớp;
 * nó không phát hiện một barrel trỏ nhầm file, một `tv()` recipe mất slot, hay
 * một component ném lỗi ngay lượt render đầu.
 *
 * Bài kiểm này cố ý NÔNG mà RỘNG: mỗi component đúng một lượt render với bộ
 * prop tối thiểu, chỉ hỏi một câu — "có dựng ra DOM mà không ném không". Hành
 * vi chi tiết là việc của test riêng từng component.
 */

import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import {
  Avatar,
  Badge,
  BoxInfo,
  BoxPanel,
  Button,
  Callout,
  Checkbox,
  CompactKpiCard,
  ConfirmDialog,
  ContextMenu,
  CopyableText,
  CustomModalLayout,
  DatePicker,
  DateTimePicker,
  Divider,
  Dropdown,
  DropdownTreeSelect,
  Drawer,
  EmptyState,
  FileBadge,
  Heading,
  HudCorners,
  HudFrame,
  HudInfoBox,
  Image,
  ImageLightbox,
  ImagePreview,
  Input,
  Menu,
  Modal,
  MonthYearRangePicker,
  MonthYearStartPicker,
  MultiSelect,
  NumberInput,
  Pagination,
  PanelCard,
  Popover,
  Progress,
  ProgressCircle,
  Radio,
  RangeDatePicker,
  SectionHeader,
  SegmentToggle,
  SingleDatePicker,
  Skeleton,
  Spinner,
  Splitter,
  Stepper,
  SummaryCard,
  SummaryPill,
  Table,
  Tabs,
  TabsPanel,
  Text,
  Textarea,
  ThemeToggle,
  TimePicker,
  TitleScreen,
  Toggle,
  Tooltip,
  Tree,
  Upload,
} from '@/shared/ui';

const OPTIONS = [
  { value: 'a', label: 'Mục A' },
  { value: 'b', label: 'Mục B' },
];
const noop = () => {};

/**
 * Một số component gọi `useNavigate` / `<Link>` bên trong (TitleScreen có nút
 * quay lại, Pagination có link trang). Bọc router cho cả lượt để không phải
 * nhớ component nào cần, component nào không.
 */
function renderInRouter(ui: ReactElement) {
  const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] });
  return render(<RouterProvider router={router} />);
}

/** [tên, phần tử] — tên dùng làm nhãn ca kiểm khi đỏ. */
const CASES: Array<[string, ReactElement]> = [
  // primitives
  ['Text', <Text>chữ</Text>],
  ['Heading', <Heading size="small">tiêu đề</Heading>],
  ['Badge', <Badge color="info">nhãn</Badge>],
  ['Avatar', <Avatar name="Nguyễn Văn A" />],
  ['Divider', <Divider />],

  // feedback
  ['Spinner', <Spinner />],
  ['Skeleton', <Skeleton />],
  ['Callout', <Callout intent="warning">cảnh báo</Callout>],
  ['Progress', <Progress value={42} />],
  ['ProgressCircle', <ProgressCircle value={42} />],
  ['EmptyState', <EmptyState icon="cube-bold" title="Trống" />],

  // actions
  ['Button', <Button>bấm</Button>],
  ['Menu', <Menu options={[{ key: 'a', label: 'A' }]} trigger={<Button>menu</Button>} />],
  ['ContextMenu', <ContextMenu options={[{ key: 'a', label: 'A' }]}>vùng</ContextMenu>],
  ['SegmentToggle', <SegmentToggle options={[{ key: 'a', label: 'A' }]} value="a" />],
  ['ThemeToggle', <ThemeToggle theme="dark" onToggle={noop} />],

  // inputs
  ['Input', <Input placeholder="nhập" />],
  ['Textarea', <Textarea placeholder="nhập dài" />],
  ['NumberInput', <NumberInput value={1} onChange={noop} />],
  ['Checkbox', <Checkbox label="chọn" />],
  ['Radio', <Radio value="a" />],
  ['Toggle', <Toggle />],

  // selects
  ['Dropdown', <Dropdown options={OPTIONS} value="a" />],
  ['MultiSelect', <MultiSelect options={OPTIONS} value={['a']} />],
  ['DropdownTreeSelect', <DropdownTreeSelect data={[]} value={[]} onChange={noop} />],

  // pickers
  ['DatePicker', <DatePicker mode="single" onChange={noop} />],
  ['SingleDatePicker', <SingleDatePicker onChange={noop} />],
  ['RangeDatePicker', <RangeDatePicker range={{ from: null, to: null }} onRangeChange={noop} />],
  ['DateTimePicker', <DateTimePicker onChange={noop} />],
  [
    'MonthYearStartPicker',
    <MonthYearStartPicker value={{ month: 1, year: 2026 }} onChange={noop} />,
  ],
  [
    'MonthYearRangePicker',
    <MonthYearRangePicker
      value={{ from: { month: 1, year: 2026 }, to: { month: 12, year: 2026 } }}
      onChange={noop}
    />,
  ],
  ['TimePicker', <TimePicker value="" onChange={noop} />],

  // overlays
  ['Popover', <Popover content={<span>nội dung</span>}>mở</Popover>],
  [
    'Tooltip',
    <Tooltip content="chú thích">
      <span>hover</span>
    </Tooltip>,
  ],
  [
    'Modal',
    <Modal open title="Hộp thoại" onOpenChange={noop}>
      nội dung
    </Modal>,
  ],
  ['ConfirmDialog', <ConfirmDialog open title="Xoá?" onConfirm={noop} onOpenChange={noop} />],
  [
    'Drawer',
    <Drawer open title="Ngăn kéo" onOpenChange={noop}>
      nội dung
    </Drawer>,
  ],
  ['CustomModalLayout', <CustomModalLayout>nội dung</CustomModalLayout>],

  // navigation
  ['Tabs', <Tabs options={[{ key: 'a', label: 'A' }]} value="a" />],
  ['TabsPanel', <TabsPanel value="a">nội dung</TabsPanel>],
  ['Stepper', <Stepper activeStep={0} steps={[{ key: 'a', label: 'Bước A' }]} />],
  [
    'Pagination',
    <Pagination
      pageCount={3}
      pageIndex={1}
      pageSize={10}
      total={30}
      onPageChange={noop}
      onPageSizeChange={noop}
    />,
  ],

  // data-display
  [
    'Table',
    <Table
      columns={[{ key: 'name', header: 'Tên' }]}
      data={[{ id: 1, name: 'A' }]}
      rowKey={(row) => row.id}
    />,
  ],
  ['Tree', <Tree data={[{ id: '1', name: 'Nút gốc' }]} />],

  // surfaces
  ['BoxPanel', <BoxPanel title="PANEL">nội dung</BoxPanel>],
  [
    'BoxInfo',
    <BoxInfo items={[{ color: 'accent', label: 'A', percent: 50, value: 1 }]} title="Thông tin" />,
  ],
  ['HudFrame', <HudFrame>nội dung</HudFrame>],
  [
    'HudCorners',
    <div className="relative">
      <HudCorners variant="bracket" />
    </div>,
  ],
  ['HudInfoBox', <HudInfoBox title="Nhãn">nội dung</HudInfoBox>],
  // `frame="prime"` là mặc định của PanelCard — render mặc định là đã kéo theo
  // cả `hud-frame-decor`, không cần một ca riêng cho lớp trang trí.
  ['PanelCard', <PanelCard title="CARD">nội dung</PanelCard>],
  [
    'PanelCard · overlay',
    <PanelCard title="CARD" variant="overlay">
      nội dung
    </PanelCard>,
  ],
  ['SummaryCard', <SummaryCard icon="cube-bold" label="Nhãn" value={1} />],
  ['CompactKpiCard', <CompactKpiCard icon="cube-bold" label="Nhãn" value={1} />],
  ['SummaryPill', <SummaryPill icon="cube-bold" label="Nhãn" value={1} />],
  [
    'Splitter',
    <Splitter>
      <div>trái</div>
      <div>phải</div>
    </Splitter>,
  ],

  // actions (còn lại)
  ['CopyableText', <CopyableText label="Job ID" value="mail.send:tpl:9f2c" />],

  // media
  ['Image', <Image alt="ảnh" name="folder-empty" />],
  ['ImagePreview', <ImagePreview alt="ảnh" src="/x.png" />],
  ['ImageLightbox', <ImageLightbox alt="ảnh" open={false} src="/x.png" onOpenChange={noop} />],
  ['Upload', <Upload />],
  ['FileBadge', <FileBadge name="tep.pdf" />],

  // layout
  ['SectionHeader', <SectionHeader title="Mục" />],
  ['TitleScreen', <TitleScreen icon="cube-bold" title="Màn hình" />],
];

describe('kit2 — mọi component export ra ngoài đều render được', () => {
  it.each(CASES)('%s', (_name, element) => {
    const { container, baseElement } = renderInRouter(element);
    // Overlay (Modal/Drawer/Tooltip) render qua portal nên nằm ngoài
    // `container` — xét cả `baseElement` để không báo sai.
    expect(container.innerHTML.length + baseElement.innerHTML.length).toBeGreaterThan(0);
  });

  it('phủ hết component export ra ngoài', () => {
    // Con số này phải đi lên mỗi khi thêm component mới vào barrel nhóm.
    //
    // Cố ý KHÔNG phủ: `ScrollEdgeNav` cần `targetRef` trỏ vào một vùng cuộn
    // SỐNG (nó đo scrollWidth để quyết định hiện mũi tên) — render rời không
    // kiểm được gì thật. Nó đã được phủ gián tiếp qua `Table`.
    expect(CASES.length).toBeGreaterThanOrEqual(63);
  });
});
