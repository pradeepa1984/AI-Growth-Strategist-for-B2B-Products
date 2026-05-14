/**
 * DrilldownModal.jsx
 * Popup shown when a CI keyword bar is clicked in Section F.
 * Renders a location-distribution chart (Pie if ≤5 locations, H-Bar if >5).
 * Closes on Escape or backdrop click.
 */

import { useEffect } from 'react';
import ChartRenderer from './ChartRenderer';

const LocationBar = ({ name, count, max, index }) => {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const opacity = Math.max(0.35, 1 - index * 0.15);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#D4EDE6" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: '#1A9E7A', opacity }}
        />
      </div>
      <span className="w-28 truncate text-right" style={{ color: "#2E4057" }} title={name}>{name}</span>
      <span className="font-bold w-7 text-right tabular-nums" style={{ color: "#1C2C3A" }}>{count}</span>
    </div>
  );
};

const DrilldownModal = ({ keyword, data = [], onClose }) => {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const total   = data.reduce((s, d) => s + d.count, 0);
  const topData = data.slice(0, 5);
  const maxVal  = topData[0]?.count || 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes modalPop {
          from { opacity: 0; transform: scale(0.93) translateY(-12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>

      <div
        className="rounded-2xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden flex flex-col"
        style={{
          backgroundColor: "#FFFFFF",
          animation: 'modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)',
          maxHeight: '85vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between gap-3"
          style={{ backgroundColor: '#E8F4F9', borderBottom: '1px solid #D4EDE6' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "#1C2C3A" }}>Location Drilldown</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: "#2E4057" }}>
              Keyword:{' '}
              <span className="font-semibold" style={{ color: "#0B4F43" }}>"{keyword}"</span>
              {' '}·{' '}
              <span>{total.toLocaleString()} matching lead{total !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-xl leading-none transition-colors"
            style={{ color: "#2E4057" }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#D4EDE6"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#D4EDE6 #E8F4F9' }}>
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10" style={{ color: "#2E4057" }}>
              <div className="text-4xl mb-2">🌍</div>
              <p className="text-sm font-medium">No location data for this keyword</p>
              <p className="text-xs mt-1" style={{ color: "#D4EDE6" }}>Location fields may be empty in the source CSV</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] mb-3 uppercase tracking-wide font-medium" style={{ color: "#2E4057" }}>
                {data.length} location{data.length !== 1 ? 's' : ''} — sorted by volume
              </p>

              <ChartRenderer data={data} variant="location" />

              {topData.length > 0 && (
                <div className="mt-4 space-y-2 pt-4" style={{ borderTop: '1px solid #D4EDE6' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "#2E4057" }}>
                    Top {topData.length}
                  </p>
                  {topData.map((loc, i) => (
                    <LocationBar key={loc.name} name={loc.name} count={loc.count} max={maxVal} index={i} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid #D4EDE6' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors"
            style={{ border: '1px solid #1A9E7A', color: '#0B4F43', backgroundColor: '#CCF2E8' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#5DD4B0'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#CCF2E8'; }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrilldownModal;
