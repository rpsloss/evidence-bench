export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 11v17h6V20h10v8h6V11h-6V5h-4v6h-2V5h-4v6H5z"
      />
    </svg>
  );
}
