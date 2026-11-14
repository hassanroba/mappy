import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import dns from 'node:dns';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GEOCODE_V4_BASE = 'https://geocode.googleapis.com/v4/geocode/address/';
const SOLUTION_ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const GEMINI_INSIGHTS_MODEL = 'gemini-3.8-flash';

const FIELD_MASK = [
  'results.placeId',
  'results.place',
  'results.location',
  'results.granularity',
  'results.viewport',
  'results.bounds',
  'results.formattedAddress',
  'results.postalAddress',
  'results.addressComponents',
  'results.types',
  'results.plusCode',
].join(',');

interface UpstreamGoogleErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
}

let cachedGenAI: GoogleGenAI | null = null;
let cachedGeminiKey = '';

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  if (!cachedGenAI || cachedGeminiKey !== apiKey) {
    cachedGeminiKey = apiKey;
    cachedGenAI = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 15000,
        retryOptions: {
          attempts: 1,
        },
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedGenAI;
}

function getMapsApiKey(): string {
  return (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
}

function buildTroubleshootingHints(status: number, apiStatus?: string, message?: string): string[] {
  const lowerMsg = (message || '').toLowerCase();

  if (status === 400 || apiStatus === 'INVALID_ARGUMENT') {
    return [
      'Check that the search query contains a valid city, neighborhood, street address, or Plus Code.',
      'Avoid raw coordinate pairs or unsupported special characters.',
    ];
  }

  if (status === 401 || status === 403 || apiStatus === 'PERMISSION_DENIED' || apiStatus === 'UNAUTHENTICATED') {
    const hints = [
      'Confirm that the Geocoding API is enabled on your Google Cloud project.',
      'Check that your API key does not have IP or API restrictions blocking server-side Geocoding API requests.',
    ];
    if (lowerMsg.includes('referer') || lowerMsg.includes('referrer')) {
      hints.push('Keys restricted strictly to HTTP referrers cannot authorize server-side Geocoding REST calls; use an unrestricted or API-restricted server key, or allow this host.');
    }
    return hints;
  }

  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return [
      'Geocoding API request quota or rate limit has been reached for this project.',
      'Wait a moment before retrying, or review your project quotas and billing status in Google Cloud Console.',
    ];
  }

  if (status >= 500) {
    return [
      'Google Geocoding V4 experienced a temporary upstream error.',
      'Retry your search in a few seconds.',
    ];
  }

  return [
    'Verify network connectivity and ensure the Geocoding API is enabled for your project.',
  ];
}

function sanitizeInsightsHtml(rawText: string): string {
  // Strip optional markdown fences such as ```html ... ```
  let cleaned = rawText
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Extract the first <ul>...</ul> block if extra prose surrounded it
  const ulMatch = cleaned.match(/<ul[\s\S]*?<\/ul>/i);
  if (ulMatch) {
    cleaned = ulMatch[0];
  }

  // Remove script/style/iframe blocks completely
  cleaned = cleaned
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

  // Keep only safe structural/inline tags without attributes
  cleaned = cleaned.replace(/<\/?([a-zA-Z0-9]+)(?:\s[^>]*)?>/g, (full, tagName: string) => {
    const tag = tagName.toLowerCase();
    const isClosing = full.startsWith('</');
    if (tag === 'ul' || tag === 'li' || tag === 'strong' || tag === 'em' || tag === 'b' || tag === 'i') {
      return isClosing ? `</${tag}>` : `<${tag}>`;
    }
    return '';
  });

  if (!/<li[\s>]/i.test(cleaned)) {
    const lines = rawText
      .split('\n')
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);
    if (lines.length === 0) return '';
    const items = lines
      .map((line) => `<li>${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`)
      .join('');
    return `<ul>${items}</ul>`;
  }

  if (!/<ul[\s>]/i.test(cleaned)) {
    return `<ul>${cleaned}</ul>`;
  }

  return cleaned;
}

