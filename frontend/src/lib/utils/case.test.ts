import { describe, it, expect } from 'vitest'
import { camelizeKeys, decamelizeKeys, snakeToCamel, camelToSnake } from './case'

describe('key transforms', () => {
  it('converts single keys both directions', () => {
    expect(snakeToCamel('current_section')).toBe('currentSection')
    expect(snakeToCamel('server_time_remaining')).toBe('serverTimeRemaining')
    expect(camelToSnake('currentSection')).toBe('current_section')
    expect(camelToSnake('serverTimeRemaining')).toBe('server_time_remaining')
  })

  it('camelizes a nested response payload', () => {
    const wire = {
      access_token: 'abc',
      user: { first_name: 'Ada', is_email_verified: true, sat_target_score: 1500 },
    }
    expect(camelizeKeys(wire)).toEqual({
      accessToken: 'abc',
      user: { firstName: 'Ada', isEmailVerified: true, satTargetScore: 1500 },
    })
  })

  it('camelizes arrays of objects (session sections)', () => {
    const wire = {
      sections: [
        {
          section_number: 1,
          time_limit: 15,
          questions: [{ position: 1, question: { answer_type: 'mcq', has_math: true } }],
        },
      ],
    }
    expect(camelizeKeys(wire)).toEqual({
      sections: [
        {
          sectionNumber: 1,
          timeLimit: 15,
          questions: [{ position: 1, question: { answerType: 'mcq', hasMath: true } }],
        },
      ],
    })
  })

  it('decamelizes a request body (autosave)', () => {
    const body = {
      currentSection: 2,
      currentQuestion: 3,
      timeRemaining: 840,
      clientSessionData: { questions: {} },
    }
    expect(decamelizeKeys(body)).toEqual({
      current_section: 2,
      current_question: 3,
      time_remaining: 840,
      client_session_data: { questions: {} },
    })
  })

  it('round-trips client_session_data with UUID map keys preserved', () => {
    const uuid = 'a1b2c3d4-1111-2222-3333-444455556666'
    const original = {
      clientSessionData: {
        questions: {
          [uuid]: { answer: 'B', flagged: true, crossedOut: ['A', 'C'], highlight: null },
        },
      },
    }
    const wire = decamelizeKeys(original)
    // UUID key untouched; inner state keys decamelized
    expect(Object.keys((wire as any).client_session_data.questions)).toEqual([uuid])
    expect((wire as any).client_session_data.questions[uuid]).toEqual({
      answer: 'B',
      flagged: true,
      crossed_out: ['A', 'C'],
      highlight: null,
    })
    // symmetric round-trip
    expect(camelizeKeys(wire)).toEqual(original)
  })

  it('leaves primitives and null untouched', () => {
    expect(camelizeKeys(null)).toBeNull()
    expect(camelizeKeys(42)).toBe(42)
    expect(decamelizeKeys('plain')).toBe('plain')
  })
})
