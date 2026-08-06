# apps/assessments/views_admin.py
# Domain: Assessments
# Description: Admin exam builder — exam templates (CRUD), sections, section questions
#             (add / reorder / remove, assembled from the published bank), and exam
#             assignments (to a class or student) + student-progress view.
#             Mounted at /api/v1/admin/.
# Permissions: IsAdmin on every endpoint.

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Max, Q
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView

from apps.question_bank.models import Question
from common.exceptions import ValidationError
from common.pagination import CursorPagination
from common.permissions import IsAdmin
from common.responses import created_response, no_content_response, success_response

from .models import ExamAssignment, ExamQuestion, ExamSection, ExamTemplate
from .serializers import ExamListSerializer
from .serializers_admin import (
    AddSectionQuestionSerializer,
    AdminAssignmentSerializer,
    AdminAssignmentWriteSerializer,
    AdminExamDetailSerializer,
    AdminExamWriteSerializer,
    AdminSectionSerializer,
    AdminSectionWriteSerializer,
    AssignmentSessionSerializer,
    ReorderSerializer,
    SectionQuestionSerializer,
)


def _get_exam(pk):
    exam = (
        ExamTemplate.objects.select_related("created_by")
        .prefetch_related("sections__exam_questions__question")
        .filter(pk=pk)
        .first()
    )
    if exam is None:
        raise NotFound("Exam not found.")
    return exam


def _get_section(exam, section_id):
    section = exam.sections.filter(pk=section_id).first()
    if section is None:
        raise NotFound("Section not found.")
    return section


def _get_assignment(pk):
    assignment = (
        ExamAssignment.objects.select_related(
            "exam", "assigned_by", "assigned_class", "assigned_student"
        )
        .filter(pk=pk)
        .first()
    )
    if assignment is None:
        raise NotFound("Assignment not found.")
    return assignment


# ─────────────────────────────────────
# Exams
# ─────────────────────────────────────


class AdminExamListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = ExamTemplate.objects.annotate(
            section_count=Count("sections", distinct=True),
            question_count=Count("sections__exam_questions", distinct=True),
        )
        for param in ("type", "module", "access_level"):
            value = (request.query_params.get(param) or "").strip()
            if value:
                qs = qs.filter(**{param: value})
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

        qs = qs.order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(ExamListSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminExamWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        exam = serializer.save()
        return created_response(AdminExamDetailSerializer(exam).data)


class AdminExamDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AdminExamDetailSerializer(_get_exam(pk)).data)

    def patch(self, request, pk):
        exam = _get_exam(pk)
        serializer = AdminExamWriteSerializer(
            exam, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminExamDetailSerializer(_get_exam(pk)).data)

    def delete(self, request, pk):
        _get_exam(pk).soft_delete()
        return no_content_response()


# ─────────────────────────────────────
# Sections
# ─────────────────────────────────────


class AdminSectionListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, exam_id):
        exam = _get_exam(exam_id)
        return success_response(AdminSectionSerializer(exam.sections.all(), many=True).data)

    def post(self, request, exam_id):
        exam = _get_exam(exam_id)
        serializer = AdminSectionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get("section_number") is None:
            data["section_number"] = (
                exam.sections.aggregate(m=Max("section_number"))["m"] or 0
            ) + 1
        if data.get("sort_order") is None:
            data["sort_order"] = data["section_number"]
        try:
            with transaction.atomic():
                section = ExamSection.objects.create(exam=exam, **data)
        except IntegrityError:
            return ValidationError(
                "That section number already exists.", field="section_number"
            ).to_response()
        return created_response(AdminSectionSerializer(section).data)


