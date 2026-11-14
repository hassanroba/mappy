export interface LatLngCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeViewport {
  low: LatLngCoordinates;
  high: LatLngCoordinates;
}

export interface GeocodePostalAddress {
  regionCode?: string;
  languageCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  sublocality?: string;
  addressLines?: string[];
}

export interface GeocodeAddressComponent {
  longText: string;
  shortText?: string;
  types: string[];
  languageCode?: string;
}

export interface GeocodePlusCode {
  globalCode?: string;
  compoundCode?: string;
}

export type GeocodeGranularity =
  | 'GRANULARITY_UNSPECIFIED'
  | 'ROOFTOP'
  | 'RANGE_INTERPOLATED'
  | 'GEOMETRIC_CENTER'
  | 'APPROXIMATE';

export interface GeocodeResult {
  place?: string;
  placeId?: string;
  location: LatLngCoordinates;
  granularity?: GeocodeGranularity;
  viewport?: GeocodeViewport;
  bounds?: GeocodeViewport;
  formattedAddress: string;
  postalAddress?: GeocodePostalAddress;
  addressComponents?: GeocodeAddressComponent[];
  types?: string[];
  plusCode?: GeocodePlusCode;
}

export interface GeocodeApiResponse {
  query: string;
  endpoint: string;
  results: GeocodeResult[];
}

export interface GeocodeErrorState {
  title: string;
  message: string;
  httpStatus?: number;
  apiStatus?: string;
  troubleshooting: string[];
  query?: string;
}

export interface PresetLocation {
  id: string;
  label: string;
  query: string;
  countryHint: string;
}

export interface LocalInsightsData {
  placeLabel: string;
  html: string;
}

export interface LocalInsightsError {
  message: string;
  status?: string;
  httpStatus?: number;
}
