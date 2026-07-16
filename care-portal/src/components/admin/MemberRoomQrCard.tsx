import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download } from 'lucide-react';
import { roomUrl } from '../../lib/session';

type Props = {
  memberName: string;
  roomCode: string;
  /** コンパクト表示（一覧用） */
  compact?: boolean;
};

export default function MemberRoomQrCard({ memberName, roomCode, compact }: Props) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');
  const url = roomUrl(roomCode);

  useEffect(() => {
    let cancelled = false;
    setError('');
    void QRCode.toDataURL(url, {
      width: compact ? 200 : 280,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((png) => {
        if (!cancelled) setDataUrl(png);
      })
      .catch(() => {
        if (!cancelled) setError('QRの作成に失敗しました');
      });
    return () => {
      cancelled = true;
    };
  }, [url, compact]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert('URLをコピーしました');
    } catch {
      alert('コピーに失敗しました');
    }
  };

  const downloadPng = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${roomCode}.png`;
    a.click();
  };

  return (
    <div className={`rounded-2xl border-2 border-teal-200 bg-teal-50/50 ${compact ? 'p-3' : 'p-4'}`}>
      <p className={`font-bold text-teal-900 ${compact ? 'text-sm' : 'text-base'}`}>
        会員用QRコード（LINE・紙に貼る用）
      </p>
      <p className={`text-slate-600 mt-1 leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
        {memberName} さんがスマホで読み取ると、入室画面が開きます。あわせて<strong>入室パス</strong>をお渡しください。
      </p>

      <div className="mt-3 flex flex-col sm:flex-row items-center gap-4">
        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
          {error ? (
            <p className="text-red-700 text-sm p-4">{error}</p>
          ) : dataUrl ? (
            <img
              src={dataUrl}
              alt={`${memberName}さんの入室用QRコード`}
              className={compact ? 'w-[200px] h-[200px]' : 'w-[280px] h-[280px]'}
            />
          ) : (
            <div
              className={`flex items-center justify-center text-slate-400 text-sm ${
                compact ? 'w-[200px] h-[200px]' : 'w-[280px] h-[280px]'
              }`}
            >
              作成中…
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 w-full space-y-2">
          <p className="text-xs text-slate-500 font-bold">リンク先</p>
          <p className="text-xs sm:text-sm font-mono break-all bg-white border rounded-lg p-2">{url}</p>
          <div className="flex flex-wrap gap-2 pt-1 no-print">
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border bg-white text-sm font-bold hover:bg-slate-50"
            >
              <Copy size={14} />
              URLコピー
            </button>
            <button
              type="button"
              disabled={!dataUrl}
              onClick={downloadPng}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 disabled:opacity-50"
            >
              <Download size={14} />
              QR画像を保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
