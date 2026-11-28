import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '50mb' }));

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
  });
});

app.post('/api/parse-quote', async (req, res) => {
  try {
    const { images, fileName } = req.body as {
      images?: Array<{ mimeType?: string; data: string }>;
      fileName?: string;
    };

    if (!images || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: '분석할 PDF 페이지 이미지가 전달되지 않았습니다.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: '서버에 GEMINI_API_KEY가 설정되어 있지 않습니다. AI Studio Secrets 패널에서 GEMINI_API_KEY를 확인해 주세요.',
      });
      return;
    }

    const imageParts = images.map((img) => {
      const cleanBase64 = img.data.includes(',') ? img.data.split(',')[1] : img.data;
      return {
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: cleanBase64,
        },
      };
    });

    const systemInstruction = `당신은 베트남 호치민 전문 여행사 '망고투어(MANGO TOUR)'의 이미지형 PDF/견적서('여행 견적 및 일정 안내서') 전문 데이터 추출 엔진입니다.
제공된 견적서 이미지들에서 표와 텍스트를 정확히 판독하여 JSON으로 구조화하세요.

[핵심 판독 규칙]
1. 기본 정보:
   - customerName: 고객 대표자 성함만 추출 (예: "김철수 고객님 외 3인" -> "김철수", "홍길동님 총 4명" -> "홍길동"). 성함이 불명확하면 원문 앞부분 사용.
   - customerCount: 총 인원수 정수 (예: "김철수 외 3인" -> 4, "4인" -> 4).
   - rawCustomerText: 문서에 표기된 고객 표기 원문.
   - destination: 여행지 (기본값 "베트남 호치민").
   - productName: 견적서 상단 상품명 또는 제목.
   - startDate, endDate: 반드시 YYYY-MM-DD 형식으로 변환 (예: "2026.12.10~12.13" -> startDate "2026-12-10", endDate "2026-12-13"). 연도가 생략된 경우 문서 발행일 또는 2026년 기준으로 추론.
   - managerName: 담당자 이름.

2. 일정 스케줄 자동 분류 및 실제 진행 날짜 추출 (scheduleItems):
   - '여행 추천 일정' 또는 일자별 일정표의 각 활동을 빠짐없이 추출하세요.
   - date (매우 중요): 각 일정 항목마다 **실제 진행 날짜를 반드시 YYYY-MM-DD 형식**으로 정확히 추출하여 저장하세요.
     * 일자별 헤더(예: "1일차 (12/10)", "Day 2 · 12.11", "3일차")와 startDate를 정확히 대조하여 실제 날짜(YYYY-MM-DD)로 변환하세요. (예: startDate가 "2026-12-10"이면 1일차="2026-12-10", 2일차="2026-12-11", 3일차="2026-12-12")
   - type 분류 규칙 (오분류 엄격 금지):
     * "GOLF": 실제 골프 라운딩 활동(예: "떤선녓 CC 18홀 라운딩", "롱탄 CC 티오프")만 type: "GOLF"로 분류하고, golfCourseName과 teeOffTime(예: "07:30", 미기재 시 "08:00")을 채우세요.
     * "TOUR": 식사(조식, 중식, 석식, 만찬, 클럽하우스 중식 등), 마사지/스파(전신 마사지, 아로마 스파, 이발소 등), 옵션 투어, 공항 픽업/샌딩, 호텔 체크인/체크아웃, 시내 관광, 이동은 제목에 골프장 근처나 클럽하우스 표현이 들어가더라도 **반드시 type: "TOUR"**로 분류하세요.

3. 금액 및 원가 항목 정밀 분류 (includedCostItems):
   - totalPriceUsd, totalPriceKrw: '선택 결제 금액(Total Price)' 또는 총 견적 금액에서 USD와 KRW 숫자를 추출. 한쪽 통화만 있으면 exchangeRate(기본 1400)를 참고해 환산.
   - revenueItems: '여행 경비 내역' 또는 견적 표에서 개별 금액($ 또는 원)이 명시된 매출/과금 항목(예: 골프 라운딩 $1,776 등)을 추출.
   - includedCostItems: '여행 경비 내역', '포함 내역' 등에서 **실제로 현지 원가(비용) 정산이 필요한 항목만** 추출하세요.
     * category는 반드시 다음 7가지 중 하나와 정확히 일치해야 합니다:
       "숙박" | "골프장" | "차량" | "가이드" | "식사" | "마사지/옵션" | "기타"
     * 오분류 엄격 금지:
       - '중식', '조식', '석식', '식사', '특식', '만찬', '클럽하우스 중식' 등은 반드시 **"식사"**로 분류하세요. (절대 "골프장"으로 분류하지 마세요.)
       - '마사지', '스파', '아로마', '발마사지', '이발소', '디너 크루즈', '시내투어 옵션' 등은 반드시 **"마사지/옵션"**으로 분류하세요. (절대 "골프장"으로 분류하지 마세요.)
       - "골프장"은 실제 골프 라운딩(그린피·카트피·캐디피) 항목에만 사용하세요.
     * 비용이 발생하지 않는 단순 휴식 및 이동 안내 문구 완전 제외 (매우 중요):
       - "단순 휴식", "오후 휴식", "자유시간", "자유일정", "호텔 체크인 후 휴식", "라운딩 후 휴식 및 이동", "차량으로 이동", "공항 이동 안내", "기상 및 조식 후 이동", "공항 도착 후 가이드 미팅 안내", "출국 수속 후 귀국", "여권/항공 수하물 유의사항", "개인 경비/매너팁 불포함 안내" 등 실제 비용이 발생하지 않는 단순 휴식·이동 안내·주의 문구는 includedCostItems에서 **절대 추출하지 말고 제외**하세요.
       - 차량은 "9인승 리무진 전용차량", "공항 픽업/샌딩 차량"처럼 실제 차량 대여/배차 비용이 발생하는 항목만 포함하세요.
     * serviceDate (필수): 해당 원가 항목이 실제 집행·진행되는 날짜를 반드시 YYYY-MM-DD 형식으로 기입하세요 (전 일정 항목이나 체크인 기준 항목은 startDate, 특정 일차 식사/마사지/골프는 해당 일자).

숫자 필드는 쉼표와 통화 기호를 제거한 순수 숫자로 반환하세요.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          ...imageParts,
          {
            text: `첨부된 견적서(${fileName || '견적서'}, 총 ${images.length}페이지)를 분석하여 고객 정보, 실제 진행 날짜(YYYY-MM-DD)가 포함된 일정(GOLF/TOUR 구분), 총 결제 금액, 매출 항목, 그리고 실제 비용이 발생하는 정산 대상 원가 항목(7대 카테고리 정확 매칭, serviceDate 필수 포함, 단순 휴식/이동 안내 문구 제외)을 JSON 스키마에 맞춰 추출해 주세요.`,
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            customerName: { type: Type.STRING },
            customerCount: { type: Type.INTEGER },
            rawCustomerText: { type: Type.STRING },
            destination: { type: Type.STRING },
            productName: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            managerName: { type: Type.STRING },
            totalPriceUsd: { type: Type.NUMBER },
            totalPriceKrw: { type: Type.NUMBER },
            exchangeRate: { type: Type.NUMBER },
            revenueItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  amountUsd: { type: Type.NUMBER },
                  amountKrw: { type: Type.NUMBER },
                  note: { type: Type.STRING },
                },
                required: ['title', 'amountUsd', 'amountKrw'],
              },
            },
            includedCostItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    enum: ['숙박', '골프장', '차량', '가이드', '식사', '마사지/옵션', '기타'],
                  },
                  serviceDate: {
                    type: Type.STRING,
                    description: '실제 진행 날짜 (반드시 YYYY-MM-DD 형식, 미상 시 startDate)',
                  },
                  note: { type: Type.STRING },
                },
                required: ['title', 'category', 'serviceDate'],
              },
            },
            scheduleItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: {
                    type: Type.STRING,
                    description: '실제 진행 날짜 (반드시 YYYY-MM-DD 형식, 예: 2026-12-11)',
                  },
                  dayNumber: { type: Type.INTEGER },
                  time: { type: Type.STRING },
                  title: { type: Type.STRING },
                  detail: { type: Type.STRING },
                  type: {
                    type: Type.STRING,
                    enum: ['GOLF', 'TOUR'],
                  },
                  golfCourseName: { type: Type.STRING },
                  teeOffTime: { type: Type.STRING },
                },
                required: ['date', 'dayNumber', 'time', 'title', 'detail', 'type'],
              },
            },
          },
          required: [
            'customerName',
            'customerCount',
            'destination',
            'productName',
            'startDate',
            'endDate',
            'totalPriceUsd',
            'totalPriceKrw',
            'revenueItems',
            'includedCostItems',
            'scheduleItems',
          ],
        },
      },
    });

    const rawText = response.text?.trim();
    if (!rawText) {
      res.status(502).json({ error: 'AI 응답이 비어 있습니다. PDF 선명도를 확인한 후 다시 시도해 주세요.' });
      return;
    }

    const parsed = JSON.parse(rawText);
    res.json({ data: parsed });
  } catch (err: unknown) {
    console.error('[parse-quote error]', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
    if (message.includes('API_KEY_INVALID') || message.includes('PERMISSION_DENIED')) {
      res.status(403).json({
        error: 'Gemini API 키가 유효하지 않거나 권한이 없습니다. Settings > Secrets 패널을 확인해 주세요.',
      });
      return;
    }
    if (message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
      res.status(429).json({
        error: 'Gemini API 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
      });
      return;
    }
    if (message.includes('UNAVAILABLE') || message.includes('503') || message.includes('high demand')) {
      res.status(503).json({
        error: 'AI 분석 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요.',
      });
      return;
    }
    res.status(500).json({ error: `견적서 분석 중 오류가 발생했습니다: ${message}` });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MANGO TOUR ERP server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
