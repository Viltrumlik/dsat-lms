"""
DSAT LMS v2 — Automation admin serializers
Domain: Automation
Description: Read/write serializers for AutomationRule + read serializer for
    AutomationLog. Write validation runs the condition tree through conditions.
    clean_tree and the actions through actions.clean_actions — the ONLY place a
    rule's DSL is accepted, so nothing outside the catalog is ever persisted.
"""

from rest_framework import serializers

from .actions import ActionValidationError, clean_actions
from .catalog import ACTIONS, EVENTS, MAX_ACTIONS, SUBJECT_TYPES
from .conditions import RuleValidationError, clean_tree
from .models import AutomationLog, AutomationRule


class _UserMiniSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    full_name = serializers.CharField(source="get_full_name", read_only=True)


class AutomationRuleSerializer(serializers.ModelSerializer):
    created_by = _UserMiniSerializer(read_only=True)
    log_count = serializers.SerializerMethodField()

    class Meta:
        model = AutomationRule
        fields = [
            "id",
            "name",
            "description",
            "enabled",
            "trigger_type",
            "event_key",
            "subject_type",
            "conditions",
            "actions",
            "created_by",
            "last_run_at",
            "log_count",
            "created_at",
            "updated_at",
        ]

    def get_log_count(self, obj):
        # Annotated on the list queryset; falls back to a count for detail reads.
        annotated = getattr(obj, "log_count_annotated", None)
        return annotated if annotated is not None else obj.logs.count()


class AutomationRuleWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationRule
        fields = [
            "name",
            "description",
            "enabled",
            "trigger_type",
            "event_key",
            "subject_type",
            "conditions",
            "actions",
        ]

    def validate_subject_type(self, value):
        if value and value not in SUBJECT_TYPES:
            raise serializers.ValidationError(f"Unknown subject type: {value!r}.")
        return value or "student"

    def validate_conditions(self, value):
        try:
            return clean_tree(value)
        except RuleValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_actions(self, value):
        try:
            cleaned = clean_actions(value)
        except ActionValidationError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if len(cleaned) > MAX_ACTIONS:
            raise serializers.ValidationError(f"At most {MAX_ACTIONS} actions per rule.")
        return cleaned

    def validate(self, attrs):
        trigger = attrs.get("trigger_type", getattr(self.instance, "trigger_type", None))
        event_key = attrs.get("event_key", getattr(self.instance, "event_key", ""))
        if trigger == AutomationRule.Trigger.EVENT:
            if event_key not in EVENTS:
                raise serializers.ValidationError(
                    {"event_key": f"Unknown event key: {event_key!r}."}
                )
            # An event pins the subject type from its catalog entry.
            attrs["subject_type"] = EVENTS[event_key]["subject_type"]
        elif trigger == AutomationRule.Trigger.SCHEDULED_DAILY:
            attrs["event_key"] = ""
        else:
            raise serializers.ValidationError({"trigger_type": f"Unknown trigger: {trigger!r}."})
        return attrs


class AutomationLogSerializer(serializers.ModelSerializer):
    rule_id = serializers.UUIDField(source="rule.id", read_only=True)
    rule_name = serializers.CharField(source="rule.name", read_only=True)

    class Meta:
        model = AutomationLog
        fields = [
            "id",
            "rule_id",
            "rule_name",
            "subject_type",
            "subject_id",
            "subject_label",
            "run_date",
            "matched",
            "actions_taken",
            "status",
            "error",
            "created_at",
        ]


# Sanity: keep the action-type list the API advertises aligned with the executors.
assert set(ACTIONS).issuperset({"notify", "add_tag", "change_status"})
