interface SpinnerProps {
  className?: string
  label?: string
}

export function Spinner({ className = '', label }: SpinnerProps) {
  return (
    <span className="inline-flex items-center gap-2 text-neutral-400">
      <span
        className={`h-4 w-4 animate-spin rounded-full border-2 border-neutral-700 border-t-sky-500 ${className}`}
        role="status"
        aria-label={label ?? 'Loading'}
      />
      {label && <span className="text-sm">{label}</span>}
    </span>
  )
}

export function PageSpinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}

export default Spinner
