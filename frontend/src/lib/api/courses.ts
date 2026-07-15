// ═══════════════════════════════════════
// DSAT LMS v2 — Student Courses API
// Domain: Courses (student player)
// Description: An enrolled student's assigned/published courses + lesson progress.
// ═══════════════════════════════════════

import { get, post } from './client'
import type { StudentCourse, StudentCourseListItem, StudentLessonProgressStatus } from '@/types'

export const coursesAPI = {
  list: () => get<StudentCourseListItem[]>('/courses/'),
  get: (id: string) => get<StudentCourse>(`/courses/${id}/`),
  markProgress: (lessonId: string, status: StudentLessonProgressStatus) =>
    post<{ lesson: string; status: StudentLessonProgressStatus }>(
      `/courses/lessons/${lessonId}/progress/`,
      { status }
    ),
}
