import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import api from '../../services/api';
import ResumeViewer from './ResumeViewer';

it('previews the protected PDF without a separate download link, then releases the blob URL', async () => {
  const createObjectURL = vi.fn(() => 'blob:test-resume');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  try {
    const pdf = new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' });
    vi.mocked(api.get).mockResolvedValueOnce({ data: pdf });
    const { unmount } = render(
      <ResumeViewer interview={{ id: 8, candidateResumeUrl: '/api/interviews/8/resume' }} />,
    );
    expect(await screen.findByTitle('Candidate resume PDF')).toHaveAttribute(
      'src',
      'blob:test-resume#view=FitH&navpanes=0',
    );
    expect(screen.queryByRole('link', { name: 'Download PDF resume' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/interviews/8/resume', { responseType: 'blob' });
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-resume');
  } finally {
    vi.unstubAllGlobals();
  }
});
