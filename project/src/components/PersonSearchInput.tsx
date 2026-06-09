import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { finalizePersonSearchInput, formatPersonSearchInput } from '../lib/personSearchText';
import { personSearchInputProps } from '../lib/useJapaneseTextInputs';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
};

const PersonSearchInput = forwardRef<HTMLInputElement, Props>(function PersonSearchInput(
  { value, onChange, onCompositionStart, onCompositionEnd, onBlur, ...rest },
  ref
) {
  const [composing, setComposing] = useState(false);

  return (
    <input
      ref={ref}
      {...personSearchInputProps({
        ...rest,
        value,
        onBlur: (e) => {
          onChange(finalizePersonSearchInput(e.currentTarget.value));
          onBlur?.(e);
        },
        onCompositionStart: (e) => {
          setComposing(true);
          onCompositionStart?.(e);
        },
        onCompositionEnd: (e) => {
          setComposing(false);
          onChange(formatPersonSearchInput(e.currentTarget.value));
          onCompositionEnd?.(e);
        },
        onChange: (e) => {
          const next = e.target.value;
          onChange(composing ? next : formatPersonSearchInput(next));
        },
      })}
    />
  );
});

export default PersonSearchInput;
