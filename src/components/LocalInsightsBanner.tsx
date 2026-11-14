import { AlertTriangle, BookOpen, ChevronDown, ChevronUp, Loader2, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import type { LocalInsightsData, LocalInsightsError } from '../types/geocode';

interface LocalInsightsBannerProps {
  placeLabel: string | null;
  insights: LocalInsightsData | null;
  isLoading: boolean;
  error: LocalInsightsError | null;
  onRetry: () => void;
  onDismissError: () => void;
}

export function LocalInsightsBanner({
  placeLabel,
  insights,
  isLoading,
  error,
  onRetry,
  onDismissError,
}: LocalInsightsBannerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!placeLabel && !isLoading && !insights && !error) {
    return null;
  }

  const displayPlace = insights?.placeLabel || placeLabel || 'Selected Location';

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-6 z-10 flex justify-center sm:inset-x-10">
      <section
        aria-label="Local Insights"
        className="pointer-events-auto w-full max-w-3xl rounded-xl border border-slate-200/95 bg-white/95 shadow-lg backdrop-blur-md transition-opacity duration-150"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-blue-700">
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h2 className="font-serif text-sm font-semibold text-slate-950 whitespace-nowrap">
                Local Insights
              </h2>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <p className="truncate text-xs font-medium text-slate-600">{displayPlace}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {error && (
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss insights error"
                className="rounded-md p-1.5 text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? 'Expand Local Insights' : 'Collapse Local Insights'}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-700"
            >
              <span>{isCollapsed ? 'Show' : 'Hide'}</span>
              {isCollapsed ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        {!isCollapsed && (
          <div className="border-t border-slate-200/80 px-4 py-3.5 sm:px-5">
            {isLoading ? (
              <div className="flex items-center gap-3 py-1 text-xs text-slate-600" role="status">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-700" aria-hidden="true" />
                <span>Curating three local facts for {displayPlace}...</span>
              </div>
            ) : error ? (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/90 p-3 text-red-950 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-950">
                      Unable to load Local Insights
                      {error.status ? ` (${error.status})` : ''}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-red-800">{error.message}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-1.5 self-start rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 transition-colors duration-150 hover:bg-red-100/70 whitespace-nowrap shrink-0 sm:self-center focus-visible:outline-2 focus-visible:outline-red-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Try again</span>
                </button>
              </div>
            ) : insights ? (
              <div
                className="max-h-40 overflow-y-auto pr-1 [&_ul]:space-y-2 [&_li]:relative [&_li]:pl-4 [&_li]:text-xs [&_li]:sm:text-[13px] [&_li]:leading-relaxed [&_li]:text-slate-700 [&_li]:before:absolute [&_li]:before:top-[7px] [&_li]:before:left-0 [&_li]:before:h-1.5 [&_li]:before:w-1.5 [&_li]:before:rounded-full [&_li]:before:bg-blue-700 [&_li]:before:content-[''] [&_strong]:font-semibold [&_strong]:text-slate-900 [&_b]:font-semibold [&_b]:text-slate-900"
                dangerouslySetInnerHTML={{ __html: insights.html }}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
