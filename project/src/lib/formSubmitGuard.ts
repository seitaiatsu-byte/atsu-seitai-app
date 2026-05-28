import type { FormEvent, KeyboardEvent } from 'react';

/** フォームの Enter 送信を抑止（textarea は改行のため除外） */
export function blockEnterFormSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter') return;
  if (e.target instanceof HTMLTextAreaElement) return;
  e.preventDefault();
}

/** ブラウザの暗黙的フォーム送信を無効化（登録はボタンクリックのみ） */
export function swallowFormSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
}
