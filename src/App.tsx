import { APIProvider } from '@vis.gl/react-google-maps';
import { Compass, History, Loader2, MapPin, Search, X } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorAlert } from './components/ErrorAlert';
import { ExplorerMap } from './components/ExplorerMap';
import { LocalInsightsBanner } from './components/LocalInsightsBanner';
import { LocationDossier } from './components/LocationDossier';
import type {
  GeocodeApiResponse,
  GeocodeErrorState,
  GeocodeResult,
  LocalInsightsData,
  LocalInsightsError,
  PresetLocation,
} from './types/geocode';

const PRESET_LOCATIONS: PresetLocation[] = [
  { id: 'buenos-aires', label: 'Buenos Aires', query: 'Buenos Aires, Argentina', countryHint: 'AR' },
  { id: 'shibuya', label: 'Shibuya', query: 'Shibuya, Tokyo, Japan', countryHint: 'JP' },
  { id: 'copacabana', label: 'Copacabana', query: 'Copacabana, Rio de Janeiro, Brazil', countryHint: 'BR' },
  { id: 'cologne', label: 'Cologne', query: 'Cologne, Germany', countryHint: 'DE' },
  { id: 'lima', label: 'Lima', query: 'Lima, Peru', countryHint: 'PE' },
];

interface HistoryEntry {
  id: string;
  query: string;
  label: string;
  result: GeocodeResult;
}

const ENV_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

