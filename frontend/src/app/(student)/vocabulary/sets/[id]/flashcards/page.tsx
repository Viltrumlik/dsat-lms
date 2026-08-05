// Domain: Vocabulary
// Description: The flashcard run over one deck.
'use client'

import { FlashcardRunner } from '@/components/vocabulary/FlashcardRunner'

export default function FlashcardsPage({ params }: { params: { id: string } }) {
  return <FlashcardRunner setId={params.id} />
}
