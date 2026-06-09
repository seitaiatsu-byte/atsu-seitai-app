import { UTILIZATION_GUIDANCE } from '../lib/utilizationMetrics';

/** 稼働率の経営判断目安（折りたたみ・小さく表示） */
export default function UtilizationGuidanceHint() {
  return (
    <details className="text-[11px] text-gray-500 border-t border-gray-100 pt-2 mt-3">
      <summary className="cursor-pointer select-none hover:text-gray-700">
        稼働率の目安（経営判断）
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-gray-400">
              <th className="py-1 pr-2 font-normal whitespace-nowrap">稼働率</th>
              <th className="py-1 font-normal">経営判断</th>
            </tr>
          </thead>
          <tbody>
            {UTILIZATION_GUIDANCE.map((band) => (
              <tr key={band.id} className="border-t border-gray-100 align-top">
                <td className="py-1 pr-2 whitespace-nowrap text-gray-600 font-medium">{band.label}</td>
                <td className="py-1 text-gray-500 leading-snug">{band.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
