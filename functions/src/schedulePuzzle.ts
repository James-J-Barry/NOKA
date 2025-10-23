import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
// Removed: import { STATIC_SP500 } from './lib/sp500';

// Global defaults for all v2 functions
setGlobalOptions({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 120,
  minInstances: 0,
});

if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();

// Prefer .env (FMP_API_KEY). Fallback to deprecated functions.config for now.
const FMP_API_KEY_RAW =
  process.env.FMP_API_KEY ||
  (functions.config().financial && functions.config().financial.apikey);

const FMP_API_KEY = FMP_API_KEY_RAW ? FMP_API_KEY_RAW.trim() : FMP_API_KEY_RAW;

// Use a fixed list of symbols to completely bypass the paywalled APIs.
const PREDETERMINED_SYMBOLS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. (Class A)' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'TSLA', name: 'Tesla, Inc.' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
];

// FIX: Single-symbol endpoint, as requested. We will execute six separate requests.
const SINGLE_QUOTE_URL = (symbol: string, apiKey: string) =>
  `https://financialmodelingprep.com/stable/quote/?symbol=${symbol}&apikey=${apiKey}`;

type Constituent = { symbol: string; name?: string; [k: string]: any };
// Quote type expects price or regularMarketPrice fields from the /quote endpoint.
type Quote = { symbol: string; name?: string; price?: number; regularMarketPrice?: number; [k: string]: any };

function isQuote(x: any): x is Quote {
  // A simple check to ensure it looks like a quote object
  return x && typeof x.symbol === 'string';
}

// Guard function for array filtering
function safeJsonArray<T>(value: unknown, guard: (v: any) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(guard);
}
// Shuffle array function (kept for potential future use)
function shuffleArray<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const dailyPuzzleScheduler = onSchedule(
  {
    schedule: '0 1 * * *',
    timeZone: 'America/New_York',
  },
  async () => {
    if (!FMP_API_KEY) {
      logger.error('FMP_API_KEY not set. Use functions/.env or firebase functions:config:set financial.apikey=...');
      return;
    }

    try {
      // 1) Constituents: Use a fixed list of 6 symbols.
      const selectedSix: Constituent[] = PREDETERMINED_SYMBOLS;
      
      const symbols = selectedSix.map((c) => c.symbol);
      const nameBySymbol = new Map(selectedSix.map((c) => [c.symbol, c.name]));

      // 2) Quotes: Perform multiple requests concurrently using Promise.all
      let quoteData: Quote[] = [];
      try {
        // Create an array of fetch promises, one for each symbol
        const fetchPromises = symbols.map(symbol => 
          fetch(SINGLE_QUOTE_URL(symbol, FMP_API_KEY))
        );

        // Wait for all requests to resolve
        const responses = await Promise.all(fetchPromises);

        // Process each response
        for (let i = 0; i < responses.length; i++) {
          const response = responses[i];
          const symbol = symbols[i];

          if (response.ok) {
            const json = await response.json();
            // The single-quote API returns an array containing a single object, e.g., [{...quote...}]
            const singleQuoteArray = safeJsonArray<Quote>(json, isQuote);
            
            if (singleQuoteArray.length > 0) {
              // Push the single successfully fetched quote into our consolidated array
              quoteData.push(singleQuoteArray[0]);
            } else {
              logger.warn(`Quote API returned empty data for symbol ${symbol}.`);
            }
          } else {
            const body = await response.text().catch(() => '');
            logger.warn(
              `Quote API failed for symbol ${symbol}: ${response.status} ${response.statusText} ${body ? `- ${body.slice(0, 100)}` : ''}.`
            );
          }
        }
        
      } catch (e) {
        logger.error(`Quote API error during concurrent fetching (${(e as Error).message}). Proceeding with null prices.`);
      }

      // 3) Write to Firestore
      const todayKey = new Date().toISOString().slice(0, 10);
      const batch = db.batch();

      // Write each selected symbol (preserving order)
      for (const symbol of symbols) {
        const data = quoteData.find((q) => q.symbol === symbol);
        // Extract price from the data structure
        const price =
          data && typeof data.price === 'number'
            ? data.price
            : data && typeof data.regularMarketPrice === 'number'
            ? data.regularMarketPrice
            : null;

        const name = (data && data.name) ?? nameBySymbol.get(symbol) ?? symbol;

        const logoSymbol = symbol.toLowerCase().replace(/\./g, '');
        const companyRef = db.collection('dailyCompanies').doc(symbol);
        batch.set(
          companyRef,
          {
            dateKey: todayKey,
            name,
            symbol,
            price, 
            logoUrl: `https://logo.clearbit.com/${logoSymbol}.com`,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      batch.set(db.collection('puzzles').doc(todayKey), {
        dateKey: todayKey,
        symbols,
        isReady: true,
        createdAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      logger.info(`Daily puzzle set for ${todayKey}: ${symbols.join(', ')}`);
    } catch (err) {
      logger.error('dailyPuzzleScheduler error', err as any);
    }
  }
);