import { cn } from '@/lib/utils';

/** Belopp i svenska kronor — undvik Euro-ikon för SEK-fält */
export function SekIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-semibold tabular-nums leading-none',
        className
      )}
      aria-hidden
    >
      kr
    </span>
  );
}
