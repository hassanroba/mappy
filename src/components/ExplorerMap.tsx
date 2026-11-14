/// <reference types="google.maps" />
import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Layers, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { GeocodeErrorState, GeocodeResult } from '../types/geocode';
import { ErrorAlert } from './ErrorAlert';

type MapTypeOption = 'roadmap' | 'hybrid' | 'terrain';

interface ExplorerMapProps {
  activeResult: GeocodeResult | null;
  activeQuery: string;
  recenterTrigger: number;
  authFailure: boolean;
  onMapError?: (error: GeocodeErrorState) => void;
}

const DEFAULT_CENTER: google.maps.LatLngLiteral = {
  lat: -34.603722,
  lng: -58.381592,
};

const MAP_TYPES: { id: MapTypeOption; label: string }[] = [
  { id: 'roadmap', label: 'Street' },
  { id: 'hybrid', label: 'Satellite' },
  { id: 'terrain', label: 'Terrain' },
];

function MapCameraController({
  activeResult,
  recenterTrigger,
}: {
  activeResult: GeocodeResult | null;
  recenterTrigger: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !activeResult) return;

    const targetCenter: google.maps.LatLngLiteral = {
      lat: activeResult.location.latitude,
      lng: activeResult.location.longitude,
    };

    if (activeResult.viewport) {
      const bounds = new google.maps.LatLngBounds(
        {
          lat: activeResult.viewport.low.latitude,
          lng: activeResult.viewport.low.longitude,
        },
        {
          lat: activeResult.viewport.high.latitude,
          lng: activeResult.viewport.high.longitude,
        }
      );

      map.panTo(targetCenter);
      map.fitBounds(bounds, { top: 64, right: 64, bottom: 64, left: 64 });
    } else {
      map.panTo(targetCenter);
      map.setZoom(14);
    }
  }, [map, activeResult, recenterTrigger]);

  return null;
}

