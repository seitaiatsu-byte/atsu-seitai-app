import { clinicMatchesRecord } from './clinic';
import { isPlaceholderCustomerNumber } from './customerNumber';
import { programSubTypeLabel, type ContractType, type ProgramSubType } from './churnContractType';
import type { ChurnConfig } from './churnConfig';
import { windowDaysLabel } from './churnConfig';
import {
  addDaysYmd,
  buildMainProductEpisode,
  findFirstFinalVisitAfter,
  hasAnyVisitInRange,
  hasRepurchaseAfter,
  isFinalVisitMarker,
  isRevisitMarker,
  isShokaiOnlyCustomer,
  type ChurnVisitRow,
  ymdOnly,
} from './churnVisitHelpers';

export type { ChurnVisitRow };

export type ChurnCustomerInput = {
  id: string;
  customer_number?: string | null;
  visits: ChurnVisitRow[];
};

export type ChurnMetricKind = 'dropout' | 'continuation' | 'revisit';

export type ChurnWindowResult = {
  windowDays: number;
  label: string;
  rate: number;
  complementRate: number;
  denominator: number;
  numerator: number;
  lowSample: boolean;
};

export type ChurnMetricSummary = {
  segmentId: string;
  segmentLabel: string;
  description: string;
  kind: ChurnMetricKind;
  windows: ChurnWindowResult[];
};

type EligibleCustomer = {
  visits: ChurnVisitRow[];
  episode: NonNullable<ReturnType<typeof buildMainProductEpisode>>;
};

function roundRate(hit: number, denom: number): number {
  return denom === 0 ? 0 : Math.round((hit / denom) * 1000) / 10;
}

function buildEligible(
  customers: ChurnCustomerInput[],
  excludeKeywords: string[],
  churnConfig: ChurnConfig,
  paymentDetailNames: Record<string, string>,
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi',
  contractFilter?: ContractType
): EligibleCustomer[] {
  const out: EligibleCustomer[] = [];

  for (const c of customers) {
    if (isPlaceholderCustomerNumber(c.customer_number)) continue;
    const scoped = c.visits.filter((v) => clinicMatchesRecord(clinicFilter, v.clinic_name));
    if (isShokaiOnlyCustomer(scoped, excludeKeywords)) continue;

    const episode = buildMainProductEpisode(
      scoped,
      churnConfig.mainProductKeywords,
      churnConfig.programKeywords,
      paymentDetailNames
    );
    if (!episode) continue;
    if (contractFilter && episode.contractType !== contractFilter) continue;
    out.push({ visits: scoped, episode });
  }

  return out;
}

function computeDropoutWindows(
  members: EligibleCustomer[],
  windowDaysList: number[],
  todayYmd: string
): ChurnWindowResult[] {
  return windowDaysList.map((windowDays) => {
    let denominator = 0;
    let dropped = 0;

    for (const m of members) {
      const observationEnd = addDaysYmd(m.episode.t0, windowDays);
      if (todayYmd < observationEnd) continue;
      denominator++;
      if (!hasAnyVisitInRange(m.visits, m.episode.t0, observationEnd)) {
        dropped++;
      }
    }

    const rate = roundRate(dropped, denominator);
    return {
      windowDays,
      label: windowDaysLabel(windowDays),
      rate,
      complementRate: Math.round((100 - rate) * 10) / 10,
      denominator,
      numerator: dropped,
      lowSample: denominator > 0 && denominator < 10,
    };
  });
}

