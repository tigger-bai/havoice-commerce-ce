export const POST_OFFICE_TRACKING_PAGE_URL = 'https://postserv.post.gov.tw/pstmail/main_mail.html';
const CHUNGHWA_POST_TRACKING_API_URL = 'https://postserv.post.gov.tw/pstmail/EsoafDispatcher';

export type ParsedPostOfficeTrackingInput = {
  trackingNumber: string;
  trackingUrl?: string;
  rawInput: string;
  error?: string;
};

export type ParsedChunghwaPostTrackingInput = {
  trackingNumber: string | null;
  source: 'plain-number' | 'post-qr-url' | 'unknown';
  error?: string;
};

export type ChunghwaPostTrackingEvent = {
  datetime: string;
  status: string;
  station: string;
  rawData?: Record<string, string>;
};

type ChunghwaPostTrackingStrategyName = 'gist-compatible' | 'no-content-type' | 'current-json';

type ChunghwaPostTrackingMessage = {
  msgCode?: string;
  msgData?: string;
};

type ChunghwaPostTrackingStrategySummary = {
  strategy: ChunghwaPostTrackingStrategyName;
  httpStatus: number;
  msgCode?: string;
  msgData?: string;
  foundHostRs: boolean;
  itemCount: number;
};

function normalizeSeparatedDigits(value: string): string | null {
  const compact = value.replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(compact)) return null;
  if (compact.length !== 20 && compact.length !== 14) return null;
  return compact;
}

function normalizeBase64Value(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!normalized) return null;

  const remainder = normalized.length % 4;
  if (remainder === 1) return null;

  return normalized.padEnd(normalized.length + (remainder === 0 ? 0 : 4 - remainder), '=');
}

function decodeBase64Ascii(value: string): string | null {
  const normalized = normalizeBase64Value(value);
  if (!normalized || typeof globalThis.atob !== 'function') return null;

  try {
    return globalThis.atob(normalized);
  } catch {
    return null;
  }
}

