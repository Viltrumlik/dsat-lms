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

from .adaptive import Routing, decided_routing, section_is_routed, served_exam_questions
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
    """One module of the paper.

    Only the module the student is CURRENTLY in carries its questions. The rest
    are shape only — how many, how long, what comes next — which is everything
    the runner needs to number the modules, size the break screen and count the
    paper, and nothing a student could read ahead with.

    That mattered most on a four-module mock: the whole paper used to arrive at
    start, so the ten-minute break was a window in which every remaining
    question was already sitting in the tab. Sections are forward-only, so a
    module is fetched exactly once, when it opens.
    """

    questions = serializers.SerializerMethodField()
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = ExamSection
        fields = [
            "section_number",
            "title",
            "module",
            "time_limit",
            "break_after_minutes",
            "question_count",
            "questions",
        ]

    def _served(self, obj):
        """The ExamQuestions this session gets for this module.

        On a non-adaptive paper that is every row, because every row is
        `standard`. On an adaptive one it is the standard rows plus the form the
        student was routed to — and, for a module they have not reached, the
        standard rows only, since the form has not been chosen yet.
        """
        session = self.context.get("session")
        if session is None or not session.exam.is_adaptive:
            return list(obj.exam_questions.all())
        return served_exam_questions(session, obj, variant=decided_routing(session, obj))

    def get_question_count(self, obj):
        """How many questions this module holds FOR THIS STUDENT.

        The runner numbers the paper and sizes the break screen off this, so a
        routed module the student has NOT reached yet cannot report only its
        standard rows — that is a module which looks nearly empty, or entirely
        so. It reports the size of one form instead: both forms are the same
        length by construction, so either is the honest answer, and the student
        is told the truth about a module before being routed into it.
        """
        session = self.context.get("session")
        undecided_routed = (
            session is not None
            and session.exam.is_adaptive
            and decided_routing(session, obj) is None
            and section_is_routed(obj)
        )
        if undecided_routed:
            counts = {Routing.STANDARD: 0, Routing.LOWER: 0}
            for eq in obj.exam_questions.all():
                if eq.routing in counts:
                    counts[eq.routing] += 1
            return counts[Routing.STANDARD] + counts[Routing.LOWER]
        # len() over the prefetch, not .count() — one query for the whole paper.
        return len(self._served(obj))

    def get_questions(self, obj):
        if obj.section_number != self.context.get("current_section"):
            return []
        return [
            {"position": eq.position, "question": TestQuestionSerializer(eq.question).data}
            for eq in self._served(obj)
        ]


class ExamMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamTemplate
        fields = [
            "id",
            "title",
            "type",
            "module",
            "time_limit",
            "is_adaptive",
            "allow_pause",
            # Invigilated papers are sat in full screen; the runner gates on this.
            "requires_fullscreen",
            # A question-bank drill is a real template, but it is not a paper:
            # the result surface reports it as practice rather than pretending a
            # 19-question set scales to 1600.
            "is_generated",
        ]


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


class InstantFeedbackSerializer(serializers.ModelSerializer):
    """A marked answer, for a session started in instant-feedback mode.

    This DOES tell the student whether they were right and what the key was —
    which on a real paper would be the oracle TestResponseSerializer exists to
    prevent. It is safe here only because the mode is a property of the session,
    fixed at start and never settable by the client (see SessionAnswerView).
    """

    correct_answer = serializers.CharField(source="question.correct_answer", read_only=True)

    class Meta:
        model = ExamResponse
        fields = [
            "question",
            "chosen_answer",
            "is_correct",
            "correct_answer",
            "time_spent",
            "answered_at",
        ]


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
            "feedback_mode",
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
        """Shape for every module, questions for the one being sat."""
        sections = obj.exam.sections.prefetch_related("exam_questions__question__choices")
        return SessionSectionSerializer(
            sections,
            many=True,
            # The session goes in so an adaptive module serves the form THIS
            # student was routed to. Serializing must not itself decide a
            # routing — see adaptive.decided_routing.
            context={"current_section": obj.current_section, "session": obj},
        ).data

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
