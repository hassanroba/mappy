import { Check, Copy, Crosshair } from 'lucide-react';
import { useState } from 'react';
import type { GeocodeResult } from '../types/geocode';

interface LocationDossierProps {
  result: GeocodeResult;
  query: string;
  onRecenter: () => void;
}

function formatCoordinate(value: number, positiveDir: string, negativeDir: string): string {
  const direction = value >= 0 ? positiveDir : negativeDir;
  return `${Math.abs(value).toFixed(5)}° ${direction}`;
}

function formatGranularity(granularity?: string): string {
  if (!granularity || granularity === 'GRANULARITY_UNSPECIFIED') {
    return 'Standard';
  }
  return granularity
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPlaceType(types?: string[]): string {
  if (!types || types.length === 0) return 'Location';
  return types[0]
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function LocationDossier({ result, query, onRecenter }: LocationDossierProps) {
  const [copied, setCopied] = useState(false);

  const primaryTitle =
    result.postalAddress?.locality ||
    result.addressComponents?.[0]?.longText ||
    query;

  const lat = result.location.latitude;
  const lng = result.location.longitude;

  const handleCopyCoordinates = async () => {
    const coordText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(coordText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const regionCode = result.postalAddress?.regionCode;
  const metadataSegments = [
    formatPlaceType(result.types),
    formatGranularity(result.granularity),
    regionCode || null,
  ].filter(Boolean);

  return (
    <section aria-labelledby="active-location-heading" className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-500">
          {metadataSegments.join(' · ')}
        </p>
        <h2
          id="active-location-heading"
          className="font-serif text-2xl font-semibold tracking-tight text-slate-900 text-balance"
        >
          {primaryTitle}
        </h2>
        <p className="text-sm leading-relaxed text-slate-600">{result.formattedAddress}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRecenter}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Crosshair className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
          <span>Re-center map</span>
        </button>

        <button
          type="button"
          onClick={handleCopyCoordinates}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              <span>Coordinates copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>Copy coordinates</span>
            </>
          )}
        </button>
      </div>

      <dl className="divide-y divide-slate-200 border-y border-slate-200 text-xs">
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="font-medium text-slate-500">Coordinates</dt>
          <dd className="font-mono text-slate-900 tabular-nums text-right">
            {formatCoordinate(lat, 'N', 'S')} · {formatCoordinate(lng, 'E', 'W')}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="font-medium text-slate-500">Decimal Lat / Lng</dt>
          <dd className="font-mono text-slate-800 tabular-nums text-right">
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </dd>
        </div>

        {result.plusCode?.globalCode && (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="font-medium text-slate-500">Plus Code</dt>
            <dd className="font-mono text-slate-800 tabular-nums text-right">
              {result.plusCode.compoundCode || result.plusCode.globalCode}
            </dd>
          </div>
        )}

        {result.viewport && (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="font-medium text-slate-500">Viewport Span</dt>
            <dd className="font-mono text-slate-700 tabular-nums text-right">
              {result.viewport.low.latitude.toFixed(3)}, {result.viewport.low.longitude.toFixed(3)} to{' '}
              {result.viewport.high.latitude.toFixed(3)}, {result.viewport.high.longitude.toFixed(3)}
            </dd>
          </div>
        )}

        {result.placeId && (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="font-medium text-slate-500 shrink-0">Place ID</dt>
            <dd className="truncate font-mono text-slate-600 text-right max-w-[220px]" title={result.placeId}>
              {result.placeId}
            </dd>
          </div>
        )}
      </dl>

      {result.addressComponents && result.addressComponents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-700">Administrative Hierarchy</h3>
          <div className="grid grid-cols-1 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
            {result.addressComponents.slice(0, 5).map((component, idx) => (
              <div
                key={`${component.longText}-${idx}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <span className="font-medium text-slate-800 truncate">{component.longText}</span>
                <span className="font-mono text-[11px] text-slate-500 whitespace-nowrap shrink-0">
                  {component.types[0]?.replace(/_/g, ' ') || 'component'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
