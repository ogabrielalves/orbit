type SpinnerProps = {
  className?: string;
};

export function Spinner({ className = "size-4" }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden="true"
      data-testid="spinner"
      className={`animate-spin motion-reduce:animate-none ${className}`}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
