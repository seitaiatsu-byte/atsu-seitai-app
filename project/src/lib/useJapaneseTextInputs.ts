import {
  useEffect,
  type FocusEventHandler,
  type InputHTMLAttributes,
  type MouseEventHandler,
  type TextareaHTMLAttributes,
} from 'react';

const NUMERIC_INPUT_TYPES = new Set([
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'tel',
  'email',
  'url',
  'password',
]);

type TextFieldExtra =
  | InputHTMLAttributes<HTMLInputElement>
  | TextareaHTMLAttributes<HTMLTextAreaElement>;

function stripHostileInputAttrs<T extends TextFieldExtra>(extra?: T) {
  if (!extra) return {} as Omit<T, 'inputMode' | 'type' | 'onFocus' | 'onMouseDown' | 'onClick'>;
  const { inputMode, type, onFocus, onMouseDown, onClick, ...safe } = extra;
  return { safe, onFocus, onMouseDown, onClick };
}

export function shouldUseJapaneseInput(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el.getAttribute('data-ime') === 'off') return false;
  if (el.getAttribute('data-person-search') === 'true') return true;
  if (el.getAttribute('data-kana-input') === 'true') return true;
  if (el.getAttribute('data-japanese-text') === 'true') return true;
  if (el.getAttribute('data-ime') === 'ja') return true;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (NUMERIC_INPUT_TYPES.has(type)) return false;
  }
  const mode = (el.getAttribute('inputmode') || '').toLowerCase();
  return mode !== 'numeric' && mode !== 'decimal';
}

/** ふりがな検索など：英数字キーボード／IMEを誘導しない */
export function ensureJapaneseImeForInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.setAttribute('lang', 'ja');
  el.setAttribute('data-ime', 'ja');
  el.setAttribute('autocapitalize', 'off');
  el.setAttribute('autocorrect', 'off');
  el.setAttribute('spellcheck', 'false');
  el.removeAttribute('inputmode');
  if (el instanceof HTMLInputElement && el.type === 'search') {
    el.type = 'text';
  }
}

function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** 数値欄のあとでも、可能な限り日本語（かな）入力から始める（プログラムフォーカス用） */
export function focusWithJapaneseIme(el: HTMLInputElement | HTMLTextAreaElement | null): void {
  if (!el) return;
  ensureJapaneseImeForInput(el);

  // スマホでは readOnly トグルがキーボードを出さない原因になるため使わない
  if (isCoarsePointerDevice()) {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    return;
  }

  const run = () => {
    ensureJapaneseImeForInput(el);
    if (el instanceof HTMLInputElement) {
      el.readOnly = true;
    }
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
    if (el instanceof HTMLInputElement) {
      requestAnimationFrame(() => {
        el.readOnly = false;
        ensureJapaneseImeForInput(el);
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      });
    }
  };
  run();
  requestAnimationFrame(run);
}

/** ユーザーがタップした欄：属性だけ整え、再フォーカスしない（キーボードを壊さない） */
function prepareJapaneseTextInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  ensureJapaneseImeForInput(el);
}