function parsePostOfficeQrUrl(value: string): ParsedChunghwaPostTrackingInput | null {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== 'postserv.post.gov.tw') {
    return {
      trackingNumber: null,
      source: 'unknown',
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  if (url.searchParams.get('targetTxn') !== 'EB500100') {
    return {
      trackingNumber: null,
      source: 'unknown',
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  const encodedPayload = url.searchParams.get('ts');
  if (!encodedPayload) {
    return {
      trackingNumber: null,
      source: 'unknown',
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  const decodedPayload = decodeBase64Ascii(encodedPayload);
  if (!decodedPayload) {
    return {
      trackingNumber: null,
      source: 'unknown',
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  const params = new URLSearchParams(decodedPayload.startsWith('?') ? decodedPayload.slice(1) : decodedPayload);
  const encodedMailNo = params.get('mailno');
  if (!encodedMailNo) {
    return {
      trackingNumber: null,
      source: 'unknown',
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  const decodedMailNo = decodeBase64Ascii(encodedMailNo);
  const trackingNumber = decodedMailNo ? normalizeSeparatedDigits(decodedMailNo) : null;
  if (!trackingNumber) {
    return {
      trackingNumber: null,
      source: 'unknown',
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  return {
    trackingNumber,
    source: 'post-qr-url',
  };
}

function extractTrackingNumberFromText(value: string, allowEmbedded: boolean): string | null {
  const continuousTwenty = value.match(/\d{20}/)?.[0];
  if (continuousTwenty) return continuousTwenty;

  const continuousFourteen = value.match(/\d{14}/)?.[0];
  if (continuousFourteen) return continuousFourteen;

  if (!allowEmbedded) {
    return normalizeSeparatedDigits(value);
  }

  const separatedTwenty = value.match(/(?:\d[\s-]*){20}/)?.[0]?.replace(/\D/g, '');
  if (separatedTwenty?.length === 20) return separatedTwenty;

  const separatedFourteen = value.match(/(?:\d[\s-]*){14}/)?.[0]?.replace(/\D/g, '');
  if (separatedFourteen?.length === 14) return separatedFourteen;

  return null;
}

function extractSafePostOfficeUrl(value: string): string | undefined {
  const candidate = value.match(/https?:\/\/[^\s<>"']+/i)?.[0];
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    const isPostOfficeHost = hostname === 'post.gov.tw' || hostname.endsWith('.post.gov.tw');
    if (!isPostOfficeHost) return undefined;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function hasUrlLikeInput(value: string): boolean {
  return /[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

export function isPostOfficeTrackingNumber(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{14}$|^\d{20}$/.test(value.trim());
}

export function parseChunghwaPostTrackingInput(input: string): ParsedChunghwaPostTrackingInput {
  const trimmed = input.trim();

  if (!trimmed) {
    return { trackingNumber: null, source: 'unknown' };
  }

  const plainTrackingNumber = normalizeSeparatedDigits(trimmed);
  if (plainTrackingNumber) {
    return {
      trackingNumber: plainTrackingNumber,
      source: 'plain-number',
    };
  }

  if (hasUrlLikeInput(trimmed)) {
    return (
      parsePostOfficeQrUrl(trimmed) ?? {
        trackingNumber: null,
        source: 'unknown',
        error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
      }
    );
  }

  return { trackingNumber: null, source: 'unknown' };
}

export function parsePostOfficeTrackingInput(input: string): ParsedPostOfficeTrackingInput {
  const rawInput = input;
  const trimmed = input.trim();

  if (!trimmed) {
    return { trackingNumber: '', rawInput };
  }

  const chunghwaPostParsed = parseChunghwaPostTrackingInput(trimmed);
  if (chunghwaPostParsed.trackingNumber) {
    return {
      trackingNumber: chunghwaPostParsed.trackingNumber,
      trackingUrl: chunghwaPostParsed.source === 'post-qr-url' ? new URL(trimmed).toString() : undefined,
      rawInput,
    };
  }

  if (chunghwaPostParsed.error) {
    return {
      trackingNumber: '',
      rawInput,
      error: chunghwaPostParsed.error,
    };
  }

  const trackingUrl = extractSafePostOfficeUrl(trimmed);
  const trackingNumber = extractTrackingNumberFromText(trimmed, Boolean(trackingUrl));

  if (trackingNumber) {
    return {
      trackingNumber,
      trackingUrl,
      rawInput,
    };
  }

  if (trackingUrl) {
    return {
      trackingNumber: '',
      trackingUrl,
      rawInput,
    };
  }

  if (hasUrlLikeInput(trimmed)) {
    return {
      trackingNumber: '',
      rawInput,
      error: '無法解析中華郵政 QR Code，請改掃郵件號碼或手動輸入。',
    };
  }

  return {
    trackingNumber: trimmed,
    rawInput,
  };
}

export const CHUNGHWA_POST_TRACKING_PARSE_TEST_CASES = [
  {
    name: 'synthetic 20-digit plain tracking number',
    input: '00000000000000000000',
    expectedTrackingNumber: '00000000000000000000',
    expectedSource: 'plain-number',
  },
  {
    name: 'synthetic 20-digit tracking number with spaces',
    input: '00000 00000 00000 00000',
    expectedTrackingNumber: '00000000000000000000',
    expectedSource: 'plain-number',
  },
  {
    name: 'synthetic Chunghwa Post QR URL',
    input:
      'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&ts=P3RzPURFTU8mbWFpbG5vPU1EQXdNREF3TURBd01EQXdNREF3TURBd01EQT0mcj1ERU1P',
    expectedTrackingNumber: '00000000000000000000',
    expectedSource: 'post-qr-url',
  },
  {
    name: 'non post office URL',
    input: 'https://example.com/?mailno=00000000000000000000',
    expectedTrackingNumber: null,
    expectedSource: 'unknown',
    expectError: true,
  },
  {
    name: 'missing ts',
    input: 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100',
    expectedTrackingNumber: null,
    expectedSource: 'unknown',
    expectError: true,
  },
  {
    name: 'invalid base64',
    input: 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&ts=invalid***',
    expectedTrackingNumber: null,
    expectedSource: 'unknown',
    expectError: true,
  },
  {
    name: 'decoded payload without mailno',
    input: 'https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500100&ts=P2Zvbz1iYXI=',
    expectedTrackingNumber: null,
    expectedSource: 'unknown',
    expectError: true,
  },
] as const;

export function runChunghwaPostTrackingParseTestCases(): Array<{
  name: string;
  passed: boolean;
  actual: ParsedChunghwaPostTrackingInput;
}> {
  return CHUNGHWA_POST_TRACKING_PARSE_TEST_CASES.map((testCase) => {
    const actual = parseChunghwaPostTrackingInput(testCase.input);
    const expectError = 'expectError' in testCase && Boolean(testCase.expectError);
    const passed =
      actual.trackingNumber === testCase.expectedTrackingNumber &&
      actual.source === testCase.expectedSource &&
      Boolean(actual.error) === expectError;

    return {
      name: testCase.name,
      passed,
      actual,
    };
  });
}

export function getPostOfficeTrackingUrl(trackingUrl?: string): string {
  return trackingUrl || POST_OFFICE_TRACKING_PAGE_URL;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '));
}

function getTaggedValue(block: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
    if (match?.[1]) return stripTags(match[1]);
  }

  return '';
}

function parseTrackingXmlItems(responseText: string): ChunghwaPostTrackingEvent[] {
  const itemBlocks = [...responseText.matchAll(/<ITEM[^>]*>([\s\S]*?)<\/ITEM>/gi)].map((match) => match[1] || '');

  return itemBlocks
    .map((block) => {
      const date = getTaggedValue(block, ['DATE', 'PROCESS_DATE', 'STATUS_DATE', 'CHK_DATE', 'POST_DATE']);
      const time = getTaggedValue(block, ['TIME', 'PROCESS_TIME', 'STATUS_TIME', 'CHK_TIME', 'POST_TIME']);
      const datetime =
        getTaggedValue(block, ['DATETIME', 'UPDATE_STATUS_DATE', 'UPDATESTATUSDATE', 'STATUS_DATETIME']) ||
        [date, time].filter(Boolean).join(' ');
      const status = getTaggedValue(block, [
        'STATUS',
        'STATUS_NAME',
        'STATUS_DESC',
        'PROCESS_STATUS',
        'PROCESS_STATUS_DESC',
        'DESC',
        'DESCRIPTION',
      ]);
      const station = getTaggedValue(block, [
        'STATION',
        'BRANCH',
        'OFFICE',
        'LOCATION',
        'PROCESS_BRANCH',
        'HANDLE_BRANCH',
      ]);

      return {
        datetime,
        status,
        station,
        rawData: {
          datetime,
          status,
          station,
        },
      };
    })
    .filter((event) => event.datetime || event.status || event.station);
}

function findItemPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (key.toLowerCase() === 'item') {
        return Array.isArray(child) ? child : [child];
      }
    }

    for (const child of Object.values(record)) {
      const found = findItemPayload(child);
      if (found.length > 0) return found;
    }
  }

  return [];
}

function getStringField(record: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const foundKey = Object.keys(record).find((key) => key.toLowerCase() === name.toLowerCase());
    if (!foundKey) continue;

    const value = record[foundKey];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }
  }

  return '';
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getCaseInsensitive(record: Record<string, unknown> | null, key: string): unknown {
  if (!record) return undefined;
  const foundKey = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return foundKey ? record[foundKey] : undefined;
}

function getPayloadRoot(parsed: unknown): unknown {
  return getCaseInsensitive(toRecord(parsed), 'data') ?? parsed;
}

function getEntryHostRsPayloads(entry: unknown): unknown[] {
  const record = toRecord(entry);
  if (!record) return [];

  const bodyHostRs = getCaseInsensitive(toRecord(getCaseInsensitive(record, 'body')), 'host_rs');
  const directHostRs = getCaseInsensitive(record, 'host_rs');

  return [bodyHostRs, directHostRs].filter((value) => value !== undefined && value !== null);
}

function findHostRsPayloads(parsed: unknown): unknown[] {
  const root = getPayloadRoot(parsed);
  const entries = Array.isArray(root) ? root : [root];
  return entries.flatMap((entry) => getEntryHostRsPayloads(entry));
}

function normalizeItemPayload(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function getHostRsItems(hostRs: unknown): unknown[] {
  const record = toRecord(hostRs);
  const item = getCaseInsensitive(record, 'ITEM');
  const items = getCaseInsensitive(record, 'ITEMS');
  return normalizeItemPayload(item ?? items);
}

function getAllHostRsItems(parsed: unknown): unknown[] {
  return findHostRsPayloads(parsed).flatMap((hostRs) => getHostRsItems(hostRs));
}

function collectResponseMessagesFromRecord(record: Record<string, unknown> | null): ChunghwaPostTrackingMessage[] {
  if (!record) return [];

  const msgCode = getStringField(record, ['msgCode', 'retCode', 'rtnCode', 'code']);
  const msgData = getStringField(record, ['msgData', 'retMsg', 'rtnMsg', 'msg', 'message']);

  return msgCode || msgData ? [{ msgCode: msgCode || undefined, msgData: msgData || undefined }] : [];
}

function collectResponseMessages(parsed: unknown): ChunghwaPostTrackingMessage[] {
  const root = getPayloadRoot(parsed);
  const entries = Array.isArray(root) ? root : [root];

  return entries.flatMap((entry) => {
    const record = toRecord(entry);
    const body = toRecord(getCaseInsensitive(record, 'body'));
    const header = toRecord(getCaseInsensitive(record, 'header'));
    const error = toRecord(getCaseInsensitive(record, 'error'));

    return [
      ...collectResponseMessagesFromRecord(record),
      ...collectResponseMessagesFromRecord(body),
      ...collectResponseMessagesFromRecord(header),
      ...collectResponseMessagesFromRecord(error),
    ];
  });
}

function debugChunghwaPostTrackingSummary(info: {
  mailNo: string;
  strategies: ChunghwaPostTrackingStrategySummary[];
}): void {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[ChunghwaPostTracking][summary]', info);
}

function parseTrackingJsonItems(responseText: string): ChunghwaPostTrackingEvent[] {
  try {
    const parsed = JSON.parse(responseText) as unknown;
    const events: ChunghwaPostTrackingEvent[] = [];

    for (const item of findItemPayload(parsed)) {
      if (!item || typeof item !== 'object') continue;

      const record = item as Record<string, unknown>;
      const date = getStringField(record, ['DATE', 'PROCESS_DATE', 'STATUS_DATE', 'CHK_DATE', 'POST_DATE']);
      const time = getStringField(record, ['TIME', 'PROCESS_TIME', 'STATUS_TIME', 'CHK_TIME', 'POST_TIME']);
      const datetime =
        getStringField(record, ['DATETIME', 'UPDATE_STATUS_DATE', 'UPDATESTATUSDATE', 'STATUS_DATETIME']) ||
        [date, time].filter(Boolean).join(' ');
      const status = getStringField(record, [
        'STATUS',
        'STATUS_NAME',
        'STATUS_DESC',
        'PROCESS_STATUS',
        'PROCESS_STATUS_DESC',
        'DESC',
        'DESCRIPTION',
      ]);
      const station = getStringField(record, [
        'STATION',
        'BRANCH',
        'OFFICE',
        'LOCATION',
        'PROCESS_BRANCH',
        'HANDLE_BRANCH',
      ]);

      if (!datetime && !status && !station) continue;

      events.push({
        datetime,
        status,
        station,
        rawData: Object.fromEntries(
          Object.entries(record)
            .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
            .map(([key, value]) => [key, String(value)])
        ),
      });
    }

    return events;
  } catch {
    return [];
  }
}

function parseHostRsItems(parsed: unknown): ChunghwaPostTrackingEvent[] {
  const itemPayload = getAllHostRsItems(parsed);
  const events: ChunghwaPostTrackingEvent[] = [];

  itemPayload.forEach((item) => {
    const record = toRecord(item);
    if (!record) {
      return;
    }

    const datetime = getStringField(record, ['DATIME', 'datime', 'DATETIME', 'datetime']);
    const status = getStringField(record, ['STATUS', 'status']);
    const station = getStringField(record, ['BRHNC', 'brhnc']);

    if (!datetime) {
      return;
    }

    if (!status) {
      return;
    }

    events.push({
      datetime,
      status,
      station,
      rawData: Object.fromEntries(
        Object.entries(record)
          .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
          .map(([key, value]) => [key, String(value)])
      ),
    });
  });

  return events;
}

export function parseChunghwaPostTrackingResponse(responseText: string): ChunghwaPostTrackingEvent[] {
  const trimmed = responseText.trim();
  if (!trimmed) return [];

  const jsonEvents = trimmed.startsWith('{') || trimmed.startsWith('[') ? parseTrackingJsonItems(trimmed) : [];
  if (jsonEvents.length > 0) return jsonEvents;

  return parseTrackingXmlItems(trimmed);
}

export async function fetchChunghwaPostTracking(mailNo: string): Promise<ChunghwaPostTrackingEvent[]> {
  if (!isPostOfficeTrackingNumber(mailNo)) {
    throw new Error('INVALID_POST_OFFICE_TRACKING_NUMBER');
  }

  const payload = {
    header: {
      InputVOClass: 'com.systex.jbranch.app.server.post.vo.EB500100InputVO',
      TxnCode: 'EB500100',
      BizCode: 'query2',
      StampTime: true,
      SupvPwd: '',
      TXN_DATA: {},
      SupvID: '',
      CustID: '',
      REQUEST_ID: '',
      ClientTransaction: true,
      DevMode: false,
      SectionID: 'esoaf',
    },
    body: {
      MAILNO: mailNo,
      pageCount: 10,
    },
  };
  const body = JSON.stringify(payload);
  const commonHeaders = {
    accept: 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0',
    referer: POST_OFFICE_TRACKING_PAGE_URL,
  };
  const strategies: Array<{ name: ChunghwaPostTrackingStrategyName; headers: Record<string, string> }> = [
    {
      name: 'gist-compatible',
      headers: {
        ...commonHeaders,
        'content-type': 'application/x-www-form-urlencoded',
      },
    },
    {
      name: 'no-content-type',
      headers: commonHeaders,
    },
    {
      name: 'current-json',
      headers: {
        ...commonHeaders,
        'content-type': 'application/json',
      },
    },
  ];
  let receivedResponse = false;
  let lastError: unknown;
  const strategySummaries: ChunghwaPostTrackingStrategySummary[] = [];

  for (const strategy of strategies) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(CHUNGHWA_POST_TRACKING_API_URL, {
        method: 'POST',
        headers: strategy.headers,
        body,
        signal: controller.signal,
      });
      receivedResponse = true;

      const contentType = res.headers.get('content-type');
      const responseText = await res.text();
      let jsonParsed = false;
      let parsed: unknown;
      let events: ChunghwaPostTrackingEvent[] = [];

      try {
        parsed = JSON.parse(responseText) as unknown;
        jsonParsed = true;
        events = parseHostRsItems(parsed);
      } catch {
        events = parseChunghwaPostTrackingResponse(responseText);
      }

      const itemCount = jsonParsed ? getAllHostRsItems(parsed).length : 0;
      const messages = jsonParsed ? collectResponseMessages(parsed) : [];
      const firstMessage = messages[0];
      strategySummaries.push({
        strategy: strategy.name,
        httpStatus: res.status,
        msgCode: firstMessage?.msgCode,
        msgData: firstMessage?.msgData,
        foundHostRs: jsonParsed ? findHostRsPayloads(parsed).length > 0 : false,
        itemCount,
      });

      if (events.length > 0) {
        debugChunghwaPostTrackingSummary({ mailNo, strategies: strategySummaries });
        return events;
      }

      if (!res.ok) {
        lastError = new Error(`CHUNGHWA_POST_TRACKING_HTTP_${res.status}`);
      }
    } catch (err) {
      lastError = err;
      strategySummaries.push({
        strategy: strategy.name,
        httpStatus: 0,
        msgCode: err instanceof Error && err.name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_ERROR',
        msgData: err instanceof Error ? err.message : 'Unknown request error',
        foundHostRs: false,
        itemCount: 0,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  debugChunghwaPostTrackingSummary({ mailNo, strategies: strategySummaries });

  if (!receivedResponse && lastError instanceof Error && lastError.name === 'AbortError') {
    throw new Error('CHUNGHWA_POST_TRACKING_TIMEOUT');
  }

  if (!receivedResponse && lastError) {
    throw lastError;
  }

  return [];
}
