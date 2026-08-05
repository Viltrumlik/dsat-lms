"""
DSAT LMS v2 — Assessment Serializers
Domain: Assessments
Description: Test-engine serializers. Question shapes here are TEST MODE — they
            never include correct_answer or explanation. Inputs for start /
            auto-save / answer, and the read shapes for session + result.
"""

import json

from rest_framework import serializers

from apps.question_bank.models import Question, QuestionChoice

from .models import ExamResponse, ExamResult, ExamSection, ExamSession, ExamTemplate
from .services import (
    MAX_CLIENT_SESSION_BYTES,
    exam_time_remaining,
    section_time_remaining,
    server_time_remaining,
)


class TestChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionChoice
        fields = ["label", "text", "image_url", "sort_order"]


class TestQuestionSerializer(serializers.ModelSerializer):
    """Question as the test-taker sees it — NO correct_answer, NO explanation."""

    choices = TestChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = [
            "id",
            "module",
            "stem",
            "stem_image_url",
            "passage",
            "passage_image_url",
            "answer_type",
            "has_math",
            "choices",
        ]


class SessionSectionSerializer(serializers.ModelSerializer):
    questions = serializers.SerializerMethodField()

    class Meta:
        model = ExamSection
        fields = ["section_number", "title", "module", "time_limit", "questions"]

    def get_questions(self, obj):
        exam_questions = obj.exam_questions.select_related("question").prefetch_related(
            "question__choices"
        )
        return [
            {"position": eq.position, "question": TestQuestionSerializer(eq.question).data}
            for eq in exam_questions
        ]


class ExamMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamTemplate
        fields = ["id", "title", "type", "module", "time_limit", "is_adaptive", "allow_pause"]


class ExamListSerializer(serializers.ModelSerializer):
    """Available exam templates for the dashboard ('start a test' cards).

    section_count / question_count are annotated by the view.
    """

    section_count = serializers.IntegerField(read_only=True)
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ExamTemplate
        fields = [
            "id",
            "type",
            "title",
            "description",
            "module",
            "time_limit",
            "is_adaptive",
            "access_level",
            "section_count",
            "question_count",
            "created_at",
        ]


class TestResponseSerializer(serializers.ModelSerializer):
    """A saved answer as the test-taker may see it — WITHOUT is_correct.

    Echoing correctness back while the paper is open would turn the answer
    endpoint into an oracle: submit A, read the verdict, change to B. It happens
    to be null until grading today, which is exactly the kind of accident that
    stops being true after someone adds live scoring. The field is not in the
    shape at all, so it cannot leak by accident.
    """

    class Meta:
        model = ExamResponse
        fields = ["question", "chosen_answer", "time_spent", "answered_at"]


class ResponseSerializer(serializers.ModelSerializer):
    """Graded shape — only ever served for a session that has been submitted."""

    class Meta:
        model = ExamResponse
        fields = ["question", "chosen_answer", "is_correct", "time_spent", "answered_at"]


class SessionListItemSerializer(serializers.ModelSerializer):
    """Lightweight session shape for the history list."""

    exam = ExamMiniSerializer(read_only=True)

    class Meta:
        model = ExamSession
        fields = ["id", "exam", "status", "started_at", "submitted_at", "created_at"]