class AdminSectionDetailView(APIView):
    permission_classes = [IsAdmin]

    def patch(self, request, exam_id, section_id):
        exam = _get_exam(exam_id)
        section = _get_section(exam, section_id)
        serializer = AdminSectionWriteSerializer(section, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            return ValidationError(
                "That section number already exists.", field="section_number"
            ).to_response()
        return success_response(AdminSectionSerializer(section).data)

    def delete(self, request, exam_id, section_id):
        exam = _get_exam(exam_id)
        _get_section(exam, section_id).delete()  # hard delete; cascades exam_questions
        return no_content_response()


# ─────────────────────────────────────
# Section questions
# ─────────────────────────────────────


class AdminSectionQuestionsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, exam_id, section_id):
        exam = _get_exam(exam_id)
        section = _get_section(exam, section_id)
        eqs = section.exam_questions.select_related("question").all()
        return success_response(SectionQuestionSerializer(eqs, many=True).data)

    def post(self, request, exam_id, section_id):
        exam = _get_exam(exam_id)
        section = _get_section(exam, section_id)
        serializer = AddSectionQuestionSerializer(data=request.data, context={"exam": exam})
        serializer.is_valid(raise_exception=True)
        question = Question.objects.filter(pk=serializer.validated_data["question"]).first()
        if question is None:
            return ValidationError("Question not found.", field="question").to_response()
        if question.status != Question.Status.PUBLISHED:
            return ValidationError(
                "Only published questions can be added.", field="question"
            ).to_response()
        if section.exam_questions.filter(question=question).exists():
            return ValidationError(
                "That question is already in this section.", field="question"
            ).to_response()
        next_position = (section.exam_questions.aggregate(m=Max("position"))["m"] or 0) + 1
        exam_question = ExamQuestion.objects.create(
            section=section,
            question=question,
            position=next_position,
            routing=serializer.validated_data["routing"],
        )
        return created_response(SectionQuestionSerializer(exam_question).data)


class AdminSectionReorderView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, exam_id, section_id):
        exam = _get_exam(exam_id)
        section = _get_section(exam, section_id)
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.validated_data["order"]
        existing = list(section.exam_questions.values_list("id", flat=True))
        if sorted(order) != sorted(existing):
            return ValidationError("Order must list exactly the section's questions.").to_response()
        with transaction.atomic():
            # Shift out of the 1..N range first to dodge the (section, position) unique key.
            section.exam_questions.update(position=F("position") + 10000)
            for index, exam_question_id in enumerate(order, start=1):
                ExamQuestion.objects.filter(id=exam_question_id, section=section).update(
                    position=index
                )
        return success_response(AdminSectionSerializer(section).data)


class AdminSectionQuestionDeleteView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, exam_id, section_id, eq_id):
        exam = _get_exam(exam_id)
        section = _get_section(exam, section_id)
        exam_question = section.exam_questions.filter(pk=eq_id).first()
        if exam_question is None:
            raise NotFound("Question not in this section.")
        exam_question.delete()
        return no_content_response()


# ─────────────────────────────────────
# Assignments
# ─────────────────────────────────────


class AdminAssignmentListCreateView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = ExamAssignment.objects.select_related(
            "exam", "assigned_by", "assigned_class", "assigned_student"
        )
        exam = (request.query_params.get("exam") or "").strip()
        if exam:
            qs = qs.filter(exam_id=exam)
        qs = qs.order_by("-created_at")
        paginator = CursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response(AdminAssignmentSerializer(page, many=True).data)

    def post(self, request):
        serializer = AdminAssignmentWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save()
        return created_response(AdminAssignmentSerializer(_get_assignment(assignment.id)).data)


class AdminAssignmentDetailView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        return success_response(AdminAssignmentSerializer(_get_assignment(pk)).data)

    def patch(self, request, pk):
        assignment = _get_assignment(pk)
        serializer = AdminAssignmentWriteSerializer(
            assignment, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response(AdminAssignmentSerializer(_get_assignment(pk)).data)

    def delete(self, request, pk):
        _get_assignment(pk).soft_delete()
        return no_content_response()


class AdminAssignmentSessionsView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, pk):
        assignment = _get_assignment(pk)
        sessions = assignment.sessions.select_related("user", "result").order_by("-created_at")
        return success_response(AssignmentSessionSerializer(sessions, many=True).data)
