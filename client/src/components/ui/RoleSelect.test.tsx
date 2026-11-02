import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import RoleSelect from './RoleSelect';

it('selects a role with the keyboard and restores trigger focus', async () => {
  const onChange = vi.fn();
  render(<RoleSelect label="Account role" value="candidate" onChange={onChange} />);
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', { name: 'Account role' });
  await user.click(trigger);
  expect(screen.getByRole('listbox')).toHaveFocus();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenCalledWith('interviewer');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('cancels on outside click and prevents editing a disabled role', async () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <RoleSelect label="Account role" value="admin" onChange={onChange} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button'));
  await user.click(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  rerender(<RoleSelect label="Account role" value="admin" onChange={onChange} disabled />);
  await user.click(screen.getByRole('button'));
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
