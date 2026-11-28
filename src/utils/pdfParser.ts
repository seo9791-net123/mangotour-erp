import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  COST_CATEGORIES,
  type CostCategory,
  type CostCurrency,
  type CostItem,
  type MasterPrice,
  type ParsedQuoteResult,
  type Reservation,
  type ScheduleItem,
  type ScheduleType,
} from '../types/erp';
import { convertCostAmount, DEFAULT_VND_RATE } from './storage';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
}

const GOLF_COURSE_OR_ROUND_KEYWORDS = [
  '골프',
  '라운딩',
  '티오프',
  '티타임',
  '18홀',
  '9홀',
  '27홀',
  '36홀',
  '그린피',
  '카트피',
  '캐디피',
  '컨트리클럽',
  '트윈도브스',
  '롱탄',
  '떤선녓',
  '송베',
  '태광정산',
  '정산CC',
  '정산 CC',
  '하모니',
  '더 블러프',
];

const NON_GOLF_PRIMARY_TITLE_REGEX =
  /(조식|중식|석식|식사|만찬|런치|디너|마사지|스파|테라피|아로마|이발소|체크인|체크아웃|픽업|샌딩|자유시간|귀국|출국|도착)/i;

const EXPLICIT_GOLF_ROUND_REGEX =
  /(라운딩|티오프|티타임|18홀|9홀|27홀|36홀|골프\s*라운드|그린피)/i;

const CC_BOUNDARY_REGEX = /(^|[^A-Z0-9])(CC|C\.C|GOLF)([^A-Z0-9]|$)/i;

export function classifyScheduleType(title: string, detail: string, suggestedType?: string): ScheduleType {
  const safeTitle = String(title || '').trim();
  const safeDetail = String(detail || '').trim();

  // 식사(중식/조식/석식), 마사지, 픽업/체크인 등 비골프 활동은 절대 GOLF로 오분류하지 않음
  if (NON_GOLF_PRIMARY_TITLE_REGEX.test(safeTitle) && !EXPLICIT_GOLF_ROUND_REGEX.test(safeTitle)) {
    return 'TOUR';
  }

  if (suggestedType?.toUpperCase() === 'GOLF') {
    return 'GOLF';
  }

  const titleUpper = safeTitle.toUpperCase();
  const detailUpper = safeDetail.toUpperCase();
  const hasGolfInTitle =
    CC_BOUNDARY_REGEX.test(safeTitle) ||
    GOLF_COURSE_OR_ROUND_KEYWORDS.some((kw) => titleUpper.includes(kw.toUpperCase()));

  if (hasGolfInTitle) {
    return 'GOLF';
  }

  const hasExplicitRoundInDetail = EXPLICIT_GOLF_ROUND_REGEX.test(detailUpper);
  return hasExplicitRoundInDetail ? 'GOLF' : 'TOUR';
}

export function normalizeCostCategory(rawCategory: string, title = ''): CostCategory {
  const safeRaw = String(rawCategory || '').trim();
  const safeTitle = String(title || '').trim();
  const combined = `${safeTitle} ${safeRaw}`;

  // 식사와 마사지/옵션은 제목에 골프장 인근 표현이 있더라도 우선적으로 정확 분류
  const hasGolfFeeTerm = /(그린피|카트피|캐디피|라운딩|티오프)/i.test(safeTitle);
  if (!hasGolfFeeTerm && /(식사|조식|중식|석식|런치|디너|만찬|특식|뷔페|식당)/i.test(safeTitle)) {
    return '식사';
  }
  if (!hasGolfFeeTerm && /(마사지|스파|아로마|테라피|이발|발마사지|디너\s*크루즈|옵션)/i.test(safeTitle)) {
    return '마사지/옵션';
  }

  if (safeRaw === '마사지') return '마사지/옵션';
  if ((COST_CATEGORIES as readonly string[]).includes(safeRaw)) {
    return safeRaw as CostCategory;
  }

  if (/(식사|조식|중식|석식|런치|디너|만찬|특식|뷔페)/i.test(combined)) return '식사';
  if (/(마사지|스파|옵션|테라피|아로마|이발|크루즈)/i.test(combined)) return '마사지/옵션';
  if (/(숙박|호텔|리조트|객실|트윈|스위트)/i.test(combined)) return '숙박';
  if (/(차량|리무진|솔라티|버스|세단|렌트|픽업|샌딩|기사|유류)/i.test(combined)) return '차량';
  if (/(가이드|인솔)/i.test(combined)) return '가이드';
  if (/(골프|그린피|카트|캐디|라운딩|CC|C\.C)/i.test(combined)) return '골프장';
  return '기타';
}

