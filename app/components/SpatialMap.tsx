"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import L from "leaflet";

interface SpatialMapProps {
  onPolygonDrawn: (geojson: any) => void;
  onPolygonCleared: () => void;
  initialCenter?: [number, number]; // [lat, lng]
  zoom?: number;
  clearTrigger?: number; // Increment to clear shapes externally
}

export default function SpatialMap({
  onPolygonDrawn,
  onPolygonCleared,
  initialCenter = [-34.9285, 138.6007], // Default: Adelaide, SA
  zoom = 11,
  clearTrigger = 0,
}: SpatialMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  // Clear shapes when clearTrigger updates (e.g. after Hunt button is clicked or reset)
  useEffect(() => {
    if (drawnItemsRef.current && clearTrigger > 0) {
      drawnItemsRef.current.clearLayers();
    }
  }, [clearTrigger]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Dynamically require leaflet-draw in client-only context
    require("leaflet-draw");

    // Initialize Leaflet Map
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom,
      zoomControl: true,
    });
    mapInstanceRef.current = map;

    // OpenStreetMap standard tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    // Force Leaflet recalculations on multiple ticks to guarantee DOM container dimensions are resolved
    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 500);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    // FeatureGroup to store and display editable drawn shapes
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Configure Drawing Toolbar: enable polygon and rectangle
    const drawControl = new (L.Control as any).Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: "#2563eb", // blue-600
            weight: 3,
            fillColor: "#3b82f6", // blue-500
            fillOpacity: 0.35,
          },
        },
        rectangle: {
          shapeOptions: {
            color: "#2563eb",
            weight: 3,
            fillColor: "#3b82f6",
            fillOpacity: 0.35,
          },
        },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });
    map.addControl(drawControl);

    // Event 1: Shape creation completed (Draw completed)
    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      const layer = e.layer;
      drawnItems.clearLayers(); // Keep only one active search boundary at a time
      drawnItems.addLayer(layer);

      // Extract standard GeoJSON Geometry object
      const geojsonFeature = layer.toGeoJSON();
      onPolygonDrawn(geojsonFeature.geometry);
    });

    // Event 2: Shape deleted
    map.on((L as any).Draw.Event.DELETED, () => {
      onPolygonCleared();
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [initialCenter, zoom, onPolygonDrawn, onPolygonCleared]);

  return (
    <div className="relative w-full h-[420px] rounded-xl overflow-hidden border border-gray-200 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      <div className="absolute bottom-2 left-2 z-10 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-md border border-gray-200 text-[11px] text-gray-600 shadow-xs pointer-events-none">
        Draw a polygon or box over your target territory
      </div>
    </div>
  );
}

