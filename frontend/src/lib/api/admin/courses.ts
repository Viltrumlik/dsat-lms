// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Courses API
// Domain: Courses (admin authoring)
// Description: Course CRUD + publish lifecycle. Unit/lesson/reorder/attachment
//   builder ops are added in slice 5.4b. IsAdmin.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type {
  AdminCourse,
  AdminCourseAssignment,
  AdminCourseListItem,
  AdminCourseUnit,
  AdminLessonAttachment,
  AdminLessonDetail,
  CourseProgressRow,
  CourseSubject,
} from '@/types'

export interface CourseListParams {
  status?: string
  subject?: string
  search?: string
  cursor?: string
}

export interface CourseWritePayload {
  title: string
  description?: string
  subject?: CourseSubject
  coverImageUrl?: string | null
}

export type CoursePublishAction = 'publish' | 'unpublish' | 'archive'

export interface LessonWritePayload {
  title: string
  contentMd?: string
  videoUrl?: string | null
  linkedExam?: string | null
  linkedHomework?: string | null
}

export const adminCoursesAPI = {
  list: (params?: CourseListParams) =>
    getPaginated<AdminCourseListItem>('/admin/courses/', params),
  get: (id: string) => get<AdminCourse>(`/admin/courses/${id}/`),
  create: (payload: CourseWritePayload) => post<AdminCourse>('/admin/courses/', payload),
  update: (id: string, payload: Partial<CourseWritePayload>) =>
    patch<AdminCourse>(`/admin/courses/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/courses/${id}/`),
  publish: (id: string, action: CoursePublishAction) =>
    post<AdminCourse>(`/admin/courses/${id}/publish/`, { action }),

  // Units
  createUnit: (courseId: string, title: string) =>
    post<AdminCourseUnit>(`/admin/courses/${courseId}/units/`, { title }),
  updateUnit: (courseId: string, unitId: string, title: string) =>
    patch<AdminCourseUnit>(`/admin/courses/${courseId}/units/${unitId}/`, { title }),
  removeUnit: (courseId: string, unitId: string) =>
    del<void>(`/admin/courses/${courseId}/units/${unitId}/`),
  reorderUnits: (courseId: string, order: string[]) =>
    post<AdminCourse>(`/admin/courses/${courseId}/units/reorder/`, { order }),

  // Lessons
  getLesson: (lessonId: string) => get<AdminLessonDetail>(`/admin/lessons/${lessonId}/`),
  createLesson: (courseId: string, unitId: string, payload: LessonWritePayload) =>
    post<AdminLessonDetail>(`/admin/courses/${courseId}/units/${unitId}/lessons/`, payload),
  updateLesson: (lessonId: string, payload: Partial<LessonWritePayload>) =>
    patch<AdminLessonDetail>(`/admin/lessons/${lessonId}/`, payload),
  removeLesson: (lessonId: string) => del<void>(`/admin/lessons/${lessonId}/`),
  reorderLessons: (courseId: string, unitId: string, order: string[]) =>
    post<AdminCourseUnit>(`/admin/courses/${courseId}/units/${unitId}/lessons/reorder/`, { order }),

  // Lesson attachments
  addLessonAttachment: (lessonId: string, attachment: string, caption = '') =>
    post<AdminLessonAttachment>(`/admin/lessons/${lessonId}/attachments/`, { attachment, caption }),
  removeLessonAttachment: (lessonId: string, attId: string) =>
    del<void>(`/admin/lessons/${lessonId}/attachments/${attId}/`),

  // Assignments
  assignments: (courseId: string) =>
    getPaginated<AdminCourseAssignment>('/admin/course-assignments/', { course: courseId }),
  createAssignment: (payload: CourseAssignmentWritePayload) =>
    post<AdminCourseAssignment>('/admin/course-assignments/', payload),
  removeAssignment: (id: string) => del<void>(`/admin/course-assignments/${id}/`),
  assignmentProgress: (id: string) =>
    get<CourseProgressRow[]>(`/admin/course-assignments/${id}/progress/`),
}

export interface CourseAssignmentWritePayload {
  course: string
  assignedClass?: string | null
  assignedStudent?: string | null
  opensAt?: string | null
  closesAt?: string | null
  note?: string
}