export function isSimpleItineraryNotice(title: string): boolean {
  const safeTitle = String(title || '').trim();
  if (!safeTitle) return true;

  // 순수 휴식/체크인/이동 안내 문구 (숙박 박수나 유상 배차/티켓이 아닌 단순 안내)
  const pureRestOrMoveNotice =
    /(단순\s*휴식|오후\s*휴식|자유\s*휴식|휴식\s*시간|자유\s*시간|자유\s*일정|체크인\s*(및|후)\s*휴식|체크아웃\s*(및|후)\s*이동|라운딩\s*후\s*이동|차량\s*(으로|탑승\s*후)?\s*이동|공항\s*(으로)?\s*이동\s*(안내)?|이동\s*안내|출국\s*수속|입국\s*수속|수하물\s*안내|여권\s*유효|유의\s*사항|참고\s*사항|안내\s*문구|개인\s*경비|매너\s*팁|불포함\s*안내|개별\s*출발|인천\s*도착|귀국\s*안내)/i.test(
      safeTitle
    );

  const hasExplicitPaidService =
    /(숙박|\d+박|객실|트윈|스위트|전용\s*차량|리무진|솔라티|렌트|픽업|샌딩|가이드\s*동행|가이드비|조식|중식|석식|특식|만찬|마사지|스파|테라피|그린피|카트|캐디|18홀|9홀|27홀|36홀|입장료|티켓|크루즈|항공|보험|유심|비자)/i.test(
      safeTitle
    );

  if (pureRestOrMoveNotice && !hasExplicitPaidService) {
    return true;
  }

  return false;
}

function pad2(num: number): string {
  return String(num).padStart(2, '0');
}

function addDaysToIsoDate(baseIsoDate: string, offsetDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baseIsoDate);
  if (!match) return baseIsoDate;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month, day + offsetDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function resolveScheduleDate(rawDate: string | undefined, startDate: string, dayNumber: number): string {
  const trimmed = String(rawDate || '').trim();
  const fullMatch = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(trimmed);
  if (fullMatch) {
    const year = Number(fullMatch[1]);
    const month = Number(fullMatch[2]);
    const day = Number(fullMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const shortMatch = /^(\d{1,2})[-./](\d{1,2})$/.exec(trimmed);
  const startMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (shortMatch && startMatch) {
    const startYear = Number(startMatch[1]);
    const startMonth = Number(startMatch[2]);
    const month = Number(shortMatch[1]);
    const day = Number(shortMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = month < startMonth && startMonth === 12 ? startYear + 1 : startYear;
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  return addDaysToIsoDate(startDate, Math.max(0, (Number(dayNumber) || 1) - 1));
}

export async function renderPdfToImages(file: File, maxPages = 6): Promise<RenderedPdfPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages: RenderedPdfPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetScale = Math.min(1.6, 1240 / Math.max(baseViewport.width, 1));
    const viewport = page.getViewport({ scale: targetScale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('브라우저 캔버스 컨텍스트를 초기화할 수 없습니다.');
    }
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    pages.push({
      pageNumber: i,
      dataUrl,
    });
  }

  return pages;
}

export async function renderImageFileToImages(file: File): Promise<RenderedPdfPage[]> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('견적서 이미지를 불러올 수 없습니다.'));
      image.src = objectUrl;
    });

    const maxWidth = 1240;
    const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('브라우저 캔버스 컨텍스트를 초기화할 수 없습니다.');
    }
    canvas.width = width;
    canvas.height = height;
    context.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    return [{ pageNumber: 1, dataUrl }];
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function analyzePdfQuoteWithGemini(
  pages: RenderedPdfPage[],
  fileName: string
): Promise<ParsedQuoteResult> {
  const response = await fetch('/api/parse-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      images: pages.map((p) => ({
        mimeType: 'image/jpeg',
        data: p.dataUrl,
      })),
    }),
  });

  const rawText = await response.text();
  let payload: { data?: ParsedQuoteResult; error?: string } | null = null;
  try {
    payload = rawText ? (JSON.parse(rawText) as { data?: ParsedQuoteResult; error?: string }) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (payload?.error) {
      throw new Error(payload.error);
    }
    if (response.status === 413) {
      throw new Error('PDF 이미지 용량이 서버 허용 한도를 초과했습니다. 페이지 수를 줄여 다시 시도해 주세요.');
    }
    throw new Error(
      `PDF 분석 서버 응답 오류 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`
    );
  }

  if (!payload?.data) {
    throw new Error('PDF 분석 결과를 해석할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  return payload.data;
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface MatchedMasterPriceResult {
  masterPrice: MasterPrice;
  isWeekend: boolean;
  amount: number;
  currency: CostCurrency;
}

/**
 * 실제 진행 날짜(YYYY-MM-DD)가 금/토/일(주말)인지 판별합니다.
 */
export function isWeekendServiceDate(isoDate: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || '').trim());
  if (!match) return false;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = dt.getUTCDay(); // 0=일, 5=금, 6=토
  return day === 0 || day === 5 || day === 6;
}

