import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  CostCategory,
  CostItem,
  ParsedQuoteResult,
  Reservation,
  ScheduleItem,
  ScheduleType,
} from '../types/erp';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface RenderedPdfPage {
  pageNumber: number;
  dataUrl: string;
}

const GOLF_KEYWORDS = ['CC', 'C.C', '골프', '라운딩', '티오프', 'GOLF', 'CLUB', '트윈도브스', '롱탄', '떤선녓', '송베', '정산', '하모니'];

export function classifyScheduleType(title: string, detail: string, suggestedType?: string): ScheduleType {
  if (suggestedType?.toUpperCase() === 'GOLF') {
    return 'GOLF';
  }
  const combined = `${title} ${detail}`.toUpperCase();
  const isGolf = GOLF_KEYWORDS.some((kw) => combined.includes(kw.toUpperCase()));
  return isGolf ? 'GOLF' : 'TOUR';
}

function normalizeCostCategory(raw: string): CostCategory {
  if (raw.includes('숙박') || raw.includes('호텔') || raw.includes('리조트')) return '숙박';
  if (raw.includes('차량') || raw.includes('리무진') || raw.includes('픽업') || raw.includes('샌딩')) return '차량';
  if (raw.includes('가이드')) return '가이드';
  if (raw.includes('마사지') || raw.includes('스파')) return '마사지';
  if (raw.includes('골프') || raw.includes('그린피') || raw.includes('캐디')) return '골프장';
  if (raw.includes('식사') || raw.includes('조식') || raw.includes('석식')) return '식사';
  return '기타';
}

export async function renderPdfToImages(file: File, maxPages = 6): Promise<RenderedPdfPage[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages: RenderedPdfPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.8 });
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

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    pages.push({
      pageNumber: i,
      dataUrl,
    });
  }

  return pages;
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

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'PDF 견적서 AI 분석에 실패했습니다.');
  }

  return payload.data as ParsedQuoteResult;
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

export function buildReservationFromParsedQuote(parsed: ParsedQuoteResult): Reservation {
  const id = generateUuid();
  const exchangeRate = parsed.exchangeRate > 0 ? parsed.exchangeRate : 1400;
  const totalPriceUsd = parsed.totalPriceUsd || Math.round((parsed.totalPriceKrw || 0) / exchangeRate);
  const totalPriceKrw = parsed.totalPriceKrw || Math.round(totalPriceUsd * exchangeRate);

  const dateCode = (parsed.startDate || '2026-12-01').replace(/-/g, '').slice(2, 6);
  const bookingCode = `MT-${dateCode}-${Math.floor(100 + Math.random() * 900)}`;

  const scheduleItems: ScheduleItem[] = (parsed.scheduleItems || []).map((item, idx) => {
    const resolvedType = classifyScheduleType(item.title, item.detail, item.type);
    return {
      id: `${id}-sch-${idx + 1}`,
      date: item.date || parsed.startDate,
      dayNumber: item.dayNumber || 1,
      time: item.time || (resolvedType === 'GOLF' ? '07:30' : '10:00'),
      title: item.title,
      detail: item.detail || '',
      type: resolvedType,
      golfCourseName: resolvedType === 'GOLF' ? item.golfCourseName || item.title : undefined,
      teeOffTime: resolvedType === 'GOLF' ? item.teeOffTime || item.time || '07:30' : undefined,
      golfBookingStatus: resolvedType === 'GOLF' ? '대기' : undefined,
      vehicleGuideNote: resolvedType === 'GOLF' ? '차량/캐디 배정 확인 필요' : '차량/가이드 배정 대기',
    };
  });

  const includedCosts: CostItem[] = (parsed.includedCostItems || []).map((item, idx) => ({
    id: `${id}-cost-inc-${idx + 1}`,
    title: item.title,
    category: normalizeCostCategory(item.category || item.title),
    source: 'PDF포함',
    costUsd: 0,
    costKrw: 0,
    paid: false,
    note: item.note || '견적서 포함 항목 — 현지 원가 입력 필요',
  }));

  const golfCostItems: CostItem[] = scheduleItems
    .filter((s) => s.type === 'GOLF')
    .map((golf, idx) => ({
      id: `${id}-cost-golf-${idx + 1}`,
      title: `${golf.golfCourseName || golf.title} 그린피·카트피 원가 (${golf.date})`,
      category: '골프장',
      source: '골프원가',
      costUsd: 0,
      costKrw: 0,
      paid: false,
      note: `${parsed.customerCount}인 기준 현지 부킹 원가`,
    }));

  const revenueItems = (parsed.revenueItems || []).map((item, idx) => ({
    id: `${id}-rev-${idx + 1}`,
    title: item.title,
    amountUsd: item.amountUsd || 0,
    amountKrw: item.amountKrw || Math.round((item.amountUsd || 0) * exchangeRate),
    note: item.note,
  }));

  return {
    id,
    bookingCode,
    createdAt: new Date().toISOString(),
    customerName: parsed.customerName || '신규 고객',
    customerCount: parsed.customerCount || 1,
    rawCustomerText: parsed.rawCustomerText || `${parsed.customerName} 고객님 외 ${Math.max(0, (parsed.customerCount || 1) - 1)}인`,
    destination: parsed.destination || '베트남 호치민',
    productName: parsed.productName || '호치민 맞춤 골프 & 투어',
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    managerName: parsed.managerName || '김매니저',
    status: '예약확정',
    totalPriceUsd,
    totalPriceKrw,
    exchangeRate,
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
