/**
 * ErrorBox — clean, dismissible error message block.
 *
 * Usage:
 *   <ErrorBox message={error} onDismiss={clearError} />
 *   <ErrorBox message={error} />                   // no dismiss button
 */
export default function ErrorBox({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {/* Icon */}
      <svg
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-9.25a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0v-3.5zm.75 6a.75.75 0 100-1.5.75.75 0 000 1.5z"
          clipRule="evenodd"
        />
      </svg>

      {/* Message */}
      <p className="flex-1 leading-snug">{message}</p>

      {/* Dismiss */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-red-400 hover:text-red-600 transition-colors"
          aria-label="Dismiss error"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      )}
    </div>
  );
}