function normalizeMatchText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function matchMasterPrice(
  title: string,
  category: CostCategory,
  serviceDate: string,
  masterPrices: MasterPrice[]
): MatchedMasterPriceResult | null {
  const safePrices = Array.isArray(masterPrices) ? masterPrices : [];
  if (safePrices.length === 0) return null;

  const normalizedTitle = normalizeMatchText(title);
  if (!normalizedTitle) return null;

  let bestMatch: {
    price: MasterPrice;
    score: number;
  } | null = null;

  for (const mp of safePrices) {
    if (!mp || !mp.keyword) continue;
    const rawKeywords = mp.keyword
      .split(/[,|]/)
      .map((k) => k.trim())
      .filter(Boolean);
    const candidates = rawKeywords.length > 0 ? rawKeywords : [mp.keyword.trim()];

    for (const kw of candidates) {
      const normalizedKw = normalizeMatchText(kw);
      if (normalizedKw.length < 2) continue;
      if (!normalizedTitle.includes(normalizedKw)) continue;

      const categoryBonus = mp.category === category ? 1000 : 0;
      const score = categoryBonus + normalizedKw.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { price: mp, score };
      }
    }
  }

  if (!bestMatch) return null;

  const mp = bestMatch.price;
  const isWeekend = isWeekendServiceDate(serviceDate);
  const weekday = Number(mp.weekdayPrice) || 0;
  const weekend = Number(mp.weekendPrice) || 0;
  const amount = isWeekend ? (weekend > 0 ? weekend : weekday) : weekday > 0 ? weekday : weekend;
  const currency: CostCurrency =
    mp.currency === 'VND' || mp.currency === 'KRW' ? mp.currency : 'USD';

  return {
    masterPrice: mp,
    isWeekend,
    amount,
    currency,
  };
}

