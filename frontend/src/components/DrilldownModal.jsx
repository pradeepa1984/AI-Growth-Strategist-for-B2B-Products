/**
 * DrilldownModal.jsx
 * Popup shown when a CI keyword bar is clicked in Section F.
 * Renders a location-distribution chart (Pie if ≤5 locations, H-Bar if >5).
 * Closes on Escape or backdrop click.
 */

import { useEffect } from 'react';
import ChartRenderer from './ChartRenderer';

// Thin progress bar for the top-locations list
const LocationBar = ({ name, count, max, index }) => {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  const opacity = Math.max(0.35, 1 - index * 0.15);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: '#0284c7', opacity }}
        />
      </div>
      <span className="text-gray-600 w-28 truncate text-right" title={name}>{name}</span>
      <span className="font-bold text-gray-800 w-7 text-right tabular-nums">{count}</span>
    </div>
  );
};

const DrilldownModal = ({ keyword, data = [], onClose }) => {
  // Keyboard close
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[520px] mx-4 overflow-hidden flex flex-col"
        style={{ animation: 'modalPop 0.22s cubic-bezier(0.34,1.56,0.64,1)', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b border-purple-100 flex items-start justify-between gap-3"
          style={{ backgroundColor: '#F6E5FF' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Location Drilldown</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Keyword:{' '}
              <span className="font-semibold text-purple-700">"{keyword}"</span>
              {' '}·{' '}
              <span className="text-gray-600">{total.toLocaleString()} matching lead{total !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#e5e7eb #f9fafb' }}>
          {data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <div className="text-4xl mb-2">🌍</div>
              <p className="text-sm font-medium">No location data for this keyword</p>
              <p className="text-xs text-gray-300 mt-1">Location fields may be empty in the source CSV</p>
            </div>
          ) : (
            <>
              <p className="text-[10px] text-gray-400 mb-3 uppercase tracking-wide font-medium">
                {data.length} location{data.length !== 1 ? 's' : ''} — sorted by volume
              </p>

              {/* Chart (Pie if ≤5, H-Bar if >5) */}
              <ChartRenderer data={data} variant="location" />

              {/* Top locations list */}
              {topData.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
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
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrilldownModal;
