"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER: [number, number] = [13.8476, 100.5696]; // KU Bangkhen campus
const DEFAULT_ZOOM = 16;

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const placeMarker = useCallback((latlng: L.LatLng) => {
    const map = mapRef.current;
    if (!map) return;

    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
    } else {
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width: 28px; height: 28px;
          background: #3b82f6;
          border: 3px solid #fff;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          transform: translate(-14px, -14px);
        "></div>`,
        iconSize: [0, 0],
      });
      markerRef.current = L.marker(latlng, { icon, draggable: true }).addTo(map);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current?.getLatLng();
        if (pos) onChangeRef.current(pos.lat, pos.lng);
      });
    }

    onChangeRef.current(latlng.lat, latlng.lng);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const center: [number, number] =
      lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => placeMarker(e.latlng));

    mapRef.current = map;

    if (lat != null && lng != null) {
      placeMarker(L.latLng(lat, lng));
    }

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return;
    const pos = L.latLng(lat, lng);
    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
    }
  }, [lat, lng]);

  const [locating, setLocating] = useState(false);

  const goToCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.setView(latlng, 17);
        placeMarker(latlng);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [placeMarker]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-700">
      <div ref={mapContainerRef} style={{ height: 280, width: "100%" }} />
      <button
        type="button"
        onClick={goToCurrentLocation}
        disabled={locating}
        className="absolute right-2 top-2 z-[1000] flex h-8 w-8 items-center justify-center rounded-md bg-white shadow-md transition hover:bg-gray-100 disabled:opacity-50"
        title="Go to current location"
      >
        {locating ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-blue-500" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
          </svg>
        )}
      </button>
      {lat == null || lng == null ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <p className="rounded-lg bg-gray-900/90 px-4 py-2 text-sm font-medium text-gray-300">
            Click on the map to set parking location
          </p>
        </div>
      ) : null}
    </div>
  );
}
