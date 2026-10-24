import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectionStatus from './ConnectionStatus';
afterEach(() => vi.unstubAllGlobals());
describe('ConnectionStatus', () => {
  it('shows an outage and clears it when a manual check succeeds', async () => {
    const probe = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', probe);
    render(<ConnectionStatus />);
    expect(await screen.findByRole('status')).toHaveTextContent('Service temporarily unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it('keeps the workspace available when the network request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<ConnectionStatus />);
    expect(await screen.findByRole('status')).toHaveTextContent('Some actions may not save');
  });
});