function extractCityAndState(result: GeocodeResult, fallbackQuery: string): string {
  const components = result.addressComponents ?? [];
  const findComponent = (type: string) =>
    components.find((c) => c.types.includes(type))?.longText?.trim();

  const city =
    findComponent('locality') ||
    result.postalAddress?.locality?.trim() ||
    findComponent('sublocality_level_1') ||
    findComponent('sublocality') ||
    findComponent('administrative_area_level_2') ||
    components[0]?.longText?.trim() ||
    '';

  const state =
    findComponent('administrative_area_level_1') ||
    result.postalAddress?.administrativeArea?.trim() ||
    '';

  const country = findComponent('country') || '';

  if (city && state && city.toLowerCase() !== state.toLowerCase()) {
    return `${city}, ${state}`;
  }
  if (city && country && city.toLowerCase() !== country.toLowerCase()) {
    return `${city}, ${country}`;
  }
  if (city) {
    return city;
  }
  if (state && country) {
    return `${state}, ${country}`;
  }
  return result.formattedAddress || fallbackQuery;
}

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(ENV_MAPS_KEY);
  const [isResolvingKey, setIsResolvingKey] = useState<boolean>(!ENV_MAPS_KEY);
  const [authFailure, setAuthFailure] = useState<boolean>(false);

  const [searchInput, setSearchInput] = useState<string>('Buenos Aires, Argentina');
  const [activePresetId, setActivePresetId] = useState<string | null>('buenos-aires');
  const [activeQuery, setActiveQuery] = useState<string>('Buenos Aires, Argentina');
  const [activeResult, setActiveResult] = useState<GeocodeResult | null>(null);
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);

  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<GeocodeErrorState | null>(null);
  const [lastAttemptedQuery, setLastAttemptedQuery] = useState<string>('Buenos Aires, Argentina');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [insightsPlaceLabel, setInsightsPlaceLabel] = useState<string | null>(null);
  const [insightsData, setInsightsData] = useState<LocalInsightsData | null>(null);
  const [isInsightsLoading, setIsInsightsLoading] = useState<boolean>(false);
  const [insightsError, setInsightsError] = useState<LocalInsightsError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const insightsAbortRef = useRef<AbortController | null>(null);
  const hasInitializedRef = useRef<boolean>(false);

  // Listen for Google Maps JS authentication failure events
  useEffect(() => {
    const handleAuthFailure = () => {
      setAuthFailure(true);
    };
    window.addEventListener('gmp-auth-failure', handleAuthFailure);
    return () => window.removeEventListener('gmp-auth-failure', handleAuthFailure);
  }, []);

  // Resolve Maps API key from server config if not baked into build-time Vite env
  useEffect(() => {
    if (ENV_MAPS_KEY) {
      setIsResolvingKey(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/maps-config');
        const payload = await res.json();
        if (!cancelled && res.ok && payload?.apiKey) {
          setMapsApiKey(String(payload.apiKey).trim());
        } else if (!cancelled) {
          setErrorState({
            title: 'Google Maps API key unavailable',
            message:
              payload?.error?.message ||
              'No Google Maps API key was found in the environment configuration.',
            httpStatus: res.status,
            apiStatus: payload?.error?.code || 'MISSING_API_KEY',
            troubleshooting: payload?.error?.troubleshooting || [
              'Configure VITE_GOOGLE_MAPS_API_KEY and restart the application server.',
            ],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setErrorState({
            title: 'Unable to reach configuration service',
            message:
              err instanceof Error
                ? err.message
                : 'Failed to load Maps configuration from the backend.',
            troubleshooting: [
              'Verify that the Express server is running on port 3000.',
              'Reload the page once the server is ready.',
            ],
          });
        }
      } finally {
        if (!cancelled) {
          setIsResolvingKey(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchLocalInsights = useCallback(async (placeLabel: string) => {
    const trimmedPlace = placeLabel.trim();
    if (!trimmedPlace) return;

    if (insightsAbortRef.current) {
      insightsAbortRef.current.abort();
    }
    const controller = new AbortController();
    insightsAbortRef.current = controller;

    setInsightsPlaceLabel(trimmedPlace);
    setInsightsData(null);
    setInsightsError(null);
    setIsInsightsLoading(true);

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeLabel: trimmedPlace }),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;

      if (!response.ok) {
        const errObj = payload?.error;
        setInsightsError({
          message:
            errObj?.message ||
            `Local Insights service returned HTTP ${response.status}.`,
          status: errObj?.status,
          httpStatus: errObj?.httpStatus || response.status,
        });
        return;
      }

      setInsightsData({
        placeLabel: payload?.placeLabel || trimmedPlace,
        html: payload?.html || '',
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setInsightsError({
        message:
          err instanceof Error
            ? err.message
            : 'Unable to reach the Local Insights AI service.',
        status: 'NETWORK_ERROR',
      });
    } finally {
      if (insightsAbortRef.current === controller) {
        setIsInsightsLoading(false);
      }
    }
  }, []);

  const executeGeocode = useCallback(
    async (queryToGeocode: string, presetId: string | null = null) => {
      const trimmed = queryToGeocode.trim();
      setLastAttemptedQuery(trimmed);

      if (!trimmed) {
        setErrorState({
          title: 'Search query required',
          message: 'Please enter a city, neighborhood, landmark, or street address before searching.',
          apiStatus: 'EMPTY_QUERY',
          troubleshooting: [
            'Type a destination such as "Shibuya, Tokyo" or "Cologne, Germany".',
            'Or select one of the five preset cities below.',
          ],
          query: '',
        });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsGeocoding(true);
      setErrorState(null);
      setActivePresetId(presetId);

      try {
        const response = await fetch(
          `/api/geocode?address=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const payload = isJson ? await response.json() : null;

        if (!response.ok) {
          const errObj = payload?.error;
          setErrorState({
            title: 'Geocoding request failed',
            message:
              errObj?.message ||
              `The Geocoding V4 proxy returned HTTP ${response.status}.`,
            httpStatus: errObj?.httpStatus || response.status,
            apiStatus: errObj?.status,
            troubleshooting: Array.isArray(errObj?.troubleshooting)
              ? errObj.troubleshooting
              : [
                  'Ensure the Geocoding API is enabled on your Google Cloud project.',
                  'Check your query formatting and try again.',
                ],
            query: trimmed,
          });
          return;
        }

        const data = payload as GeocodeApiResponse;
        const topResult = data?.results?.[0];

        if (!topResult || !topResult.location) {
          setErrorState({
            title: 'No matching location found',
            message: `Google Geocoding V4 returned zero coordinates for "${trimmed}".`,
            apiStatus: 'ZERO_RESULTS',
            troubleshooting: [
              'Check spelling or add a city, region, or country name (for example, "Copacabana, Rio de Janeiro").',
              'Avoid non-geographic terms or ambiguous abbreviations.',
            ],
            query: trimmed,
          });
          return;
        }

        setActiveResult(topResult);
        setActiveQuery(trimmed);
        setRecenterTrigger((prev) => prev + 1);

        const label =
          topResult.postalAddress?.locality ||
          topResult.addressComponents?.[0]?.longText ||
          trimmed;

        setHistory((prev) => {
          const deduped = prev.filter(
            (entry) => entry.result.placeId !== topResult.placeId && entry.query !== trimmed
          );
          return [
            {
              id: topResult.placeId || `${trimmed}-${Date.now()}`,
              query: trimmed,
              label,
              result: topResult,
            },
            ...deduped,
          ].slice(0, 5);
        });

        const cityAndState = extractCityAndState(topResult, trimmed);
        void fetchLocalInsights(cityAndState);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setErrorState({
          title: 'Network or server communication error',
          message:
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred while calling the geocoding service.',
          apiStatus: 'NETWORK_ERROR',
          troubleshooting: [
            'Check that the application backend server is reachable.',
            'Confirm your internet connection and retry the request.',
          ],
          query: trimmed,
        });
      } finally {
        if (abortControllerRef.current === controller) {
          setIsGeocoding(false);
        }
      }
    },
    [fetchLocalInsights]
  );

  // Initial default geocode on first mount
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    void executeGeocode('Buenos Aires, Argentina', 'buenos-aires');
  }, [executeGeocode]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const matchedPreset = PRESET_LOCATIONS.find(
      (preset) =>
        preset.label.toLowerCase() === searchInput.trim().toLowerCase() ||
        preset.query.toLowerCase() === searchInput.trim().toLowerCase()
    );
    void executeGeocode(searchInput, matchedPreset ? matchedPreset.id : null);
  };

  const handlePresetClick = (preset: PresetLocation) => {
    setSearchInput(preset.query);
    void executeGeocode(preset.query, preset.id);
  };

  const handleSelectHistory = (entry: HistoryEntry) => {
    setErrorState(null);
    setSearchInput(entry.query);
    setActiveQuery(entry.query);
    setActiveResult(entry.result);
    const matchedPreset = PRESET_LOCATIONS.find((p) => p.query === entry.query);
    setActivePresetId(matchedPreset ? matchedPreset.id : null);
    setRecenterTrigger((prev) => prev + 1);
    const cityAndState = extractCityAndState(entry.result, entry.query);
    void fetchLocalInsights(cityAndState);
  };

  const handleRetry = () => {
    void executeGeocode(lastAttemptedQuery || searchInput, activePresetId);
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setErrorState(null);
  };

  const handleRecenter = () => {
    setRecenterTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA] text-slate-900 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left 1/3 Editorial Control Panel */}
      <aside
        aria-label="Location search and geospatial controls"
        className="w-full shrink-0 border-b border-slate-200 bg-[#F8F9FA] lg:h-screen lg:w-1/3 lg:min-w-[380px] lg:max-w-[540px] lg:overflow-y-auto lg:border-b-0 lg:border-r"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 sm:p-7">
          {/* Masthead */}
          <header className="border-b border-slate-200 pb-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-blue-700">
                  <Compass className="h-4 w-4" aria-hidden="true" />
                </span>
                <h1 className="font-serif text-2xl font-semibold tracking-tight text-slate-950 whitespace-nowrap">
                  Block Explorer
                </h1>
              </div>
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                Geocoding V4
              </span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600">
              Search any city, neighborhood, or street address to resolve coordinates and inspect urban blocks on the interactive map.
            </p>
          </header>

          {/* Search Form */}
          <section aria-labelledby="search-heading" className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <label
                id="search-heading"
                htmlFor="location-search-input"
                className="text-xs font-semibold text-slate-800"
              >
                Search location
              </label>
              <span className="text-xs text-slate-500">City · District · Address</span>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex items-stretch gap-2" noValidate>
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="location-search-input"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="e.g. Kreuzberg, Berlin or Palermo, Buenos Aires"
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-slate-300 bg-white pr-9 pl-9 text-sm text-slate-900 placeholder:text-slate-400 transition-colors duration-150 focus:border-blue-700 focus:outline-2 focus:outline-offset-0 focus:outline-blue-700/20"
                />
                {searchInput.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="Clear search input"
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-700"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isGeocoding}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                {isGeocoding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Locating</span>
                  </>
                ) : (
                  <span>Explore</span>
                )}
              </button>
            </form>
          </section>

          {/* Five Preset Cities & Neighborhoods */}
          <section aria-labelledby="presets-heading" className="space-y-2.5">
            <h2 id="presets-heading" className="text-xs font-semibold text-slate-800">
              Featured Presets
            </h2>
            <div className="flex flex-wrap gap-2">
              {PRESET_LOCATIONS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    disabled={isGeocoding}
                    aria-pressed={isSelected}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3.5 py-2 text-xs font-medium transition-colors duration-150 disabled:opacity-60 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                      isSelected
                        ? 'border-blue-700 bg-blue-700 text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <MapPin
                      className={`h-3.5 w-3.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Clear Error Diagnostic Panel */}
          {errorState && (
            <ErrorAlert
              error={errorState}
              onRetry={lastAttemptedQuery ? handleRetry : undefined}
              onDismiss={() => setErrorState(null)}
              isRetrying={isGeocoding}
            />
          )}

          {/* Active Location Dossier or Loading / Empty State */}
          <div className="border-t border-slate-200 pt-5">
            {isGeocoding && !activeResult ? (
              <div className="space-y-3 py-2" aria-busy="true">
                <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
                <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                <div className="mt-4 space-y-2 border-y border-slate-200 py-3">
                  <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                </div>
              </div>
            ) : activeResult ? (
              <LocationDossier
                result={activeResult}
                query={activeQuery}
                onRecenter={handleRecenter}
              />
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">
                <p className="font-medium text-slate-900">Ready to explore</p>
                <p className="mt-1 leading-relaxed text-slate-600">
                  Enter an address above or choose one of the five featured destinations to geocode its coordinates and inspect it on the map.
                </p>
              </div>
            )}
          </div>

          {/* Recent Explorations */}
          {history.length > 1 && (
            <section
              aria-labelledby="history-heading"
              className="border-t border-slate-200 pt-5 space-y-2.5"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <History className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <h2 id="history-heading">Recent Explorations</h2>
              </div>
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                {history.map((entry) => {
                  const isCurrent =
                    activeResult?.placeId &&
                    entry.result.placeId === activeResult.placeId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectHistory(entry)}
                        className={`flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700 ${
                          isCurrent
                            ? 'bg-blue-50/70 text-blue-950 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{entry.label}</span>
                        <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                          {entry.result.location.latitude.toFixed(2)},{' '}
                          {entry.result.location.longitude.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </aside>

      {/* Right 2/3 Full-Height Interactive Map */}
      <main
        aria-label="Interactive geospatial map"
        className="relative h-[58vh] min-h-[420px] w-full flex-1 lg:h-screen lg:w-2/3"
      >
        {isResolvingKey ? (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-600">
            Initializing Google Maps Platform...
          </div>
        ) : mapsApiKey ? (
          <APIProvider apiKey={mapsApiKey} libraries={['marker']} language="en">
            <ExplorerMap
              activeResult={activeResult}
              activeQuery={activeQuery}
              recenterTrigger={recenterTrigger}
              authFailure={authFailure}
            />
          </APIProvider>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-100 p-6">
            <div className="max-w-md">
              <ErrorAlert
                error={{
                  title: 'Google Maps API key missing',
                  message:
                    'Block Explorer requires a configured Google Maps Platform API key to render the interactive map.',
                  apiStatus: 'MISSING_API_KEY',
                  troubleshooting: [
                    'Set VITE_GOOGLE_MAPS_API_KEY in your environment secrets.',
                    'Ensure the Maps JavaScript API and Geocoding API are enabled on the project.',
                  ],
                }}
              />
            </div>
          </div>
        )}

        <LocalInsightsBanner
          placeLabel={insightsPlaceLabel}
          insights={insightsData}
          isLoading={isInsightsLoading}
          error={insightsError}
          onRetry={() => {
            if (insightsPlaceLabel) {
              void fetchLocalInsights(insightsPlaceLabel);
            }
          }}
          onDismissError={() => setInsightsError(null)}
        />
      </main>
    </div>
  );
}