export function ExplorerMap({
  activeResult,
  activeQuery,
  recenterTrigger,
  authFailure,
}: ExplorerMapProps) {
  const loadingStatus = useApiLoadingStatus();
  const [mapType, setMapType] = useState<MapTypeOption>('roadmap');
  const [infoWindowOpen, setInfoWindowOpen] = useState(true);
  const [markerRef, marker] = useAdvancedMarkerRef();
  const map = useMap();

  useEffect(() => {
    if (activeResult) {
      setInfoWindowOpen(true);
    }
  }, [activeResult]);

  const handleMarkerClick = useCallback(() => {
    setInfoWindowOpen((prev) => !prev);
  }, []);

  const handleCloseInfoWindow = useCallback(() => {
    setInfoWindowOpen(false);
  }, []);

  const handleFitView = useCallback(() => {
    if (!map || !activeResult) return;
    const center = {
      lat: activeResult.location.latitude,
      lng: activeResult.location.longitude,
    };
    if (activeResult.viewport) {
      const bounds = new google.maps.LatLngBounds(
        {
          lat: activeResult.viewport.low.latitude,
          lng: activeResult.viewport.low.longitude,
        },
        {
          lat: activeResult.viewport.high.latitude,
          lng: activeResult.viewport.high.longitude,
        }
      );
      map.panTo(center);
      map.fitBounds(bounds, { top: 64, right: 64, bottom: 64, left: 64 });
    } else {
      map.panTo(center);
      map.setZoom(14);
    }
  }, [map, activeResult]);

  const markerPosition = activeResult
    ? {
        lat: activeResult.location.latitude,
        lng: activeResult.location.longitude,
      }
    : null;

  const hasMapLoadError =
    authFailure ||
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE;

  const mapDiagnosticError: GeocodeErrorState | null = hasMapLoadError
    ? {
        title:
          loadingStatus === APILoadingStatus.AUTH_FAILURE || authFailure
            ? 'Google Maps authentication failed'
            : 'Failed to load Google Maps JavaScript API',
        message:
          loadingStatus === APILoadingStatus.AUTH_FAILURE || authFailure
            ? 'The Maps JavaScript API rejected the configured API key or referrer origin.'
            : 'The Google Maps JavaScript SDK could not be initialized in this browser session.',
        apiStatus: authFailure ? 'AUTH_FAILURE' : String(loadingStatus),
        troubleshooting: [
          'Ensure the Maps JavaScript API is enabled for your Google Cloud project.',
          'Check that billing is active on the selected Google Cloud project.',
          'Verify HTTP referrer restrictions on the API key allow this host origin.',
        ],
      }
    : null;

  return (
    <div className="relative h-full w-full bg-slate-100">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={12}
        mapTypeId={mapType}
        gestureHandling="greedy"
        streetViewControl={true}
        fullscreenControl={false}
        mapTypeControl={false}
        zoomControl={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="h-full w-full"
        style={{ width: '100%', height: '100%' }}
      >
        <MapCameraController
          activeResult={activeResult}
          recenterTrigger={recenterTrigger}
        />

        {markerPosition && activeResult && (
          <AdvancedMarker
            ref={markerRef}
            position={markerPosition}
            onClick={handleMarkerClick}
            title={activeResult.formattedAddress}
          >
            <div className="group relative flex flex-col items-center cursor-pointer">
              <div className="mb-1.5 rounded-md border border-slate-900/15 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white shadow-md whitespace-nowrap">
                {activeResult.postalAddress?.locality ||
                  activeResult.addressComponents?.[0]?.longText ||
                  activeQuery}
              </div>
              <div className="relative flex items-center justify-center">
                <span className="absolute h-8 w-8 rounded-full bg-blue-600/20" />
                <span className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-700 shadow-md transition-transform duration-150 group-hover:scale-110">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </span>
              </div>
            </div>
          </AdvancedMarker>
        )}

        {markerPosition && activeResult && infoWindowOpen && marker && (
          <InfoWindow
            anchor={marker}
            maxWidth={280}
            pixelOffset={[0, -6]}
            onCloseClick={handleCloseInfoWindow}
          >
            <div className="p-1 text-slate-900">
              <p className="font-serif text-sm font-semibold text-slate-950">
                {activeResult.postalAddress?.locality ||
                  activeResult.addressComponents?.[0]?.longText ||
                  activeQuery}
              </p>
              <p className="mt-1 text-xs leading-snug text-slate-600">
                {activeResult.formattedAddress}
              </p>
              <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums">
                {activeResult.location.latitude.toFixed(5)},{' '}
                {activeResult.location.longitude.toFixed(5)}
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Top-right floating map layer & viewport controls */}
      <div className="pointer-events-none absolute top-4 right-4 z-10 flex flex-wrap items-center justify-end gap-2">
        <div
          role="group"
          aria-label="Map layer selector"
          className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-slate-200/90 bg-white/95 p-1 shadow-sm backdrop-blur-sm"
        >
          <Layers className="ml-1.5 mr-1 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          {MAP_TYPES.map((option) => {
            const isActive = mapType === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setMapType(option.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700 ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {activeResult && (
          <button
            type="button"
            onClick={handleFitView}
            title="Fit map to geocoded bounds"
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-colors duration-150 hover:bg-slate-50 hover:text-slate-950 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <Maximize2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <span>Fit bounds</span>
          </button>
        )}
      </div>

      {/* Loading overlay before Maps JS SDK finishes loading */}
      {loadingStatus === APILoadingStatus.LOADING && !hasMapLoadError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100/70 backdrop-blur-[1px]">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 shadow-sm">
            Loading interactive map canvas...
          </div>
        </div>
      )}

      {/* Map-level error overlay for immediate troubleshooting */}
      {mapDiagnosticError && (
        <div className="absolute inset-x-4 top-4 z-20 mx-auto max-w-lg shadow-lg">
          <ErrorAlert error={mapDiagnosticError} />
        </div>
      )}
    </div>
  );
}
