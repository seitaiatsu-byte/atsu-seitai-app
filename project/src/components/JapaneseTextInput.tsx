import { forwardRef, type InputHTMLAttributes } from 'react';
import { japaneseTextInputProps } from '../lib/useJapaneseTextInputs';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** 氏名・住所など日本語入力欄（PC かな IME 優先） */
const JapaneseTextInput = forwardRef<HTMLInputElement, Props>(function JapaneseTextInput(props, ref) {
  return <input ref={ref} {...japaneseTextInputProps(props)} />;
});

export default JapaneseTextInput;
