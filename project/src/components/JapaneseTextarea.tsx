import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { japaneseTextareaProps } from '../lib/useJapaneseTextInputs';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** メモなど日本語 textarea（PC かな IME 優先） */
const JapaneseTextarea = forwardRef<HTMLTextAreaElement, Props>(function JapaneseTextarea(props, ref) {
  return <textarea ref={ref} {...japaneseTextareaProps(props)} />;
});

export default JapaneseTextarea;
