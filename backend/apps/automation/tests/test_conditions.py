"""
DSAT LMS v2 — Automation condition DSL tests (5.6b)
Domain: Automation
Covers: validation rejects anything outside the catalog (unknown field/op, bad
        type, depth/breadth bounds, malformed nodes, injection-shaped keys) and
        evaluation is correct (and/or/leaf, None handling, in, enum). No DB.
"""

import pytest

from apps.automation.catalog import MAX_CHILDREN, MAX_DEPTH
from apps.automation.conditions import RuleValidationError, clean_tree, evaluate


def leaf(field, op, value):
    return {"type": "condition", "field": field, "op": op, "value": value}


def group(op, *children):
    return {"type": "group", "op": op, "children": list(children)}


class TestValidation:
    def test_happy_tree(self):
        tree = group("and", leaf("homework_completion", "lt", 50), leaf("risk_level", "eq", "red"))
        cleaned = clean_tree(tree)
        assert cleaned["type"] == "group" and len(cleaned["children"]) == 2

    def test_root_must_be_group(self):
        with pytest.raises(RuleValidationError):
            clean_tree(leaf("homework_completion", "lt", 50))

    def test_unknown_field_rejected(self):
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("__import__", "eq", 1)))

    def test_unknown_op_rejected(self):
        # 'contains' is not allowed for a number field.
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("homework_completion", "contains", 5)))

    def test_number_field_rejects_string_value(self):
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("homework_completion", "lt", "50")))

    def test_number_field_rejects_bool_value(self):
        # bool is an int subclass — must not pass as a number.
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("homework_completion", "eq", True)))

    def test_enum_field_rejects_unknown_choice(self):
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("risk_level", "eq", "purple")))

    def test_in_requires_nonempty_list(self):
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("risk_level", "in", "red")))
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", leaf("risk_level", "in", [])))

    def test_unexpected_keys_rejected(self):
        bad = {"type": "condition", "field": "risk_level", "op": "eq", "value": "red", "x": 1}
        with pytest.raises(RuleValidationError):
            clean_tree(group("and", bad))

    def test_depth_bound(self):
        # Nest groups past MAX_DEPTH.
        node = leaf("risk_level", "eq", "red")
        for _ in range(MAX_DEPTH + 2):
            node = group("and", node)
        with pytest.raises(RuleValidationError):
            clean_tree(node)

    def test_breadth_bound(self):
        kids = [leaf("risk_level", "eq", "red") for _ in range(MAX_CHILDREN + 1)]
        with pytest.raises(RuleValidationError):
            clean_tree(group("or", *kids))


class TestEvaluation:
    def test_and(self):
        tree = clean_tree(
            group("and", leaf("homework_completion", "lt", 50), leaf("risk_level", "eq", "red"))
        )
        # homework_completion resolves only when has_homework is set.
        hw = {"completion_pct": 30, "has_homework": True}
        assert evaluate(tree, {"signals": hw, "risk_level": "red"}) is True
        assert evaluate(tree, {"signals": hw, "risk_level": "green"}) is False

    def test_or(self):
        tree = clean_tree(
            group("or", leaf("homework_completion", "lt", 50), leaf("risk_level", "eq", "red"))
        )
        hw = {"completion_pct": 90, "has_homework": True}
        assert evaluate(tree, {"signals": hw, "risk_level": "red"}) is True
        assert evaluate(tree, {"signals": hw, "risk_level": "green"}) is False

    def test_homework_completion_needs_has_homework(self):
        # A student with no assigned homework must not match a completion threshold.
        tree = clean_tree(group("and", leaf("homework_completion", "lt", 50)))
        assert evaluate(tree, {"signals": {"completion_pct": 0.0, "has_homework": False}}) is False
        assert evaluate(tree, {"signals": {"completion_pct": 30, "has_homework": True}}) is True

    def test_empty_group_matches(self):
        # AND of nothing = True → an empty rule targets everyone.
        assert evaluate(clean_tree(group("and")), {"signals": {}}) is True

    def test_none_signal_never_matches_ordered(self):
        # A student with no accuracy data must not match 'accuracy < 60'.
        tree = clean_tree(group("and", leaf("overall_accuracy", "lt", 60)))
        assert evaluate(tree, {"signals": {"has_accuracy": False}}) is False

    def test_none_signal_matches_ne(self):
        tree = clean_tree(group("and", leaf("risk_level", "ne", "red")))
        assert evaluate(tree, {"signals": {}, "risk_level": None}) is True

    def test_in_enum(self):
        tree = clean_tree(group("and", leaf("lifecycle_status", "in", ["frozen", "dropped"])))
        assert evaluate(tree, {"signals": {}, "lifecycle_status": "frozen"}) is True
        assert evaluate(tree, {"signals": {}, "lifecycle_status": "active"}) is False
