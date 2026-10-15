import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnswerInput, { parseSelection } from './AnswerInput';
import type { Question } from '../../types';
const question = {
  id: 1,
  questionType: 'mcq',
  settings: {
    options: [
      { id: 'a', text: 'First choice' },
      { id: 'b', text: 'Second choice' },
    ],
    multiple: true,
  },
} as Question;
function Example({ item = question }: { item?: Question }) {
  const [value, setValue] = useState(item.questionType === 'mcq' ? '[]' : '');
  return (
    <>
      <AnswerInput question={item} value={value} onChange={setValue} />
      <output data-testid="answer">{value}</output>
    </>
  );
}
describe('candidate answer formats', () => {
  it('selects and deselects multiple choices without retaining removed options', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByLabelText('First choice'));
    await user.click(screen.getByLabelText('Second choice'));
    expect(JSON.parse(screen.getByTestId('answer').textContent!)).toEqual([
      'a',
      'b',
    ]);
    await user.click(screen.getByLabelText('First choice'));
    expect(JSON.parse(screen.getByTestId('answer').textContent!)).toEqual([
      'b',
    ]);
  });
  it('replaces a single choice when another option is selected', async () => {
    const user = userEvent.setup();
    render(
      <Example
        item={{
          ...question,
          settings: { ...question.settings, multiple: false },
        }}
      />,
    );
    await user.click(screen.getByLabelText('First choice'));
    await user.click(screen.getByLabelText('Second choice'));
    expect(screen.getByLabelText('First choice')).not.toBeChecked();
    expect(screen.getByLabelText('Second choice')).toBeChecked();
  });
  it('captures a written response and explains human scoring', async () => {
    const user = userEvent.setup();
    render(<Example item={{ ...question, questionType: 'written' }} />);
    await user.type(
      screen.getByLabelText('Written answer'),
      'A concrete explanation.',
    );
    expect(screen.getByTestId('answer')).toHaveTextContent(
      'A concrete explanation.',
    );
    expect(screen.getByText(/interviewer will evaluate/)).toBeInTheDocument();
  });
  it('handles malformed saved choices without crashing', () => {
    expect(parseSelection('invalid')).toEqual([]);
    expect(parseSelection('{"x":1}')).toEqual([]);
  });
});
