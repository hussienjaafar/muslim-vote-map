import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Aesthetic teal/blue ramp for the marketing flyover. Deterministic per state
// FIPS so the visual is stable but varied — no underlying data read.
const FLYOVER_RAMP = ['#0b2540', '#0e3a5f', '#0f5779', '#107a93', '#0ea5c9', '#22c2dd', '#5fd6e6'];


const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const STATES_URL = '/geojson/us-states.json';

// Flyover keyframes: [lng, lat, zoom, bearing, pitch, durationMs]
const KEYFRAMES: [number, number, number, number, number, number][] = [
  [-98.5, 39.8, 3.8, 0, 0, 0],           // Continental US overview
  [-74.0, 40.7, 5.5, -15, 30, 8000],      // Zoom to NY/NJ (high density)
  [-87.6, 41.9, 5.2, 10, 25, 6000],       // Pan to Chicago/IL
  [-118.2, 34.0, 5.0, -10, 30, 7000],     // Fly to LA/CA
  [-95.4, 29.8, 5.3, 5, 25, 6000],        // Pan to Houston/TX
  [-80.2, 25.8, 5.5, -5, 30, 5000],       // Miami/FL
  [-77.0, 38.9, 5.2, 10, 25, 5000],       // DC/VA/MD
  [-98.5, 39.8, 3.8, 0, 0, 6000],         // Back to overview
];

export function MapFlyover() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const animatingRef = useRef(true);
  const [loaded, setLoaded] = useState(false);

  const buildColorExpression = useCallback(() => {
    // Deterministic per-FIPS color from the marketing ramp — no data read.
    const expr: any[] = ['match', ['get', 'STATE']];
    for (let i = 1; i <= 56; i++) {
      const fips = String(i).padStart(2, '0');
      const color = FLYOVER_RAMP[(i * 7) % FLYOVER_RAMP.length];
      expr.push(fips, color);
    }
    expr.push('#1a3d6d');
    return expr;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [KEYFRAMES[0][0], KEYFRAMES[0][1]],
      zoom: KEYFRAMES[0][2],
      bearing: KEYFRAMES[0][3],
      pitch: KEYFRAMES[0][4],
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    });

    mapRef.current = map;

    map.on('load', async () => {
      const colorExpr: any = buildColorExpression();


      // Load states GeoJSON
      try {
        const resp = await fetch(STATES_URL);
        const geojson = await resp.json();
        if (geojson?.type === 'FeatureCollection') {
          map.addSource('states-flyover', { type: 'geojson', data: geojson });
          map.addLayer({
            id: 'states-flyover-fill',
            type: 'fill',
            source: 'states-flyover',
            paint: {
              'fill-color': colorExpr as any,
              'fill-opacity': 0.75,
            },
          });
          map.addLayer({
            id: 'states-flyover-border',
            type: 'line',
            source: 'states-flyover',
            paint: {
              'line-color': '#64748b',
              'line-width': 0.8,
              'line-opacity': 0.4,
            },
          });
        }
      } catch {
        // GeoJSON load failed — show base map only
      }

      setLoaded(true);

      // Start flyover animation loop
      let keyframeIdx = 1;
      const flyNext = () => {
        if (!animatingRef.current || !mapRef.current) return;
        const [lng, lat, zoom, bearing, pitch, dur] = KEYFRAMES[keyframeIdx];
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom,
          bearing,
          pitch,
          duration: dur,
          essential: true,
        });
        keyframeIdx = (keyframeIdx + 1) % KEYFRAMES.length;
        setTimeout(flyNext, dur + 1500); // pause between keyframes
      };
      setTimeout(flyNext, 2000); // initial delay
    });

    return () => {
      animatingRef.current = false;
      map.remove();
    };
  }, [buildColorExpression]);

  return (
    <div className="relative w-full aspect-[16/7] rounded-lg overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Gradient vignette overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'linear-gradient(to bottom, rgba(10,10,12,0.3) 0%, transparent 30%, transparent 70%, rgba(10,10,12,0.6) 100%), linear-gradient(to right, rgba(10,10,12,0.4) 0%, transparent 20%, transparent 80%, rgba(10,10,12,0.4) 100%)',
      }} />
      {/* Loading state */}
      {!loaded && (
        <div className="absolute inset-0 bg-[#0a0a0c] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