function computeContinuationAfterEnd(
  members: EligibleCustomer[],
  endYmdFor: (m: EligibleCustomer) => string | null,
  windowDaysList: number[],
  todayYmd: string,
  churnConfig: ChurnConfig,
  paymentDetailNames: Record<string, string>
): ChurnWindowResult[] {
  return windowDaysList.map((windowDays) => {
    let denominator = 0;
    let continued = 0;

    for (const m of members) {
      const endYmd = endYmdFor(m);
      if (!endYmd) continue;
      const observationEnd = addDaysYmd(endYmd, windowDays);
      if (todayYmd < observationEnd) continue;
      denominator++;
      if (
        hasRepurchaseAfter(
          m.visits,
          endYmd,
          observationEnd,
          churnConfig.mainProductKeywords,
          churnConfig.programKeywords,
          churnConfig.revisitKeywords,
          paymentDetailNames
        )
      ) {
        continued++;
      }
    }

    const rate = roundRate(continued, denominator);
    return {
      windowDays,
      label: windowDaysLabel(windowDays),
      rate,
      complementRate: Math.round((100 - rate) * 10) / 10,
      denominator,
      numerator: continued,
      lowSample: denominator > 0 && denominator < 10,
    };
  });
}

function computeRevisitWindows(
  customers: ChurnCustomerInput[],
  excludeKeywords: string[],
  churnConfig: ChurnConfig,
  paymentDetailNames: Record<string, string>,
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi',
  todayYmd: string
): ChurnWindowResult[] {
  return churnConfig.windowsRevisit.map((windowDays) => {
    let denominator = 0;
    let revisited = 0;

    for (const c of customers) {
      if (isPlaceholderCustomerNumber(c.customer_number)) continue;
      const scoped = c.visits.filter((v) => clinicMatchesRecord(clinicFilter, v.clinic_name));
      if (isShokaiOnlyCustomer(scoped, excludeKeywords)) continue;

      for (const v of scoped) {
        if (!isFinalVisitMarker(v, churnConfig.finalVisitKeywords, paymentDetailNames)) continue;
        const finalYmd = ymdOnly(v.visit_date);
        const observationEnd = addDaysYmd(finalYmd, windowDays);
        if (todayYmd < observationEnd) continue;
        denominator++;
        const hit =
          hasRepurchaseAfter(
            scoped,
            finalYmd,
            observationEnd,
            churnConfig.mainProductKeywords,
            churnConfig.programKeywords,
            churnConfig.revisitKeywords,
            paymentDetailNames
          ) ||
          scoped.some((x) => {
            const d = ymdOnly(x.visit_date);
            return (
              d > finalYmd &&
              d <= observationEnd &&
              isRevisitMarker(x, churnConfig.revisitKeywords, paymentDetailNames)
            );
          });
        if (hit) revisited++;
      }
    }

    const rate = roundRate(revisited, denominator);
    return {
      windowDays,
      label: windowDaysLabel(windowDays),
      rate,
      complementRate: Math.round((100 - rate) * 10) / 10,
      denominator,
      numerator: revisited,
      lowSample: denominator > 0 && denominator < 10,
    };
  });
}

