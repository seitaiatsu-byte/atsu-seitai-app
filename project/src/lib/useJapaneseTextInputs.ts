import { useEffect } from 'react';

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
  if (el instanceof HTMLInputElement) {
    const type = (el.type || 'text').toLowerCase();
    if (NUMERIC_INPUT_TYPES.has(type)) return false;
  }
  const mode = (el.getAttribute('inputmode') || '').toLowerCase();
  return mode !== 'numeric' && mode !== 'decimal';
}

export function applyJapaneseInputToElement(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.setAttribute('lang', 'ja');
  el.setAttribute('inputmode', 'text');
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
