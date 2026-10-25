/**
 * Mười hai export của kit2 mà TRƯỚC bài kiểm này không ai chạm tới.
 *
 * `kit2-render.test.tsx` mở đầu bằng lời hứa "MỌI component export ra ngoài
 * phải render được", nhưng 12 cái dưới đây lọt lưới: chúng vừa không có nơi
 * dùng trong `src/`, vừa không nằm trong danh sách đó. Với một repo TEMPLATE
 * thì "không ai dùng" là bình thường — đây là API dọn sẵn cho dự án sau. Nhưng
 * chính vì thế chúng lại là nhóm dễ hỏng âm thầm nhất: đổi barrel hay đổi
 * `tv()` recipe mà không có gì đỏ lên thì lỗi chỉ lộ ra ở dự án dùng lại base.
 *
 * Chúng nằm ở file riêng thay vì nhét vào `kit2-render` vì hầu hết cần một
 * `<Form>` thật bọc ngoài (react-hook-form + data router), khác hẳn lối "một
 * lượt render trần" của file kia.
 */

import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { ColorPalettePanel, Dropzone, TableEmptyIllustration } from '@/shared/ui';
import {
  CascadeSelectField,
  ColorPickerField,
  ConditionalField,
  DictionaryField,
  DynamicSchemaField,
  FieldArray,
  Form,
  FormTabs,
  NestedFieldArray,
  SortableFieldArray,
  TextField,
} from '@/shared/ui/form';

interface Values {
  color: string;
  region: string;
  attrs: { key: string; value: string }[];
  members: { name: string }[];
  teams: { name: string }[];
  toggle: boolean;
  extra: string;
}

const DEFAULTS: Values = {
  color: '#22C55E',
  region: '',
  attrs: [],
  members: [{ name: '' }],
  teams: [{ name: '' }],
  toggle: true,
  extra: '',
};

const noop = () => {};

/**
 * `<Form>` gọi `useDirtyGuard` → `useBlocker`, thứ CHỈ chạy trong data router.
 * Bọc memory router để dựng đúng cây provider mà app thật dùng — cùng lý do đã
 * ghi ở `form-a11y.test.tsx`.
 */
function renderInRouter(ui: ReactElement) {
  const router = createMemoryRouter([{ path: '/', element: ui }], { initialEntries: ['/'] });
  return render(<RouterProvider router={router} />);
}

/** Bọc một mảnh form bất kỳ vào `<Form>` với bộ giá trị mặc định ở trên. */
function FormHarness({ children }: { children: ReactElement }) {
  const form = useForm<Values>({ defaultValues: DEFAULTS });
  return (
    <Form form={form} onSubmit={noop}>
      {children}
    </Form>
  );
}

describe('kit2 — export chưa có nơi dùng vẫn phải render được', () => {
  it('ColorPalettePanel', () => {
    const { container } = render(<ColorPalettePanel value="#22C55E" onChange={noop} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('TableEmptyIllustration', () => {
    const { container } = render(<TableEmptyIllustration />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('Dropzone — bọc nội dung, overlay chỉ hiện khi kéo vào', () => {
    render(
      <Dropzone onDrop={noop}>
        <p>Vùng nhận tệp</p>
      </Dropzone>,
    );
    expect(screen.getByText('Vùng nhận tệp')).toBeInTheDocument();
  });

  it('ColorPickerField', () => {
    renderInRouter(
      <FormHarness>
        <ColorPickerField label="Màu nhận diện" name="color" />
      </FormHarness>,
    );
    expect(screen.getByText('Màu nhận diện')).toBeInTheDocument();
  });

  it('CascadeSelectField', () => {
    renderInRouter(
      <FormHarness>
        <CascadeSelectField
          levels={[
            {
              name: 'region',
              label: 'Miền',
              fetch: async () => [{ value: 'bac', label: 'Bắc' }],
            },
          ]}
        />
      </FormHarness>,
    );
    expect(screen.getByText('Miền')).toBeInTheDocument();
  });

  it('DictionaryField', () => {
    renderInRouter(
      <FormHarness>
        <DictionaryField label="Thuộc tính" name="attrs" />
      </FormHarness>,
    );
    expect(screen.getByText('Thuộc tính')).toBeInTheDocument();
  });

  it('FieldArray', () => {
    renderInRouter(
      <FormHarness>
        <FieldArray<Values, 'members'> name="members">
          {({ fields }) => (
            <>
              {fields.map((f, i) => (
                <TextField key={f.id} label={`Thành viên ${i + 1}`} name={`members.${i}.name`} />
              ))}
            </>
          )}
        </FieldArray>
      </FormHarness>,
    );
    expect(screen.getByText('Thành viên 1')).toBeInTheDocument();
  });

  it('NestedFieldArray', () => {
    renderInRouter(
      <FormHarness>
        <NestedFieldArray<Values, 'teams'> name="teams">
          {({ fields }) => (
            <>
              {fields.map((f, i) => (
                <TextField key={f.id} label={`Nhóm ${i + 1}`} name={`teams.${i}.name`} />
              ))}
            </>
          )}
        </NestedFieldArray>
      </FormHarness>,
    );
    expect(screen.getByText('Nhóm 1')).toBeInTheDocument();
  });

  it('SortableFieldArray', () => {
    renderInRouter(
      <FormHarness>
        <SortableFieldArray<Values, 'members'> name="members">
          {({ fields }) => (
            <>
              {fields.map((f, i) => (
                <TextField key={f.id} label={`Dòng ${i + 1}`} name={`members.${i}.name`} />
              ))}
            </>
          )}
        </SortableFieldArray>
      </FormHarness>,
    );
    expect(screen.getByText('Dòng 1')).toBeInTheDocument();
  });

  it('ConditionalField — hiện khi điều kiện đúng', () => {
    renderInRouter(
      <FormHarness>
        <ConditionalField condition={(v) => v === true} watch="toggle">
          <TextField label="Ghi chú thêm" name="extra" />
        </ConditionalField>
      </FormHarness>,
    );
    expect(screen.getByText('Ghi chú thêm')).toBeInTheDocument();
  });

  it('DynamicSchemaField', () => {
    renderInRouter(
      <FormHarness>
        <DynamicSchemaField watch="toggle">
          <TextField label="Trường động" name="extra" />
        </DynamicSchemaField>
      </FormHarness>,
    );
    expect(screen.getByText('Trường động')).toBeInTheDocument();
  });

  // `FormTabs` cần chính `form` (để đếm lỗi theo tab), nên nó không dùng
  // `FormHarness` mà tự dựng form ở đây.
  it('FormTabs', () => {
    function TabsHarness() {
      const form = useForm<Values>({ defaultValues: DEFAULTS });
      return (
        <Form form={form} onSubmit={noop}>
          <FormTabs form={form}>
            <FormTabs.Panel fields={['extra']} label="Thông tin" value="a">
              <TextField label="Ghi chú" name="extra" />
            </FormTabs.Panel>
          </FormTabs>
        </Form>
      );
    }
    renderInRouter(<TabsHarness />);
    expect(screen.getByText('Thông tin')).toBeInTheDocument();
  });
});
