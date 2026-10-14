import { useState } from 'react';

export default function StringListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      className="input mt-2"
      value={text}
      placeholder={placeholder}
      onChange={(event) => {
        setText(event.target.value);
        onChange(
          event.target.value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
