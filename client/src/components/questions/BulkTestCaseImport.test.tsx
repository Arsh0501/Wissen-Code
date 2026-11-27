import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import api from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import BulkTestCaseImport from './BulkTestCaseImport';
it('previews cases without adding them until confirmed', async () => {
  const cases = [{ input: '3\n1 2 3', expectedOutput: '6', isSample: true }];
  vi.mocked(api.request).mockResolvedValue({ data: { testCases: cases } });
  const onImport = vi.fn();
  renderWithProviders(<BulkTestCaseImport remaining={100} onImport={onImport} />);
  const user = userEvent.setup();
  const file = new File(['sample\n3\n1 2 3\n6'], 'cases.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => 'sample\n3\n1 2 3\n6' });
  await user.upload(screen.getByLabelText('Upload test cases (.txt)'), file);
  await screen.findByText('6');
  expect(onImport).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Add 1 test cases' }));
  expect(onImport).toHaveBeenCalledWith(cases);
});
it('shows capacity errors without importing partial results', async () => {
  vi.mocked(api.request).mockResolvedValue({
    data: { testCases: [{ input: '1', expectedOutput: '1', isSample: false }] },
  });
  const onImport = vi.fn();
  renderWithProviders(<BulkTestCaseImport remaining={0} onImport={onImport} />);
  const file = new File(['hidden\n1\n1'], 'cases.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => 'hidden\n1\n1' });
  await userEvent.setup().upload(screen.getByLabelText('Upload test cases (.txt)'), file);
  expect(await screen.findByRole('alert')).toHaveTextContent('Only 0 more');
  expect(onImport).not.toHaveBeenCalled();
});
