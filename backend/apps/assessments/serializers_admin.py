# apps/assessments/serializers_admin.py
# Domain: Assessments
# Description: Admin exam-builder serializers — exam template CRUD, nested sections +
#             section questions (assembled from the published bank), and exam
#             assignments (to a class or a student) + progress. Admin-only.
# Permissions: consumed only by IsAdmin views (see views_admin.py).

from rest_framework import serializers

from apps.academy.models import Class
from apps.identity.models import User
from apps.question_bank.models import Question

from .adaptive import Routing
from .models import ExamAssignment, ExamQuestion, ExamSection, ExamSession, ExamTemplate
from .serializers import ExamMiniSerializer


class AuthorMiniSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "full_name", "email"]


# ─────────────────────────────────────
# Exams + sections + section questions
# ─────────────────────────────────────


class ExamQuestionRefSerializer(serializers.ModelSerializer):
    """Compact question shape shown inside a section in the builder."""

    class Meta:
        model = Question
        fields = ["id", "stem", "module", "difficulty", "answer_type", "status"]


class SectionQuestionSerializer(serializers.ModelSerializer):
    question = ExamQuestionRefSerializer(read_only=True)

    class Meta:
        model = ExamQuestion
        fields = ["id", "position", "question", "routing"]


class AdminSectionSerializer(serializers.ModelSerializer):
    questions = SectionQuestionSerializer(source="exam_questions", many=True, read_only=True)

    class Meta:
        model = ExamSection
        fields = [
            "id",
            "section_number",
            "title",
            "module",
            "time_limit",
            "sort_order",
            "questions",
        ]


class AdminSectionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamSection
        fields = ["title", "module", "section_number", "time_limit", "sort_order"]
        extra_kwargs = {
            "title": {"required": False},
            "section_number": {"required": False},
            "sort_order": {"required": False},
            "time_limit": {"required": False},
        }


class AdminExamDetailSerializer(serializers.ModelSerializer):
    sections = AdminSectionSerializer(many=True, read_only=True)
    created_by = AuthorMiniSerializer(read_only=True)

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
            "allow_pause",
            "access_level",
            "sections",
            "created_by",
            "created_at",
            "updated_at",
        ]


class AdminExamWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamTemplate
        fields = [
            "type",
            "title",
            "description",
            "module",
            "time_limit",
            "is_adaptive",
            "allow_pause",
            "access_level",
        ]

    def create(self, validated_data):
        return ExamTemplate.objects.create(
            created_by=self.context["request"].user, **validated_data
        )


class AddSectionQuestionSerializer(serializers.Serializer):
    question = serializers.UUIDField()
    # Which form of an adaptive module this question belongs to (see
    # apps/assessments/adaptive.py). Defaults to `standard`, which is what every
    # question on a non-adaptive paper is.
    routing = serializers.ChoiceField(choices=Routing.choices, default=Routing.STANDARD)

    def validate_routing(self, value):
        """A variant only means something on a paper that routes.

        Refused rather than ignored: a silently-dropped `upper` would leave the
        author looking at a module holding both forms at once, with no
        indication of why.
        """
        exam = self.context.get("exam")
        if value != Routing.STANDARD and exam is not None and not exam.is_adaptive:
            raise serializers.ValidationError(
                "This exam is not adaptive. Turn on `is_adaptive` before adding "
                "lower/upper form questions."
            )
        return value


class ReorderSerializer(serializers.Serializer):
    """New order of exam_question ids for a section (a full permutation)."""

    order = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


# ─────────────────────────────────────
# Assignments
# ─────────────────────────────────────


class AdminAssignmentSerializer(serializers.ModelSerializer):
    exam = ExamMiniSerializer(read_only=True)
    assigned_by = AuthorMiniSerializer(read_only=True)
    assigned_student = AuthorMiniSerializer(read_only=True)
    assigned_class = serializers.SerializerMethodField()

    class Meta:
        model = ExamAssignment
        fields = [
            "id",
            "exam",
            "assigned_by",
            "assigned_class",
            "assigned_student",
            "opens_at",
            "closes_at",
            "max_attempts",
            "instructions",
            "created_at",
        ]

    def get_assigned_class(self, obj):
        if obj.assigned_class_id:
            return {"id": str(obj.assigned_class_id), "name": obj.assigned_class.name}
        return None


class AdminAssignmentWriteSerializer(serializers.ModelSerializer):
    exam = serializers.PrimaryKeyRelatedField(queryset=ExamTemplate.objects.all())
    assigned_class = serializers.PrimaryKeyRelatedField(
        queryset=Class.objects.all(), required=False, allow_null=True
    )
    assigned_student = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(), required=False, allow_null=True
    )
    max_attempts = serializers.IntegerField(min_value=1, required=False, default=1)

    class Meta:
        model = ExamAssignment
        fields = [
            "exam",
            "assigned_class",
            "assigned_student",
            "opens_at",
            "closes_at",
            "max_attempts",
            "instructions",
        ]

    def validate(self, attrs):
        klass = attrs.get("assigned_class", getattr(self.instance, "assigned_class", None))
        student = attrs.get("assigned_student", getattr(self.instance, "assigned_student", None))
        if bool(klass) == bool(student):
            raise serializers.ValidationError("Assign to exactly one of a class or a student.")
        opens = attrs.get("opens_at", getattr(self.instance, "opens_at", None))
        closes = attrs.get("closes_at", getattr(self.instance, "closes_at", None))
        if opens and closes and closes <= opens:
            raise serializers.ValidationError({"closes_at": "Must be after it opens."})
        return attrs

    def create(self, validated_data):
        return ExamAssignment.objects.create(
            assigned_by=self.context["request"].user, **validated_data
        )


class AssignmentSessionSerializer(serializers.ModelSerializer):
    """A student's session under an assignment (progress row)."""

    student = AuthorMiniSerializer(source="user", read_only=True)
    total_score = serializers.SerializerMethodField()
    accuracy_pct = serializers.SerializerMethodField()

    class Meta:
        model = ExamSession
        fields = [
            "id",
            "student",
            "status",
            "started_at",
            "submitted_at",
            "total_score",
            "accuracy_pct",
        ]

    def get_total_score(self, obj):
        result = getattr(obj, "result", None)
        return result.total_score if result else None

    def get_accuracy_pct(self, obj):
        result = getattr(obj, "result", None)
        return result.accuracy_pct if result else None
