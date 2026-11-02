import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import ResizeHandle from './ResizeHandle';

function Panels({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(42);
  return (
    <div ref={containerRef}>
      <ResizeHandle
        containerRef={containerRef}
        orientation={orientation}
        label="Resize panels"
        value={size}
        onChange={setSize}
        min={25}
        max={70}
      />
    </div>
  );
}

it('supports keyboard resizing with boundaries and reset', () => {
  render(<Panels />);
  const handle = screen.getByRole('separator', { name: 'Resize panels' });
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(handle).toHaveAttribute('aria-valuenow', '44');
  fireEvent.keyDown(handle, { key: 'End' });
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(handle).toHaveAttribute('aria-valuenow', '70');
  fireEvent.keyDown(handle, { key: 'Home' });
  fireEvent.keyDown(handle, { key: 'ArrowLeft' });
  expect(handle).toHaveAttribute('aria-valuenow', '25');
  fireEvent.doubleClick(handle);
  expect(handle).toHaveAttribute('aria-valuenow', '42');
});

it('uses up/down keys for the editor/output divider', () => {
  render(<Panels orientation="horizontal" />);
  const handle = screen.getByRole('separator');
  fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true });
  expect(handle).toHaveAttribute('aria-valuenow', '52');
  fireEvent.keyDown(handle, { key: 'ArrowUp' });
  expect(handle).toHaveAttribute('aria-valuenow', '50');
  fireEvent.doubleClick(handle);
  expect(handle).toHaveAttribute('aria-valuenow', '60');
});
