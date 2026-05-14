/**
 * RevenueChart.jsx
 * Line chart showing revenue trend across years.
 * Props:
 *   data — object keyed by year, e.g. { "2021": 211.3, ..., "2025": 411.8 }
 *          Falls back to hardcoded values when not provided.
 *   ref  — forwarded to react-chartjs-2 <Line>; call ref.current.toBase64Image()
 *          to capture the canvas as a PNG data URL (used by PDF generator).
 */

import { forwardRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// Fallback mirrors financials.json — only used when no data prop is passed
const FALLBACK = { '2021': 211.3, '2022': 310.5, '2023': 312.9, '2024': 350.6, '2025': 411.8 };

const RevenueChart = forwardRef(function RevenueChart({ data }, ref) {
  const src    = data || FALLBACK;
  const years  = Object.keys(src);
  const values = Object.values(src);

  const chartData = {
    labels: years,   // all years are actuals from investor deck
    datasets: [
      {
        label: 'Revenue ($M)',
        data: values,
        borderColor: '#14B8A6',
        backgroundColor: 'rgba(20,184,166,0.08)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#14B8A6',
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    animation: false,   // instant render — needed for reliable toBase64Image() capture
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `$${ctx.parsed.y}M` } },
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: { callback: v => `$${v}M`, font: { size: 10 } },
        grid: { color: '#f3f4f6' },
      },
      x: { ticks: { font: { size: 10 } } },
    },
  };

  return <Line ref={ref} data={chartData} options={options} />;
});

export default RevenueChart;
