// Domain: Test Engine
// Description: Renders question content — markdown + KaTeX math ($…$ / $$…$$).
'use client'

import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cn } from '@/lib/utils/cn'

export function MarkdownMath({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose-question text-foreground', className)}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
