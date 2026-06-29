// Domain: Question Bank
// Description: Compact 1–5 difficulty indicator (filled dots).
import { cn } from '@/lib/utils/cn'
import { DIFFICULTY_LABEL } from './labels'

export function DifficultyDots({ level }: { level: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Difficulty: ${DIFFICULTY_LABEL[level] ?? level}`}
      title={DIFFICULTY_LABEL[level] ?? `Level ${level}`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn('h-1.5 w-1.5 rounded-full', i < level ? 'bg-primary' : 'bg-muted')}
        />
      ))}
    </span>
  )
}