function extractGeminiErrorInfo(err: unknown): {
  httpStatus: number;
  status: string;
  message: string;
} {
  if (err && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const rawStatus = typeof record.status === 'number' ? record.status : undefined;
    const rawMessage = typeof record.message === 'string' ? record.message : String(err);

    let parsedStatus = rawStatus || 500;
    let parsedCode = 'GEMINI_API_ERROR';
    let friendlyMessage = rawMessage;

    if (rawMessage.includes('API_KEY_INVALID') || parsedStatus === 400) {
      parsedCode = 'INVALID_ARGUMENT';
      friendlyMessage =
        'The Gemini request could not be processed. Please verify the API key and location input.';
    } else if (parsedStatus === 403 || rawMessage.includes('PERMISSION_DENIED')) {
      parsedStatus = 403;
      parsedCode = 'PERMISSION_DENIED';
      friendlyMessage =
        'Gemini API access was denied. Please check your GEMINI_API_KEY configuration in Settings > Secrets.';
    } else if (parsedStatus === 404 || rawMessage.includes('NOT_FOUND')) {
      parsedStatus = 404;
      parsedCode = 'NOT_FOUND';
      friendlyMessage = `The requested Gemini model (${GEMINI_INSIGHTS_MODEL}) was not found or is unavailable for this key.`;
    } else if (parsedStatus === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
      parsedStatus = 429;
      parsedCode = 'RESOURCE_EXHAUSTED';
      friendlyMessage =
        'Gemini API rate limit or quota has been reached. Please wait a moment and try again.';
    } else if (parsedStatus >= 500 || rawMessage.includes('DEADLINE_EXCEEDED')) {
      if (parsedStatus < 500) parsedStatus = 504;
      parsedCode = 'UPSTREAM_ERROR';
      friendlyMessage =
        'The Gemini service is temporarily unavailable or timed out. Please try again in a few seconds.';
    }

    return {
      httpStatus: parsedStatus,
      status: parsedCode,
      message: friendlyMessage,
    };
  }

  return {
    httpStatus: 500,
    status: 'GEMINI_API_ERROR',
    message: 'An unexpected error occurred while generating local insights.',
  };
}

