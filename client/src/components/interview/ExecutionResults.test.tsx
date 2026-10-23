import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecutionResults from './ExecutionResults';

it('shows passed and failed counts with readable sample input and output', () => {
  render(<ExecutionResults value={{ mode: 'run', totalCount: 2, passedCount: 1, results: [
    { testCaseId: 1, isSample: true, passed: true, statusDesc: 'Accepted', input: '1 2', expectedOutput: '3', actualOutput: '3' },
    { testCaseId: 2, isSample: true, passed: false, statusDesc: 'Wrong Answer', input: '2 2', expectedOutput: '4', actualOutput: '0' },
  ] }} />);
  expect(screen.getByText('1 / 2 passed')).toBeInTheDocument();
  expect(screen.getByText('Passed: 1')).toBeInTheDocument();
  expect(screen.getByText('Failed: 1')).toBeInTheDocument();
  expect(screen.getByText('2 2')).toBeInTheDocument();
  expect(screen.getByText('Failed · Wrong Answer')).toBeInTheDocument();
  expect(screen.queryByText(/"passedCount"/)).not.toBeInTheDocument();
});

it('keeps hidden test values private and shows the submission score', () => {
  render(<ExecutionResults value={{ score: 50, totalCount: 2, passedCount: 1, results: [
    { testCaseId: 8, isSample: false, passed: false, statusDesc: 'Wrong Answer', input: 'SECRET INPUT', expectedOutput: 'SECRET EXPECTED', actualOutput: 'SECRET ACTUAL' },
  ] }} />);
  expect(screen.getByText('Score: 50%')).toBeInTheDocument();
  expect(screen.queryByText('SECRET INPUT')).not.toBeInTheDocument();
  expect(screen.queryByText('SECRET EXPECTED')).not.toBeInTheDocument();
  expect(screen.queryByText('SECRET ACTUAL')).not.toBeInTheDocument();
});

it('shows compiler errors without claiming unevaluated tests passed', () => {
  render(<ExecutionResults value={{ result: { status: { id: 6, description: 'Compilation Error' }, compile_output: 'Expected closing bracket', time: null } }} />);
  expect(screen.getByText('Compilation Error')).toBeInTheDocument();
  expect(screen.getByText('Expected closing bracket')).toBeInTheDocument();
  expect(screen.queryByText(/Passed:/)).not.toBeInTheDocument();
});
