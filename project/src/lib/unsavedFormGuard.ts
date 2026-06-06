import { useCallback, useEffect, useState } from 'react';

export const UNSAVED_LEAVE_MESSAGE = '未完了やで';

const dirtyFormIds = new Set<string>();

export function setUnsavedFormDirty(formId: string, dirty: boolean): void {
  if (dirty) dirtyFormIds.add(formId);
  else dirtyFormIds.delete(formId);
}

export function hasUnsavedForms(): boolean {
  return dirtyFormIds.size > 0;
}

/**
 * 未保存の入力があれば確認する。
 * OK＝このまま移動、キャンセル＝留まって登録を続けられる。
 */
export function confirmLeaveIfUnsaved(): boolean {
  if (!hasUnsavedForms()) return true;
  return window.confirm(`${UNSAVED_LEAVE_MESSAGE}\n\nこのまま移動しますか？`);
}

/** 未保存があれば確認し、OK のときだけ action を実行 */
export function guardNavigation(action: () => void): void {
  if (confirmLeaveIfUnsaved()) action();
}

export function useUnsavedFormGuard(formId: string, isDirty: boolean): void {
  useEffect(() => {
    setUnsavedFormDirty(formId, isDirty);
    return () => setUnsavedFormDirty(formId, false);
  }, [formId, isDirty]);
}

/** 登録・修正フォーム内の入力開始を検知（保存完了まで dirty） */
export function useFormInputTouched(active: boolean) {
  const [isTouched, setIsTouched] = useState(false);

  useEffect(() => {
    if (!active) setIsTouched(false);
  }, [active]);

  const clearTouched = useCallback(() => setIsTouched(false), []);
  const markTouched = useCallback(() => setIsTouched(true), []);

  const formInputProps = {
    onInput: markTouched,
  } as const;

  return { isTouched, clearTouched, markTouched, formInputProps };
}