export function computeChurnSummaries(params: {
  customers: ChurnCustomerInput[];
  excludeKeywords: string[];
  churnConfig: ChurnConfig;
  paymentDetailNames: Record<string, string>;
  clinicFilter?: 'all' | 'takatsuki' | 'kawanishi';
  today?: Date;
}): ChurnMetricSummary[] {
  const {
    customers,
    excludeKeywords,
    churnConfig,
    paymentDetailNames,
    clinicFilter = 'all',
    today = new Date(),
  } = params;

  const todayYmd = ymdOnly(today.toISOString());
  const out: ChurnMetricSummary[] = [];

  const flatMembers = buildEligible(
    customers,
    excludeKeywords,
    churnConfig,
    paymentDetailNames,
    clinicFilter
  );

  out.push({
    segmentId: 'flat_be',
    segmentLabel: 'A. 全体（本商品購入者・フラット）',
    description: '本商品購入日から○日以内に来院なし＝離脱。6M/10M同一物差し。',
    kind: 'dropout',
    windows: computeDropoutWindows(flatMembers, churnConfig.windowsFlat, todayYmd),
  });

  const singleMembers = buildEligible(
    customers,
    excludeKeywords,
    churnConfig,
    paymentDetailNames,
    clinicFilter,
    'single'
  );
  out.push({
    segmentId: 'single_dropout',
    segmentLabel: 'B-1. 都度',
    description: '都度で本商品購入した人の離脱率（購入日起点）。',
    kind: 'dropout',
    windows: computeDropoutWindows(singleMembers, churnConfig.windowsSingle, todayYmd),
  });

  const ticketMembers = buildEligible(
    customers,
    excludeKeywords,
    churnConfig,
    paymentDetailNames,
    clinicFilter,
    'ticket'
  );
  out.push({
    segmentId: 'ticket_post_repurchase',
    segmentLabel: 'B-2. 回数券（消化後の再購入率）',
    description: '回数券成約者で最終回マーク以降、○日以内に商品を再購入した割合。',
    kind: 'continuation',
    windows: computeContinuationAfterEnd(
      ticketMembers,
      (m) => {
        const finalV = findFirstFinalVisitAfter(
          m.visits,
          m.episode.t0,
          churnConfig.finalVisitKeywords,
          paymentDetailNames
        );
        return finalV ? ymdOnly(finalV.visit_date) : null;
      },
      churnConfig.windowsPostTicket,
      todayYmd,
      churnConfig,
      paymentDetailNames
    ),
  });

  const programMembers = buildEligible(
    customers,
    excludeKeywords,
    churnConfig,
    paymentDetailNames,
    clinicFilter,
    'program'
  );
  out.push({
    segmentId: 'program_post_all',
    segmentLabel: 'B-3. プログラム（終了後の継続購入率）',
    description: 'プログラム終了（最終回マーク or 想定期間）後、○日以内に再購入した割合。',
    kind: 'continuation',
    windows: computeContinuationAfterEnd(
      programMembers,
      (m) =>
        ymdOnly(
          findFirstFinalVisitAfter(
            m.visits,
            m.episode.t0,
            churnConfig.finalVisitKeywords,
            paymentDetailNames
          )?.visit_date ??
            addDaysYmd(
              m.episode.t0,
              m.episode.programSubType === 'prog_3m'
                ? 90
                : m.episode.programSubType === 'prog_10_12m'
                  ? 365
                  : m.episode.programSubType === 'prog_6m'
                    ? 180
                    : 180
            )
        ),
      churnConfig.windowsPostProgram,
      todayYmd,
      churnConfig,
      paymentDetailNames
    ),
  });

  const subOrder: ProgramSubType[] = ['prog_6m', 'prog_3m', 'prog_10_12m', 'prog_other'];
  for (const sub of subOrder) {
    const subMembers = programMembers.filter((m) => m.episode.programSubType === sub);
    if (subMembers.length === 0) continue;
    const subWindows = computeContinuationAfterEnd(
      subMembers,
      (m) =>
        ymdOnly(
          findFirstFinalVisitAfter(
            m.visits,
            m.episode.t0,
            churnConfig.finalVisitKeywords,
            paymentDetailNames
          )?.visit_date ??
            addDaysYmd(
              m.episode.t0,
              sub === 'prog_3m' ? 90 : sub === 'prog_10_12m' ? 365 : 180
            )
        ),
      churnConfig.windowsPostProgram,
      todayYmd,
      churnConfig,
      paymentDetailNames
    );
    if (!subWindows.some((w) => w.denominator > 0)) continue;
    out.push({
      segmentId: `program_post_${sub}`,
      segmentLabel: `B-3. ${programSubTypeLabel(sub)}（終了後）`,
      description: `${programSubTypeLabel(sub)}終了後の再購入率。`,
      kind: 'continuation',
      windows: subWindows,
    });
  }

  out.push({
    segmentId: 'revisit_rate',
    segmentLabel: 'C. 再診率（最終回マーク後）',
    description: '最終回メニュー付き来院のあと、○日以内に再診 or 本商品再購入した割合。',
    kind: 'revisit',
    windows: computeRevisitWindows(
      customers,
      excludeKeywords,
      churnConfig,
      paymentDetailNames,
      clinicFilter,
      todayYmd
    ),
  });

  return out;
}

/** @deprecated 旧型互換 — ChurnRateSummary 用 */
export type ChurnSegmentSummary = ChurnMetricSummary;
