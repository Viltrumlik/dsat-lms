"""
DSAT LMS v2 — Assessment Serializers
Domain: Assessments
Description: Test-engine serializers. Question shapes here are TEST MODE — they
            never include correct_answer or explanation. Inputs for start /
            auto-save / answer, and the read shapes for session + result.
"""

from rest_framework import serializers

from apps.question_bank.models import Question, QuestionChoice

from .models import ExamResponse, ExamResult, ExamSection, ExamSession, ExamTemplate
from .services import server_time_remaining


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
        fields = ["id", "title", "type", "module", "time_limit", "is_adaptive"]


class ResponseSerializer(serializers.ModelSerializer):
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
    exam = ExamMiniSerializer(read_only=True)
    sections = serializers.SerializerMethodField()
    responses = ResponseSerializer(many=True, read_only=True)
    server_time_remaining = serializers.SerializerMethodField()

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
            "started_at",
            "submitted_at",
            "client_session_data",
            "sections",
            "responses",
        ]

    def get_sections(self, obj):
        sections = obj.exam.sections.prefetch_related("exam_questions__question__choices")
        return SessionSectionSerializer(sections, many=True).data

    def get_server_time_remaining(self, obj):
        return server_time_remaining(obj)


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
    current_section = serializers.IntegerField(required=False, min_value=1)
    current_question = serializers.IntegerField(required=False, min_value=1)
    time_remaining = serializers.IntegerField(required=False, min_value=0)
    client_session_data = serializers.JSONField(required=False)


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
