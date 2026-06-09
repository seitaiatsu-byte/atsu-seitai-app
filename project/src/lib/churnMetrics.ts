import { clinicMatchesRecord, type ClinicFullName } from './clinic';
import { isPlaceholderCustomerNumber } from './customerNumber';
import {
  classifyContractType,
  classifyProgramSubType,
  pickConversionVisit,
  programSubTypeLabel,
  type ContractType,
  type ProgramSubType,
  type VisitForContract,
} from './churnContractType';
import type { ChurnConfig } from './churnConfig';
import { windowDaysLabel } from './churnConfig';
import { filterQualifyingVisits, firstQualifyingVisitDate } from './repeatMetrics';

export type ChurnVisitRow = VisitForContract & {
  clinic_name?: string | null;
};

export type ChurnCustomerInput = {
  id: string;
  customer_number?: string | null;
  visits: ChurnVisitRow[];
};

export type ChurnWindowResult = {
  windowDays: number;
  label: string;
  churnRate: number;
  retentionRate: number;
  denominator: number;
  churnedCount: number;
  lowSample: boolean;
};

export type ChurnSegmentSummary = {
  segmentId: string;
  segmentLabel: string;
  contractType: ContractType;
  programSubType?: ProgramSubType;
  windows: ChurnWindowResult[];
};

function ymdOnly(raw: string): string {
  return String(raw).slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function hasReturnVisitInWindow(
  visits: ChurnVisitRow[],
  t0: string,
  windowDays: number,
  excludeKeywords: string[]
): boolean {
  const tEnd = addDaysYmd(t0, windowDays);
  const qualifying = filterQualifyingVisits(visits, excludeKeywords);
  return qualifying.some((v) => {
    const d = ymdOnly(v.visit_date);
    return d > t0 && d <= tEnd;
  });
}

type CohortMember = {
  contractType: ContractType;
  programSubType?: ProgramSubType;
  t0: string;
  visits: ChurnVisitRow[];
};

function buildCohort(
  customers: ChurnCustomerInput[],
  excludeKeywords: string[],
  programKeywords: string[],
  paymentDetailNames: Record<string, string>,
  clinicFilter: 'all' | 'takatsuki' | 'kawanishi'
): CohortMember[] {
  const cohort: CohortMember[] = [];

  for (const c of customers) {
    if (isPlaceholderCustomerNumber(c.customer_number)) continue;

    const scopedVisits = c.visits.filter((v) => clinicMatchesRecord(clinicFilter, v.clinic_name));
    const qualifying = filterQualifyingVisits(scopedVisits, excludeKeywords);
    const t0 = firstQualifyingVisitDate(scopedVisits, excludeKeywords);
    if (!t0) continue;

    const t0Ymd = ymdOnly(t0);
    const conversionVisit = pickConversionVisit(qualifying, t0Ymd, programKeywords, paymentDetailNames);
    if (!conversionVisit) continue;

    const contractType = classifyContractType(conversionVisit, programKeywords, paymentDetailNames);
    const member: CohortMember = {
      contractType,
      t0: t0Ymd,
      visits: scopedVisits,
    };
    if (contractType === 'program') {
      member.programSubType = classifyProgramSubType(conversionVisit, paymentDetailNames);
    }
    cohort.push(member);
  }

  return cohort;
}

function computeWindowsForGroup(
  members: CohortMember[],
  windowDaysList: number[],
  excludeKeywords: string[],
  todayYmd: string
): ChurnWindowResult[] {
  return windowDaysList.map((windowDays) => {
    let denominator = 0;
    let churnedCount = 0;

    for (const m of members) {
      const observationEnd = addDaysYmd(m.t0, windowDays);
      if (todayYmd < observationEnd) continue;
      denominator++;
      if (!hasReturnVisitInWindow(m.visits, m.t0, windowDays, excludeKeywords)) {
        churnedCount++;
      }
    }

    const churnRate =
      denominator === 0 ? 0 : Math.round((churnedCount / denominator) * 1000) / 10;
    return {
      windowDays,
      label: windowDaysLabel(windowDays),
      churnRate,
      retentionRate: Math.round((100 - churnRate) * 10) / 10,
      denominator,
      churnedCount,
      lowSample: denominator > 0 && denominator < 10,
    };
  });
}

function summarizeContractType(
  cohort: CohortMember[],
  contractType: ContractType,
  label: string,
  windowDaysList: number[],
  excludeKeywords: string[],
  todayYmd: string,
  programSubType?: ProgramSubType
): ChurnSegmentSummary | null {
  const members = cohort.filter((m) => {
    if (m.contractType !== contractType) return false;
    if (programSubType != null) return m.programSubType === programSubType;
    return true;
  });
  if (members.length === 0) return null;

  return {
    segmentId: programSubType ? `${contractType}_${programSubType}` : contractType,
    segmentLabel: programSubType ? programSubTypeLabel(programSubType) : label,
    contractType,
    programSubType,
    windows: computeWindowsForGroup(members, windowDaysList, excludeKeywords, todayYmd),
  };
}

export function computeChurnSummaries(params: {
  customers: ChurnCustomerInput[];
  excludeKeywords: string[];
  churnConfig: ChurnConfig;
  paymentDetailNames: Record<string, string>;
  clinicFilter?: 'all' | 'takatsuki' | 'kawanishi';
  today?: Date;
}): ChurnSegmentSummary[] {
  const {
    customers,
    excludeKeywords,
    churnConfig,
    paymentDetailNames,
    clinicFilter = 'all',
    today = new Date(),
  } = params;

  const todayYmd = ymdOnly(today.toISOString());
  const cohort = buildCohort(
    customers,
    excludeKeywords,
    churnConfig.programKeywords,
    paymentDetailNames,
    clinicFilter
  );

  const out: ChurnSegmentSummary[] = [];

  const single = summarizeContractType(
    cohort,
    'single',
    '①単発都度',
    churnConfig.windowsSingle,
    excludeKeywords,
    todayYmd
  );
  if (single) out.push(single);

  const programAll = summarizeContractType(
    cohort,
    'program',
    '②プログラム（全体）',
    churnConfig.windowsProgram,
    excludeKeywords,
    todayYmd
  );
  if (programAll) out.push(programAll);

  const subOrder: ProgramSubType[] = ['prog_6m', 'prog_3m', 'prog_10_12m', 'prog_other'];
  for (const sub of subOrder) {
    const subSummary = summarizeContractType(
      cohort,
      'program',
      '',
      churnConfig.windowsProgram,
      excludeKeywords,
      todayYmd,
      sub
    );
    if (subSummary && subSummary.windows.some((w) => w.denominator > 0)) {
      out.push(subSummary);
    }
  }

  const ticket = summarizeContractType(
    cohort,
    'ticket',
    '③回数券',
    churnConfig.windowsTicket,
    excludeKeywords,
    todayYmd
  );
  if (ticket) out.push(ticket);

  return out;
}
