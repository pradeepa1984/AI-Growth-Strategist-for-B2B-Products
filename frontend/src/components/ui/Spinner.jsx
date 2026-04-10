/**
 * Spinner — inline loading indicator.
 *
 * Usage:
 *   <Spinner />                          // default size (16px)
 *   <Spinner size={24} color="#9b72d0" />
 *   <Spinner label="Analyzing market..." />
 */
export default function Spinner({ size = 16, color = "currentColor", label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        style={{ width: size, height: size }}
        className="animate-spin flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill={color}
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {label && <span className="text-sm text-gray-500">{label}</span>}
    </span>
  );
}
