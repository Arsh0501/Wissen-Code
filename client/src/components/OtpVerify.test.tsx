import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import OtpVerify from './OtpVerify';
import api from '../services/api';

vi.mock('../services/api', () => ({ default: { post: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('verifies a pasted email code and shows confirmation', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: { verified: true } });
  render(<OtpVerify email="person@example.com" expiresInSeconds={600} onVerified={vi.fn()} onSkip={vi.fn()} />);
  fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => '123456' } });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/otp/verify', { email: 'person@example.com', purpose: 'email-verification', code: '123456' }));
  expect(await screen.findByText(/Email confirmed/)).toBeInTheDocument();
});

it('keeps verification optional and shows rejected-code errors', async () => {
  vi.mocked(api.post).mockRejectedValue({ response: { data: { error: 'This code is invalid or expired.' } } });
  const skip = vi.fn();
  render(<OtpVerify email="person@example.com" expiresInSeconds={600} onVerified={vi.fn()} onSkip={skip} />);
  fireEvent.paste(screen.getByLabelText('Digit 1'), { clipboardData: { getData: () => '000000' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('This code is invalid or expired.');
  fireEvent.click(screen.getByRole('button', { name: /Verify later/ }));
  expect(skip).toHaveBeenCalledOnce();
});
