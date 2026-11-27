import { beforeAll, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RestartAssessmentDialog from './RestartAssessmentDialog';
import * as api from '../../services/api';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
it('requires a reason and submits explicit closed-test permission without a browser confirmation', async () => {
  const restart = vi.spyOn(api, 'restartCandidateAssessment').mockResolvedValue({});
  const done = vi.fn();
  const user = userEvent.setup();
  render(
    <RestartAssessmentDialog
      assessmentId={10}
      candidate={{ id: 20, name: 'Candidate' }}
      onClose={vi.fn()}
      onRestart={done}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Restart assessment' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a reason');
  expect(restart).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Reason'), 'Computer crashed');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Restart assessment' }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(restart).toHaveBeenCalledWith(10, 20, 'Computer crashed', true);
});
