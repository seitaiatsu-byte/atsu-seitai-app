import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const OTHER_CAL_PASSWORD_HINT =
  'ひらがな・カタカナ・英数字・記号どれでも可（4文字以上）。前後の空白は無視。登録した文字と完全一致で照合します。';

export const OTHER_CAL_RECOVERY_HINT =
  '入室パスワードとは別の言葉です。形式は自由（例: かなの合言葉、英数字）。4文字以上。カレンダー入室には使いません。';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
  inputClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  autoFocus?: boolean;
};

export default function SecretInputField({
  value,
  onChange,
  label,
  hint,
  placeholder,
  autoComplete,
  inputClassName = 'border-2 border-violet-300 rounded-lg',
  onKeyDown,
  readOnly = false,
  autoFocus = false,
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="block text-xs font-bold text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2 max-w-md">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          readOnly={readOnly}
          className={`flex-1 px-4 py-2 font-mono ${inputClassName}`}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="shrink-0 p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
          title={visible ? '入力を隠す' : '入力を表示'}
          aria-label={visible ? '入力を隠す' : '入力を表示'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {hint ? <p className="text-xs text-gray-600 mt-1 max-w-md">{hint}</p> : null}
    </div>
  );
}