async function generateInsightsWithRetry(ai: GoogleGenAI, prompt: string): Promise<string> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 16000);
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: GEMINI_INSIGHTS_MODEL,
            contents: prompt,
            config: {
              abortSignal: controller.signal,
            },
          }),
          new Promise<never>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('Gemini API request timed out.'));
            });
          }),
        ]);
        return response.text ?? '';
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err: unknown) {
      lastError = err;
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 0;
      const isRetryable = status === 429 || status === 503;
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }

  throw lastError;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hasMapsKey: Boolean(getMapsApiKey()),
      hasGeminiKey: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    });
  });

  app.get('/api/maps-config', (_req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(500).json({
        error: {
          code: 'MISSING_API_KEY',
          message: 'Google Maps API key is not configured in the runtime environment.',
          troubleshooting: [
            'Ensure VITE_GOOGLE_MAPS_API_KEY is configured in the environment or secrets panel.',
          ],
        },
      });
      return;
    }
    res.json({ apiKey });
  });

  app.get('/api/geocode', async (req: Request, res: Response) => {
    const rawAddress = typeof req.query.address === 'string' ? req.query.address.trim() : '';

    if (!rawAddress) {
      res.status(400).json({
        error: {
          status: 'INVALID_ARGUMENT',
          message: 'Please enter a city, neighborhood, or street address to geocode.',
          troubleshooting: [
            'Type a location name in the search bar or choose one of the five featured presets.',
          ],
        },
      });
      return;
    }

    if (rawAddress.length > 512) {
      res.status(400).json({
        error: {
          status: 'INVALID_ARGUMENT',
          message: 'The location query exceeds the maximum allowed length (512 characters).',
          troubleshooting: ['Shorten the query to a city, neighborhood, or standard postal address.'],
        },
      });
      return;
    }

    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(500).json({
        error: {
          status: 'MISSING_API_KEY',
          message: 'Google Maps Platform API key is not configured on the server.',
          troubleshooting: [
            'Verify that VITE_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY is present in your environment.',
            'Restart the server after configuring your API key.',
          ],
        },
      });
      return;
    }

    const encodedAddress = encodeURIComponent(rawAddress);
    const endpointUrl = `${GEOCODE_V4_BASE}${encodedAddress}?languageCode=en`;

    try {
      const upstreamResponse = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
          'X-Goog-Maps-Solution-ID': SOLUTION_ATTRIBUTION_ID,
        },
      });

      const responseText = await upstreamResponse.text();
      let parsedBody: unknown = null;
      try {
        parsedBody = responseText ? JSON.parse(responseText) : {};
      } catch {
        parsedBody = null;
      }

      if (!upstreamResponse.ok) {
        const googleErr = (parsedBody as UpstreamGoogleErrorPayload | null)?.error;
        const apiStatus = googleErr?.status || `HTTP_${upstreamResponse.status}`;
        const apiMessage =
          googleErr?.message ||
          `Geocoding V4 API returned HTTP ${upstreamResponse.status} (${upstreamResponse.statusText || 'Error'}).`;

        res.status(upstreamResponse.status).json({
          error: {
            httpStatus: upstreamResponse.status,
            status: apiStatus,
            message: apiMessage,
            endpoint: `${GEOCODE_V4_BASE}{address}`,
            troubleshooting: buildTroubleshootingHints(
              upstreamResponse.status,
              apiStatus,
              apiMessage
            ),
          },
        });
        return;
      }

      const data = (parsedBody ?? {}) as { results?: unknown[] };
      const results = Array.isArray(data.results) ? data.results : [];

      res.json({
        query: rawAddress,
        endpoint: `${GEOCODE_V4_BASE}${encodedAddress}`,
        results,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Network error while contacting the Google Geocoding V4 endpoint.';
      res.status(502).json({
        error: {
          httpStatus: 502,
          status: 'UPSTREAM_UNREACHABLE',
          message,
          endpoint: `${GEOCODE_V4_BASE}{address}`,
          troubleshooting: [
            'Check outbound network connectivity to geocode.googleapis.com.',
            'Retry your search in a moment.',
          ],
        },
      });
    }
  });

  app.post('/api/insights', async (req: Request, res: Response) => {
    const placeLabel =
      typeof req.body?.placeLabel === 'string' ? req.body.placeLabel.trim() : '';

    if (!placeLabel) {
      res.status(400).json({
        error: {
          httpStatus: 400,
          status: 'INVALID_ARGUMENT',
          message: 'A valid city and state/region name is required to generate local insights.',
        },
      });
      return;
    }

    if (placeLabel.length > 200) {
      res.status(400).json({
        error: {
          httpStatus: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Location name is too long for insights generation.',
        },
      });
      return;
    }

    const ai = getGenAIClient();
    if (!ai) {
      res.status(500).json({
        error: {
          httpStatus: 500,
          status: 'MISSING_GEMINI_KEY',
          message:
            'Gemini API key is not configured. Check GEMINI_API_KEY in the Settings > Secrets panel.',
        },
      });
      return;
    }

    const prompt = `You are a local tour guide for ${placeLabel}. Give me exactly 3 short, highly engaging, and unusual or surprising fun facts about this place. Keep each fact under 2 sentences. Format the response as a clean HTML unordered list (<ul>) so I can inject it directly.`;

    try {
      const rawText = await generateInsightsWithRetry(ai, prompt);
      const html = sanitizeInsightsHtml(rawText);

      if (!html) {
        res.status(502).json({
          error: {
            httpStatus: 502,
            status: 'EMPTY_RESPONSE',
            message: 'The AI returned an empty response for this location. Please try again.',
          },
        });
        return;
      }

      res.json({
        placeLabel,
        html,
      });
    } catch (err: unknown) {
      const errorInfo = extractGeminiErrorInfo(err);
      res.status(errorInfo.httpStatus).json({
        error: errorInfo,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = import('vite').then(({ createServer: createViteServer }) =>
      createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      })
    );
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Block Explorer server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error: unknown) => {
  console.error('Failed to start Block Explorer server:', error);
  process.exit(1);
});
