import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import type { GeocodeErrorState } from '../types/geocode';

interface ErrorAlertProps {
  error: GeocodeErrorState;
  onRetry?: () => void;
  onDismiss?: () => void;
  isRetrying?: boolean;
}

export function ErrorAlert({ error, onRetry, onDismiss, isRetrying }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-red-200 bg-red-50/90 p-4 text-red-950"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-red-950">{error.title}</h3>
            {(error.httpStatus || error.apiStatus) && (
              <p className="mt-0.5 font-mono text-xs text-red-800 tabular-nums">
                {[
                  error.httpStatus ? `HTTP ${error.httpStatus}` : null,
                  error.apiStatus || null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error message"
            className="rounded p-1 text-red-700 transition-colors duration-150 hover:bg-red-100 hover:text-red-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="mt-2.5 text-sm leading-relaxed text-red-900">{error.message}</p>

      {error.troubleshooting.length > 0 && (
        <div className="mt-3 border-t border-red-200/80 pt-2.5">
          <p className="text-xs font-semibold text-red-900">Troubleshooting steps</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-red-800">
            {error.troubleshooting.map((step, index) => (
              <li key={index} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-0.5 font-mono text-[11px] text-red-700">
                  {index + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onRetry && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-900 transition-colors duration-150 hover:bg-red-100/70 disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isRetrying ? 'Retrying' : 'Retry request'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
