import { useState } from 'react';
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StringListInput from './StringListInput';
it('preserves comma separators while multiple values are typed', async () => {
  function Form() {
    const [values, setValues] = useState<string[]>([]);
    return (
      <>
        <StringListInput value={values} onChange={setValues} />
        <output>{JSON.stringify(values)}</output>
      </>
    );
  }
  render(<Form />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'React, JavaScript');
  expect(screen.getByRole('textbox')).toHaveValue('React, JavaScript');
  expect(screen.getByRole('status')).toHaveTextContent(
    '["React","JavaScript"]',
  );
});