class SessionDetailSerializer(serializers.ModelSerializer):
    """The running paper.

    Both clocks are published because they mean different things to the runner:
    section_time_remaining drives the module countdown, exam_time_remaining is
    the hard stop. server_time_remaining is the tighter of the two — the one the
    server actually enforces — and is what the client should display.
    """

    exam = ExamMiniSerializer(read_only=True)
    sections = serializers.SerializerMethodField()
    responses = serializers.SerializerMethodField()
    server_time_remaining = serializers.SerializerMethodField()
    section_time_remaining = serializers.SerializerMethodField()
    exam_time_remaining = serializers.SerializerMethodField()

    class Meta:
        model = ExamSession
        fields = [
            "id",
            "exam",
            "status",
            "current_section",
            "current_question",
            "time_remaining",
            "server_time_remaining",
            "section_time_remaining",
            "exam_time_remaining",
            "started_at",
            "submitted_at",
            "client_session_data",
            "sections",
            "responses",
        ]

    def get_sections(self, obj):
        sections = obj.exam.sections.prefetch_related("exam_questions__question__choices")
        return SessionSectionSerializer(sections, many=True).data

    def get_responses(self, obj):
        """Correctness is withheld until the paper is in — see TestResponseSerializer."""
        graded = obj.status == ExamSession.Status.COMPLETED
        shape = ResponseSerializer if graded else TestResponseSerializer
        return shape(obj.responses.all(), many=True).data

    def get_server_time_remaining(self, obj):
        return server_time_remaining(obj)

    def get_section_time_remaining(self, obj):
        return section_time_remaining(obj)

    def get_exam_time_remaining(self, obj):
        return exam_time_remaining(obj)


class StartSessionSerializer(serializers.Serializer):
    exam = serializers.UUIDField()

    def validate_exam(self, value):
        try:
            exam = ExamTemplate.objects.get(id=value)
        except ExamTemplate.DoesNotExist:
            raise serializers.ValidationError("Exam not found.") from None
        if not exam.sections.exists():
            raise serializers.ValidationError("This exam has no sections yet.")
        return value


class AutoSaveSerializer(serializers.Serializer):
    """Auto-save input.

    `time_remaining` is deliberately absent. It used to be accepted and merely
    sanity-checked against the server clock, which meant the client was still
    steering a value the server then stored and served back. The clock is now
    computed from server timestamps only and written by the server on every save,
    so there is nothing here for a client to influence.

    `current_section` is accepted but may only ever move FORWARD (the view
    enforces it) — a backward move used to restamp section_started_at and hand
    out a fresh module clock every time.
    """

    current_section = serializers.IntegerField(required=False, min_value=1)
    current_question = serializers.IntegerField(required=False, min_value=1)
    client_session_data = serializers.JSONField(required=False)

    def validate_client_session_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Expected an object.")
        # User-controlled text bound for a JSONB column — cap it.
        if len(json.dumps(value)) > MAX_CLIENT_SESSION_BYTES:
            raise serializers.ValidationError("Session notes and highlights are too large to save.")
        return value


class AnswerSerializer(serializers.Serializer):
    question = serializers.UUIDField()
    chosen_answer = serializers.CharField(
        max_length=10, allow_blank=True, required=False, default=""
    )
    time_spent = serializers.IntegerField(required=False, min_value=0)


class ResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamResult
        fields = [
            "total_score",
            "math_score",
            "rw_score",
            "total_correct",
            "total_incorrect",
            "total_skipped",
            "total_questions",
            "accuracy_pct",
            "time_spent_secs",
            "percentile",
            "score_breakdown",
            "computed_at",
        ]


class ReviewQuestionSerializer(serializers.Serializer):
    """One row of the post-submission answer review.

    The review answers exactly one question per row: what was right, what the
    student put, and whether those matched. Nothing else. Explanations are
    deliberately NOT part of this shape — the review is a score check, not a
    lesson, and every extra field here is one more thing that has to stay behind
    the submitted-session gate.

    REVIEW MODE — unlike TestQuestionSerializer this DOES expose the correct
    answer, so it must only ever be served for a session the requester owns and
    has already submitted.

    Question content is read live from the question bank (questions are not
    versioned), so a correction made by an admin shows up here immediately.
    """

    number = serializers.IntegerField()
    section_number = serializers.IntegerField()
    section_title = serializers.CharField()
    question = TestQuestionSerializer()
    correct_answer = serializers.CharField()
    chosen_answer = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=["correct", "incorrect", "skipped"])
