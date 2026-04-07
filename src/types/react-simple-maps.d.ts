declare module 'react-simple-maps' {
  import * as React from 'react';

  interface ProjectionConfig {
    scale?: number;
    center?: [number, number];
    rotate?: [number, number, number];
    parallels?: [number, number];
  }

  interface GeographyStyle {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    outline?: string;
    cursor?: string;
  }

  interface GeoFeature {
    rsmKey: string;
    [key: string]: unknown;
  }

  export interface ComposableMapProps {
    projection?: string;
    projectionConfig?: ProjectionConfig;
    width?: number;
    height?: number;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export interface GeographiesProps {
    geography: string;
    children: (args: { geographies: GeoFeature[] }) => React.ReactNode;
  }

  export interface GeographyProps {
    geography: GeoFeature;
    style?: {
      default?: GeographyStyle;
      hover?: GeographyStyle;
      pressed?: GeographyStyle;
    };
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    onClick?: (evt: React.MouseEvent) => void;
    onMouseEnter?: (evt: React.MouseEvent) => void;
    onMouseLeave?: (evt: React.MouseEvent) => void;
    [key: string]: unknown;
  }

  export interface MarkerProps {
    coordinates: [number, number];
    style?: React.CSSProperties;
    children?: React.ReactNode;
    onMouseEnter?: (evt: React.MouseEvent) => void;
    onMouseLeave?: (evt: React.MouseEvent) => void;
    onClick?: (evt: React.MouseEvent) => void;
  }

  export interface ZoomableGroupProps {
    zoom?: number;
    center?: [number, number];
    onMoveEnd?: (args: { zoom: number; coordinates: [number, number] }) => void;
    onMoveStart?: (args: { zoom: number; coordinates: [number, number] }) => void;
    minZoom?: number;
    maxZoom?: number;
    filterZoomEvent?: (evt: WheelEvent | TouchEvent) => boolean;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }

  export const ComposableMap: React.FC<ComposableMapProps>;
  export const Geographies: React.FC<GeographiesProps>;
  export const Geography: React.FC<GeographyProps>;
  export const Marker: React.FC<MarkerProps>;
  export const ZoomableGroup: React.FC<ZoomableGroupProps>;
}
