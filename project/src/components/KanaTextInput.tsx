import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { formatPersonSearchInput } from '../lib/personSearchText';
import { kanaTextInputProps } from '../lib/useJapaneseTextInputs';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
};

/** ふりがな欄：PC のかな IME 優先 + ローマ字は自動でひらがな化 */
const KanaTextInput = forwardRef<HTMLInputElement, Props>(function KanaTextInput(
  { value, onChange, onCompositionStart, onCompositionEnd, ...rest },
  ref
) {
  const [composing, setComposing] = useState(false);

  return (
    <input
      ref={ref}
      {...kanaTextInputProps({
        ...rest,
        value,
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

export default KanaTextInput;