export function buildReservationFromParsedQuote(
  parsed: ParsedQuoteResult,
  masterPrices: MasterPrice[] = []
): Reservation {
  const id = generateUuid();
  const exchangeRate = Number(parsed?.exchangeRate) > 0 ? Number(parsed.exchangeRate) : 1400;
  const vndExchangeRate = DEFAULT_VND_RATE;
  const totalPriceUsd =
    Number(parsed?.totalPriceUsd) || Math.round((Number(parsed?.totalPriceKrw) || 0) / exchangeRate);
  const totalPriceKrw = Number(parsed?.totalPriceKrw) || Math.round(totalPriceUsd * exchangeRate);

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const startDate = resolveScheduleDate(parsed?.startDate, fallbackDate, 1);
  const endDate = resolveScheduleDate(parsed?.endDate, startDate, 1);

  const dateCode = startDate.replace(/-/g, '').slice(2, 6) || '2611';
  const bookingCode = `MT-${dateCode}-${Math.floor(100 + Math.random() * 900)}`;

  const rawSchedules = Array.isArray(parsed?.scheduleItems) ? parsed.scheduleItems : [];
  const rawIncludedCosts = Array.isArray(parsed?.includedCostItems) ? parsed.includedCostItems : [];
  const rawRevenueItems = Array.isArray(parsed?.revenueItems) ? parsed.revenueItems : [];

  const scheduleItems: ScheduleItem[] = rawSchedules.map((item, idx) => {
    const title = item?.title || '일정';
    const detail = item?.detail || '';
    const dayNumber = Number(item?.dayNumber) > 0 ? Number(item.dayNumber) : idx + 1;
    const resolvedType = classifyScheduleType(title, detail, item?.type);
    const resolvedDate = resolveScheduleDate(item?.date, startDate, dayNumber);
    return {
      id: `${id}-sch-${idx + 1}`,
      date: resolvedDate,
      dayNumber,
      time: item?.time || (resolvedType === 'GOLF' ? '07:30' : '10:00'),
      title,
      detail,
      type: resolvedType,
      golfCourseName: resolvedType === 'GOLF' ? item?.golfCourseName || title : undefined,
      teeOffTime: resolvedType === 'GOLF' ? item?.teeOffTime || item?.time || '07:30' : undefined,
      golfBookingStatus: resolvedType === 'GOLF' ? '대기' : undefined,
      vehicleGuideNote: resolvedType === 'GOLF' ? '차량/캐디 배정 확인 필요' : '차량/가이드 배정 대기',
    };
  });

  const resolveCostServiceDate = (
    rawServiceDate: string | undefined,
    category: CostCategory,
    title: string
  ): string => {
    const trimmed = String(rawServiceDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const embeddedDate = /(\d{4}-\d{2}-\d{2})/.exec(title);
    if (embeddedDate) {
      return embeddedDate[1];
    }
    if (category === '마사지/옵션') {
      const matched = scheduleItems.find((s) =>
        /(마사지|스파|크루즈|옵션)/i.test(`${s.title} ${s.detail}`)
      );
      if (matched) return matched.date;
    }
    if (category === '식사') {
      const matched = scheduleItems.find((s) =>
        /(중식|석식|만찬|디너|식사)/i.test(`${s.title} ${s.detail}`)
      );
      if (matched) return matched.date;
    }
    return startDate;
  };

  const applyMasterPriceToCost = (
    title: string,
    category: CostCategory,
    serviceDate: string,
    defaultNote: string
  ) => {
    const matched = matchMasterPrice(title, category, serviceDate, masterPrices);
    if (!matched || matched.amount <= 0) {
      return {
        currency: 'USD' as CostCurrency,
        originalAmount: 0,
        costUsd: 0,
        costKrw: 0,
        note: defaultNote,
      };
    }

    const converted = convertCostAmount(
      matched.amount,
      matched.currency,
      exchangeRate,
      vndExchangeRate
    );
    const dayTag = matched.isWeekend ? '주말(금~일)' : '평일(월~목)';
    const vendorPrefix = matched.masterPrice.vendorName
      ? `${matched.masterPrice.vendorName} · `
      : '';
    return {
      currency: matched.currency,
      originalAmount: matched.amount,
      costUsd: converted.costUsd,
      costKrw: converted.costKrw,
      note: `표준단가 자동입력 (${vendorPrefix}${matched.masterPrice.keyword} · ${dayTag})`,
    };
  };

  const includedCosts: CostItem[] = rawIncludedCosts
    .filter((item) => !isSimpleItineraryNotice(item?.title || ''))
    .map((item, idx) => {
      const title = item?.title || '포함 항목';
      const category = normalizeCostCategory(item?.category || '', title);
      const serviceDate = resolveCostServiceDate(item?.serviceDate, category, title);
      const priced = applyMasterPriceToCost(
        title,
        category,
        serviceDate,
        item?.note || '견적서 포함 항목 — 현지 원가 입력 필요'
      );
      return {
        id: `${id}-cost-inc-${idx + 1}`,
        title,
        category,
        source: 'PDF포함',
        serviceDate,
        currency: priced.currency,
        originalAmount: priced.originalAmount,
        costUsd: priced.costUsd,
        costKrw: priced.costKrw,
        paid: false,
        note: priced.note,
      };
    });

  const golfCostItems: CostItem[] = scheduleItems
    .filter((s) => s.type === 'GOLF')
    .map((golf, idx) => {
      const title = `${golf.golfCourseName || golf.title} 그린피·카트피 원가 (${golf.date})`;
      const priced = applyMasterPriceToCost(
        title,
        '골프장',
        golf.date,
        `${Number(parsed?.customerCount) || 1}인 기준 현지 부킹 원가`
      );
      return {
        id: `${id}-cost-golf-${idx + 1}`,
        title,
        category: '골프장',
        source: '골프원가',
        serviceDate: golf.date,
        currency: priced.currency,
        originalAmount: priced.originalAmount,
        costUsd: priced.costUsd,
        costKrw: priced.costKrw,
        paid: false,
        note: priced.note,
      };
    });

  const revenueItems = rawRevenueItems.map((item, idx) => ({
    id: `${id}-rev-${idx + 1}`,
    title: item?.title || '매출 항목',
    amountUsd: Number(item?.amountUsd) || 0,
    amountKrw: Number(item?.amountKrw) || Math.round((Number(item?.amountUsd) || 0) * exchangeRate),
    note: item?.note,
  }));

  const customerName = parsed?.customerName || '신규 고객';
  const customerCount = Number(parsed?.customerCount) || 1;

  return {
    id,
    bookingCode,
    createdAt: new Date().toISOString(),
    customerName,
    customerCount,
    rawCustomerText:
      parsed?.rawCustomerText || `${customerName} 고객님 외 ${Math.max(0, customerCount - 1)}인`,
    destination: parsed?.destination || '베트남 호치민',
    productName: parsed?.productName || '호치민 맞춤 골프 & 투어',
    startDate,
    endDate,
    managerName: parsed?.managerName || '김매니저',
    status: '예약확정',
    totalPriceUsd,
    totalPriceKrw,
    exchangeRate,
    vndExchangeRate,
    depositPaid: false,
    depositAmountUsd: Math.round(totalPriceUsd * 0.3),
    balancePaid: false,
    balanceAmountUsd: totalPriceUsd - Math.round(totalPriceUsd * 0.3),
    revenueItems,
    costItems: [...includedCosts, ...golfCostItems],
    scheduleItems,
    memo: '',
  };
}
