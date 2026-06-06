import { useEffect, type FocusEventHandler, type InputHTMLAttributes } from 'react';

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

export function shouldUseJapaneseInput(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return false;
  if (el.getAttribute('data-ime') === 'off') return false;
  if (el.getAttribute('data-person-search') === 'true') return true;
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

/** 数値欄のあとでも、可能な限り日本語（かな）入力から始める */
export function focusWithJapaneseIme(el: HTMLInputElement | HTMLTextAreaElement | null): void {
  if (!el) return;
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

/** ヒト検索欄（時間・金額以外）向けの共通 input 属性 */
export function personSearchInputProps(
  extra?: InputHTMLAttributes<HTMLInputElement>
): InputHTMLAttributes<HTMLInputElement> {
  const { onFocus, ...rest } = extra ?? {};
  return {
    type: 'text',
    lang: 'ja',
    'data-ime': 'ja',
    'data-person-search': 'true',
    autoComplete: 'off',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    onFocus: ((e) => {
      ensureJapaneseImeForInput(e.currentTarget);
      onFocus?.(e);
    }) as FocusEventHandler<HTMLInputElement>,
    ...rest,
  };
}

export function applyJapaneseInputToElement(el: HTMLInputElement | HTMLTextAreaElement): void {
  if (el.getAttribute('data-ime') === 'ja' || el.getAttribute('data-person-search') === 'true') {
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

/** 数字・時刻欄以外は日本語入力（IME）優先。画面の出し入れ後も再適用する。 */
export function useJapaneseTextInputs(): void {
  useEffect(() => {
    applyJapaneseInputs(document);

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (shouldUseJapaneseInput(target)) applyJapaneseInputToElement(target);
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
