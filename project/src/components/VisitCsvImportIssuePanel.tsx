import { useMemo, useState } from 'react';
import { AlertCircle, Download, Pencil, Trash2, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import { VISIT_CSV_HEADER_LINE } from '../lib/visitCsvTemplate';
import { assignVisitNumbersInBatch, fetchMaxVisitNumberByCustomer } from '../lib/visitNumber';
import { toErrorMessage } from '../lib/toErrorMessage';
import {
  isMissingImportKindTextColumnError,
  visitInsertOmittingImportKindText,
} from '../lib/visitRecordKindCompat';
import {
  padVisitCsvCells,
  validateVisitCsvDataRow,
  type VisitCsvValidateContext,
} from '../lib/visitCsvImportRowValidate';
import { recalcBeEquivalentCountsForCustomers } from '../lib/beEquivalentRecalc';
import ModalCloseButton from './ModalCloseButton';

type VisitInsert = Database['public']['Tables']['visit_records']['Insert'];

export type VisitCsvImportIssueRow = {
  id: string;
  line: number;
  reason: string;
  cells: string[];
  kind: 'skipped' | 'mismatch_imported';
  visitRecordId?: string;
};

const COLUMN_LABELS = VISIT_CSV_HEADER_LINE.split(',');

type Props = {
  rows: VisitCsvImportIssueRow[];
  validateCtx: VisitCsvValidateContext;
  onRowsChange: (rows: VisitCsvImportIssueRow[]) => void;
  onImported?: (info: { success: boolean; message: string }) => void;
};

export default function VisitCsvImportIssuePanel({
  rows,
  validateCtx,
  onRowsChange,
  onImported,
}: Props) {
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editPaymentRow, setEditPaymentRow] = useState<VisitCsvImportIssueRow | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState('');

  const skippedCount = rows.filter((r) => r.kind === 'skipped').length;
  const mismatchCount = rows.filter((r) => r.kind === 'mismatch_imported').length;

  const updateCells = (id: string, col: number, value: string) => {
    onRowsChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        const cells = padVisitCsvCells(r.cells);
        cells[col] = value;
        return { ...r, cells };
      })
    );
  };

  const dismissRow = (id: string) => {
    onRowsChange(rows.filter((r) => r.id !== id));
  };

  const downloadErrorCsv = () => {
    const header = VISIT_CSV_HEADER_LINE + ',エラー理由,区分';
    const body = rows
      .map((r) => {
        const cells = padVisitCsvCells(r.cells).map((c) => `"${String(c).replace(/"/g, '""')}"`);
        const kindLabel = r.kind === 'skipped' ? '未登録' : '支払未解決で登録済';
        return [...cells, `"${r.reason.replace(/"/g, '""')}"`, `"${kindLabel}"`].join(',');
      })
      .join('\n');
    const blob = new Blob(['\ufeff' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '来院CSVエラー行.csv';
    a.click();
  };

  const insertValidatedRow = async (issue: VisitCsvImportIssueRow) => {
    setBusyId(issue.id);
    try {
      const parsed = validateVisitCsvDataRow(issue.cells, validateCtx);
      if (!parsed.ok) {
        onImported?.({ success: false, message: `行${issue.line}: ${parsed.reason}` });
        onRowsChange(
          rows.map((r) => (r.id === issue.id ? { ...r, reason: parsed.reason } : r))
        );
        return;
      }

      const { validated, infoMessages } = parsed;
      const { data: existing, error: exErr } = await supabase
        .from('visit_records')
        .select('id')
        .eq('customer_id', validated.customerId)
        .eq('visit_date', validated.visitDate)
        .maybeSingle();
      if (exErr) {
        onImported?.({ success: false, message: `行${issue.line}: 重複確認に失敗: ${toErrorMessage(exErr)}` });
        return;
      }
      if (existing?.id) {
        const reason = `同一顧客・${validated.visitDate} の来院は既に登録済`;
        onImported?.({ success: false, message: `行${issue.line}: ${reason}` });
        onRowsChange(rows.map((r) => (r.id === issue.id ? { ...r, reason } : r)));
        return;
      }

      const maxRes = await fetchMaxVisitNumberByCustomer(supabase, [validated.customerId]);
      if (!maxRes.ok) {
        onImported?.({ success: false, message: `行${issue.line}: 通院採番の取得に失敗: ${maxRes.message}` });
        return;
      }
      const visitNumbers = assignVisitNumbersInBatch(maxRes.map, [
        { customerId: validated.customerId, visitDate: validated.visitDate, orderKey: 0 },
      ]);
      const payload: VisitInsert = {
        ...validated.insert,
        visit_number: visitNumbers[0] ?? 1,
      };

      let insertedId: string | undefined;
      const tryInsert = await supabase.from('visit_records').insert([payload]).select('id');
      if (tryInsert.error && isMissingImportKindTextColumnError(tryInsert.error)) {
        const r2 = await supabase
          .from('visit_records')
          .insert([visitInsertOmittingImportKindText(payload)])
          .select('id');
        if (r2.error) {
          onImported?.({ success: false, message: `行${issue.line}: 登録失敗: ${toErrorMessage(r2.error)}` });
          return;
        }
        insertedId = r2.data?.[0]?.id;
      } else if (tryInsert.error) {
        onImported?.({ success: false, message: `行${issue.line}: 登録失敗: ${toErrorMessage(tryInsert.error)}` });
        return;
      } else {
        insertedId = tryInsert.data?.[0]?.id;
      }

      await recalcBeEquivalentCountsForCustomers([validated.customerId]);
      window.dispatchEvent(new Event('records-updated'));

      if (validated.payMismatch && insertedId) {
        onRowsChange(
          rows.map((r) =>
            r.id === issue.id
              ? {
                  ...r,
                  kind: 'mismatch_imported' as const,
                  visitRecordId: insertedId,
                  reason: '5列目はマスタ未解決のため payment_method を空欄で登録。',
                }
              : r
          )
        );
        onImported?.({
          success: true,
          message: `行${issue.line}: 登録しました（支払方法は未解決のまま。下で修正できます）。`,
        });
      } else {
        onRowsChange(rows.filter((r) => r.id !== issue.id));
        const extra = infoMessages.length ? ` ${infoMessages.join(' ')}` : '';
        onImported?.({ success: true, message: `行${issue.line}: 登録しました。${extra}` });
      }
    } finally {
      setBusyId(null);
    }
  };

  const deleteImportedRow = async (issue: VisitCsvImportIssueRow) => {
    if (!issue.visitRecordId) return;
    if (!window.confirm(`行${issue.line} の来院記録を削除しますか？`)) return;
    setBusyId(issue.id);
    try {
      const { data: row, error: fetchErr } = await supabase
        .from('visit_records')
        .select('customer_id')
        .eq('id', issue.visitRecordId)
        .maybeSingle();
      if (fetchErr) {
        onImported?.({ success: false, message: `削除前の取得に失敗: ${toErrorMessage(fetchErr)}` });
        return;
      }
      const { error } = await supabase.from('visit_records').delete().eq('id', issue.visitRecordId);
      if (error) {
        onImported?.({ success: false, message: `削除失敗: ${toErrorMessage(error)}` });
        return;
      }
      if (row?.customer_id) await recalcBeEquivalentCountsForCustomers([row.customer_id]);
      window.dispatchEvent(new Event('records-updated'));
      onRowsChange(rows.filter((r) => r.id !== issue.id));
      onImported?.({ success: true, message: `行${issue.line}: 来院記録を削除しました。` });
    } finally {
      setBusyId(null);
    }
  };

  const openPaymentEdit = (issue: VisitCsvImportIssueRow) => {
    setEditPaymentRow(issue);
    setPaymentMethodId('');
  };

  const savePaymentEdit = async () => {
    if (!editPaymentRow?.visitRecordId || !paymentMethodId) return;
    setBusyId(editPaymentRow.id);
    try {
      const { data: row, error: fetchErr } = await supabase
        .from('visit_records')
        .select('customer_id')
        .eq('id', editPaymentRow.visitRecordId)
        .maybeSingle();
      if (fetchErr) {
        onImported?.({ success: false, message: `取得失敗: ${toErrorMessage(fetchErr)}` });
        return;
      }
      const { error } = await supabase
        .from('visit_records')
        .update({ payment_method: paymentMethodId })
        .eq('id', editPaymentRow.visitRecordId);
      if (error) {
        onImported?.({ success: false, message: `支払の更新に失敗: ${toErrorMessage(error)}` });
        return;
      }
      if (row?.customer_id) await recalcBeEquivalentCountsForCustomers([row.customer_id]);
      window.dispatchEvent(new Event('records-updated'));
      onRowsChange(rows.filter((r) => r.id !== editPaymentRow.id));
      onImported?.({ success: true, message: `行${editPaymentRow.line}: 支払方法を更新しました。` });
      setEditPaymentRow(null);
    } finally {
      setBusyId(null);
    }
  };

  const methodOptions = useMemo(
    () => validateCtx.methods.filter((m) => m.id && m.name),
    [validateCtx.methods]
  );

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border-2 border-orange-300 bg-orange-50/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-orange-100/60"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertCircle className="text-orange-700 shrink-0" size={20} />
          <span className="font-bold text-orange-950">
            問題のある行を確認・修正（{rows.length}件）
          </span>
        </div>
        <span className="text-sm font-bold text-orange-800 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-orange-200 bg-white p-3 space-y-3">
          <div className="text-xs text-gray-700 space-y-1">
            <p>
              上の「スキップの内訳」と同じ行を、<strong>CSVの中身ごと</strong>表示しています。
              未登録行はセルを直して<strong>登録</strong>、支払未解決で入った行は<strong>支払修正</strong>または<strong>削除</strong>できます。
            </p>
            <p className="text-gray-600">
              未登録 {skippedCount} 件 / 支払未解決で登録済 {mismatchCount} 件
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadErrorCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-orange-300 bg-white text-orange-900 text-xs font-bold hover:bg-orange-50"
            >
              <Download size={14} />
              エラー行CSVを保存
            </button>
          </div>

          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {rows.map((issue) => {
              const cells = padVisitCsvCells(issue.cells);
              const isBusy = busyId === issue.id;
              const readOnly = issue.kind === 'mismatch_imported';
              return (
                <div
                  key={issue.id}
                  className={`rounded-lg border p-2 ${
                    issue.kind === 'skipped' ? 'border-amber-300 bg-amber-50/40' : 'border-blue-300 bg-blue-50/40'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 text-xs">
                      <span className="font-bold text-gray-900">行{issue.line}</span>
                      <span className="ml-2 text-gray-600">
                        {issue.kind === 'skipped' ? '未登録' : '支払未解決で登録済'}
                      </span>
                      <div className="text-orange-900 font-bold mt-0.5">{issue.reason}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {issue.kind === 'skipped' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void insertValidatedRow(issue)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-green-400 bg-green-50 text-green-800 text-[11px] font-bold hover:bg-green-100 disabled:opacity-50"
                        >
                          <Upload size={12} />
                          登録
                        </button>
                      )}
                      {issue.kind === 'mismatch_imported' && issue.visitRecordId && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openPaymentEdit(issue)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-blue-400 bg-blue-50 text-blue-800 text-[11px] font-bold hover:bg-blue-100 disabled:opacity-50"
                          >
                            <Pencil size={12} />
                            支払修正
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void deleteImportedRow(issue)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-400 bg-red-50 text-red-800 text-[11px] font-bold hover:bg-red-100 disabled:opacity-50"
                          >
                            <Trash2 size={12} />
                            削除
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => dismissRow(issue.id)}
                        className="px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 text-[11px] font-bold hover:bg-gray-50 disabled:opacity-50"
                      >
                        一覧から外す
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-[52rem] w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          {COLUMN_LABELS.map((label, col) => (
                            <th
                              key={label}
                              className={`border border-slate-200 px-1 py-1 font-bold whitespace-nowrap ${
                                col === 4 && issue.kind === 'mismatch_imported' ? 'bg-blue-100' : ''
                              }`}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {cells.map((cell, col) => (
                            <td
                              key={col}
                              className={`border border-slate-200 p-0 ${
                                col === 4 && issue.kind === 'mismatch_imported' ? 'bg-blue-50' : ''
                              }`}
                            >
                              {readOnly ? (
                                <div className="px-1.5 py-1 truncate max-w-[8rem]" title={cell}>
                                  {cell || '—'}
                                </div>
                              ) : (
                                <input
                                  type="text"
                                  value={cell}
                                  onChange={(e) => updateCells(issue.id, col, e.target.value)}
                                  className="w-full min-w-[4.5rem] px-1.5 py-1 border-0 bg-transparent focus:bg-white focus:ring-1 focus:ring-blue-300 outline-none"
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editPaymentRow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">支払方法を修正（行{editPaymentRow.line}）</h3>
              <ModalCloseButton onClick={() => setEditPaymentRow(null)} />
            </div>
            <p className="text-xs text-gray-600 mb-3">
              CSVの「{editPaymentRow.cells[4] || '（空）'}」はマスタに無かったため空欄で登録されています。正しい支払を選んで保存してください。
            </p>
            <select
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">選択してください</option>
              {methodOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!paymentMethodId || busyId === editPaymentRow.id}
              onClick={() => void savePaymentEdit()}
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-50"
            >
              保存する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