function bindJapaneseImeHandlers(handlers?: {
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onMouseDown?: MouseEventHandler<HTMLInputElement>;
  onClick?: MouseEventHandler<HTMLInputElement>;
}) {
  return {
    onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => {
      prepareJapaneseTextInput(e.currentTarget);
      handlers?.onMouseDown?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => {
      prepareJapaneseTextInput(e.currentTarget);
      handlers?.onFocus?.(e);
    },
    onClick: (e: React.MouseEvent<HTMLInputElement>) => {
      prepareJapaneseTextInput(e.currentTarget);
      handlers?.onClick?.(e);
    },
  };
}

function bindJapaneseTextareaImeHandlers(handlers?: {
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onMouseDown?: MouseEventHandler<HTMLTextAreaElement>;
  onClick?: MouseEventHandler<HTMLTextAreaElement>;
}) {
  return {
    onMouseDown: (e: React.MouseEvent<HTMLTextAreaElement>) => {
      prepareJapaneseTextInput(e.currentTarget);
      handlers?.onMouseDown?.(e);
    },
    onFocus: (e: React.FocusEvent<HTMLTextAreaElement>) => {
      prepareJapaneseTextInput(e.currentTarget);
      handlers?.onFocus?.(e);
    },
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => {
      prepareJapaneseTextInput(e.currentTarget);
      handlers?.onClick?.(e);
    },
  };
}

const JAPANESE_BASE_ATTRS = {
  lang: 'ja' as const,
  'data-ime': 'ja' as const,
  autoComplete: 'off' as const,
  autoCapitalize: 'off' as const,
  autoCorrect: 'off' as const,
  spellCheck: false,
};

/** 氏名・住所・メモなど（漢字かな混在の日本語欄） */
export function japaneseTextInputProps(
  extra?: InputHTMLAttributes<HTMLInputElement>
): InputHTMLAttributes<HTMLInputElement> {
  const { safe, onFocus, onMouseDown, onClick } = stripHostileInputAttrs(extra);
  return {
    ...safe,
    type: 'text',
    ...JAPANESE_BASE_ATTRS,
    'data-japanese-text': 'true',
    ...bindJapaneseImeHandlers({ onFocus, onMouseDown, onClick }),
  };
}

/** ふりがな入力欄（かな優先 + IME） */
export function kanaTextInputProps(
  extra?: InputHTMLAttributes<HTMLInputElement>
): InputHTMLAttributes<HTMLInputElement> {
  const { safe, onFocus, onMouseDown, onClick } = stripHostileInputAttrs(extra);
  return {
    ...safe,
    type: 'text',
    ...JAPANESE_BASE_ATTRS,
    'data-kana-input': 'true',
    'data-person-search': 'true',
    ...bindJapaneseImeHandlers({ onFocus, onMouseDown, onClick }),
  };
}

export function japaneseTextareaProps(
  extra?: TextareaHTMLAttributes<HTMLTextAreaElement>
): TextareaHTMLAttributes<HTMLTextAreaElement> {
  const { safe, onFocus, onMouseDown, onClick } = stripHostileInputAttrs(extra);
  return {
    ...safe,
    ...JAPANESE_BASE_ATTRS,
    'data-japanese-text': 'true',
    ...bindJapaneseTextareaImeHandlers({ onFocus, onMouseDown, onClick }),
  };
}

/** ヒト検索欄（時間・金額以外）向けの共通 input 属性 */
export function personSearchInputProps(
  extra?: InputHTMLAttributes<HTMLInputElement>
): InputHTMLAttributes<HTMLInputElement> {
  const { safe, onFocus, onMouseDown, onClick } = stripHostileInputAttrs(extra);
  return {
    ...safe,
    type: 'text',
    ...JAPANESE_BASE_ATTRS,
    'data-person-search': 'true',
    'data-kana-input': 'true',
    ...bindJapaneseImeHandlers({ onFocus, onMouseDown, onClick }),
  };
}

export function applyJapaneseInputToElement(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (
    el.getAttribute('data-ime') === 'ja' ||
    el.getAttribute('data-person-search') === 'true' ||
    el.getAttribute('data-kana-input') === 'true' ||
    el.getAttribute('data-japanese-text') === 'true'
  ) {
    ensureJapaneseImeForInput(el);
    return;
  }
  el.setAttribute('lang', 'ja');
  el.removeAttribute('inputmode');
  if (el instanceof HTMLInputElement && el.type === 'search') {
    el.type = 'text';
  }
}

export function applyJapaneseInputs(root: ParentNode = document): void {
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (shouldUseJapaneseInput(el)) applyJapaneseInputToElement(el);
  });
}

function handleJapaneseFocusIn(target: EventTarget | null): void {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
  if (
    target.getAttribute('data-person-search') === 'true' ||
    target.getAttribute('data-kana-input') === 'true' ||
    target.getAttribute('data-japanese-text') === 'true'
  ) {
    prepareJapaneseTextInput(target);
    return;
  }
  if (shouldUseJapaneseInput(target)) applyJapaneseInputToElement(target);
}

/** 数字・時刻欄以外は日本語入力（IME）優先。画面の出し入れ後も再適用する。 */
export function useJapaneseTextInputs(): void {
  useEffect(() => {
    applyJapaneseInputs(document);

    const onFocusIn = (event: FocusEvent) => {
      handleJapaneseFocusIn(event.target);
    };

    let raf = 0;
    const scheduleApply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyJapaneseInputs(document));
    };

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('focusin', onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('focusin', onFocusIn);
    };
  }, []);
}
