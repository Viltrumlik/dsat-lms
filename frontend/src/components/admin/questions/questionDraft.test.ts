// Domain: Admin (content studio)
// Description: The draft's payload building and the publish checklist — the two
//   pure pieces the authoring panel leans on.

import { describe, it, expect } from 'vitest'
import { EMPTY_DRAFT, draftFromQuestion, payloadFromDraft } from './useQuestionDraft'
import { readinessItems, isPublishable } from './QuestionReadiness'
import type { AdminQuestion } from '@/types'
import type { ChoiceDraftMap } from './ChoicesEditor'

const choices = (partial: Partial<Record<'A' | 'B' | 'C' | 'D', string>>): ChoiceDraftMap => ({
  A: { text: partial.A ?? '', imageUrl: '' },
  B: { text: partial.B ?? '', imageUrl: '' },
  C: { text: partial.C ?? '', imageUrl: '' },
  D: { text: partial.D ?? '', imageUrl: '' },
})

describe('payloadFromDraft', () => {
  it('sends only the choices that have text, numbered in order', () => {
    const payload = payloadFromDraft({
      ...EMPTY_DRAFT,
      stem: 'Q',
      categoryId: 'c1',
      correctAnswer: 'A',
      choices: choices({ A: 'alpha', B: 'beta', D: 'delta' }),
    })
    expect(payload.choices).toEqual([
      { label: 'A', text: 'alpha', imageUrl: null, sortOrder: 0 },
      { label: 'B', text: 'beta', imageUrl: null, sortOrder: 1 },
      { label: 'D', text: 'delta', imageUrl: null, sortOrder: 2 },
    ])
  })

  it('omits choices entirely for a grid-in question', () => {
    const payload = payloadFromDraft({
      ...EMPTY_DRAFT,
      answerType: 'grid_in',
      stem: 'Q',
      categoryId: 'c1',
      correctAnswer: '36',
      choices: choices({ A: 'stale' }),
    })
    expect(payload.choices).toBeUndefined()
    expect(payload.correctAnswer).toBe('36')
  })

  it('normalises blank optional fields to null rather than empty strings', () => {
    const payload = payloadFromDraft({ ...EMPTY_DRAFT, stem: 'Q', categoryId: 'c1' })
    expect(payload.passage).toBeNull()
    expect(payload.explanation).toBeNull()
    expect(payload.stemImageUrl).toBeNull()
    expect(payload.passageImageUrl).toBeNull()
    expect(payload.explanationImageUrl).toBeNull()
    expect(payload.sourceRef).toBeNull()
  })

  it('carries image URLs through, trimmed', () => {
    const payload = payloadFromDraft({
      ...EMPTY_DRAFT,
      stem: 'Q',
      categoryId: 'c1',
      correctAnswer: 'A',
      stemImageUrl: '  https://cdn/fig.png  ',
      choices: choices({ A: 'alpha', B: 'beta' }),
    })
    expect(payload.stemImageUrl).toBe('https://cdn/fig.png')
  })
})

describe('draftFromQuestion', () => {
  it('maps a fetched question onto the draft, filling absent choices', () => {
    const question = {
      id: 'q1',
      module: 'reading_writing',
      category: { id: 'c9', name: 'Craft', slug: 'craft' },
      difficulty: 4,
      status: 'published',
      answerType: 'mcq',
      hasMath: false,
      stem: 'Which choice…',
      stemImageUrl: null,
      passage: 'A passage.',
      passageImageUrl: null,
      choices: [
        { label: 'A', text: 'alpha', imageUrl: 'https://cdn/a.png', sortOrder: 0 },
        { label: 'B', text: 'beta', imageUrl: null, sortOrder: 1 },
      ],
      correctAnswer: 'B',
      explanation: null,
      explanationImageUrl: null,
      source: 'official',
      sourceRef: 'PT4 Q1',
      tags: [{ id: 't1', name: 'inference', slug: 'inference' }],
      createdBy: { id: 'u1', fullName: 'A', email: 'a@x' },
      reviewedBy: null,
      publishedAt: null,
      createdAt: '',
      updatedAt: '',
    } as unknown as AdminQuestion

    const draft = draftFromQuestion(question)
    expect(draft.module).toBe('reading_writing')
    expect(draft.categoryId).toBe('c9')
    expect(draft.correctAnswer).toBe('B')
    expect(draft.choices.A).toEqual({ text: 'alpha', imageUrl: 'https://cdn/a.png' })
    expect(draft.choices.C).toEqual({ text: '', imageUrl: '' })
    expect(draft.tagIds).toEqual(['t1'])
    expect(draft.sourceRef).toBe('PT4 Q1')
  })
})

describe('readiness checklist', () => {
  const base = {
    answerType: 'mcq' as const,
    stem: 'Q',
    categoryId: 'c1',
    correctAnswer: 'A',
    choices: choices({ A: 'alpha', B: 'beta' }),
    explanation: '',
  }

  it('passes when every blocking item is satisfied', () => {
    const items = readinessItems(base)
    expect(isPublishable(items)).toBe(true)
    // The explanation is advisory, so it can be outstanding.
    expect(items.find((i) => i.id === 'explanation')).toMatchObject({ done: false, optional: true })
  })

  it('blocks when the key points at a choice with no text', () => {
    const items = readinessItems({ ...base, correctAnswer: 'C' })
    expect(items.find((i) => i.id === 'key')?.done).toBe(false)
    expect(isPublishable(items)).toBe(false)
  })

  it('blocks on fewer than two choices', () => {
    const items = readinessItems({ ...base, choices: choices({ A: 'alpha' }) })
    expect(items.find((i) => i.id === 'choices')?.done).toBe(false)
    expect(isPublishable(items)).toBe(false)
  })

  it('blocks on a missing stem or category', () => {
    expect(isPublishable(readinessItems({ ...base, stem: '   ' }))).toBe(false)
    expect(isPublishable(readinessItems({ ...base, categoryId: '' }))).toBe(false)
  })

  it('asks a grid-in only for a typed answer, not for choices', () => {
    const items = readinessItems({
      ...base,
      answerType: 'grid_in',
      correctAnswer: '36',
      choices: choices({}),
    })
    expect(items.some((i) => i.id === 'choices')).toBe(false)
    expect(isPublishable(items)).toBe(true)
  })
})
