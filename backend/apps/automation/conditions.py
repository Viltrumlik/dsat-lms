"""
DSAT LMS v2 — Automation condition DSL
Domain: Automation
Description: A STRICT, whitelisted, typed condition tree — the safe alternative to
    eval(). A tree is either a GROUP `{type:"group", op:"and"|"or", children:[...]}`
    or a LEAF `{type:"condition", field, op, value}`. Validation (`clean_tree`)
    rejects anything not in catalog.py, enforces depth/breadth bounds, and
    type-checks every leaf's value. Evaluation (`evaluate`) resolves each field
    against a per-student context and applies the operator with no dynamic code.

Nothing here imports Django models — pure data in, bool out — so it is trivially
unit-testable and cannot touch the database or the interpreter.
"""

from .catalog import FIELDS, MAX_CHILDREN, MAX_DEPTH, TYPE_ENUM, TYPE_NUMBER

GROUP_OPS = ("and", "or")


class RuleValidationError(ValueError):
    """A malformed / disallowed condition tree (the serializer maps this to 400)."""


# ── Validation ────────────────────────────────────────────────────────────────


def _is_number(v):
    # bool is a subclass of int — exclude it so `true`/`false` isn't a "number".
    return isinstance(v, int | float) and not isinstance(v, bool)


def _clean_leaf(node, path):
    extra = set(node) - {"type", "field", "op", "value"}
    if extra:
        raise RuleValidationError(f"{path}: unexpected keys {sorted(extra)}.")
    field = node.get("field")
    spec = FIELDS.get(field)
    if spec is None:
        raise RuleValidationError(f"{path}: unknown field {field!r}.")
    op = node.get("op")
    if op not in spec["ops"]:
        raise RuleValidationError(f"{path}: op {op!r} not allowed for field {field!r}.")
    value = node.get("value")

    if op == "in":
        if not isinstance(value, list) or not value:
            raise RuleValidationError(f"{path}: 'in' needs a non-empty list value.")
        candidates = value
    else:
        candidates = [value]

    if spec["type"] == TYPE_NUMBER:
        for c in candidates:
            if not _is_number(c):
                raise RuleValidationError(f"{path}: value must be a number, got {c!r}.")
    elif spec["type"] == TYPE_ENUM:
        choices = spec.get("choices", [])
        for c in candidates:
            if c not in choices:
                raise RuleValidationError(f"{path}: value {c!r} not in {choices}.")
    return {"type": "condition", "field": field, "op": op, "value": value}


def _clean_group(node, path, depth):
    if depth > MAX_DEPTH:
        raise RuleValidationError(f"{path}: nesting exceeds max depth {MAX_DEPTH}.")
    extra = set(node) - {"type", "op", "children"}
    if extra:
        raise RuleValidationError(f"{path}: unexpected keys {sorted(extra)}.")
    op = node.get("op")
    if op not in GROUP_OPS:
        raise RuleValidationError(f"{path}: group op must be 'and' or 'or', got {op!r}.")
    children = node.get("children")
    if not isinstance(children, list):
        raise RuleValidationError(f"{path}: 'children' must be a list.")
    if len(children) > MAX_CHILDREN:
        raise RuleValidationError(f"{path}: more than {MAX_CHILDREN} children.")
    cleaned = [_clean_node(c, f"{path}.children[{i}]", depth + 1) for i, c in enumerate(children)]
    return {"type": "group", "op": op, "children": cleaned}


def _clean_node(node, path, depth):
    if not isinstance(node, dict):
        raise RuleValidationError(f"{path}: node must be an object.")
    ntype = node.get("type")
    if ntype == "group":
        return _clean_group(node, path, depth)
    if ntype == "condition":
        if depth > MAX_DEPTH:
            raise RuleValidationError(f"{path}: nesting exceeds max depth {MAX_DEPTH}.")
        return _clean_leaf(node, path)
    raise RuleValidationError(f"{path}: node type must be 'group' or 'condition'.")


def clean_tree(tree):
    """Validate + normalize a condition tree. The root MUST be a group (possibly
    empty → matches every subject). Returns the cleaned tree or raises
    RuleValidationError."""
    if not isinstance(tree, dict):
        raise RuleValidationError("Conditions must be a group object.")
    if tree.get("type") != "group":
        raise RuleValidationError("The root of the condition tree must be a group.")
    return _clean_group(tree, "conditions", depth=1)


# ── Evaluation ────────────────────────────────────────────────────────────────


def _apply_op(op, actual, expected):
    """Apply one comparison. A None `actual` (no data for that signal) never
    matches an ordered/eq comparison — a missing signal is not a match."""
    if op == "in":
        return actual in expected
    if actual is None:
        return op == "ne"  # "is not X" is vacuously true when there is no value
    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "gt":
        return actual > expected
    if op == "lt":
        return actual < expected
    if op == "gte":
        return actual >= expected
    if op == "lte":
        return actual <= expected
    if op == "contains":
        return isinstance(actual, str) and str(expected) in actual
    return False


def _eval_leaf(node, ctx):
    spec = FIELDS[node["field"]]  # presence guaranteed by clean_tree
    actual = spec["resolve"](ctx)
    return _apply_op(node["op"], actual, node["value"])


def evaluate(tree, ctx):
    """True iff `ctx` satisfies the (already-cleaned) condition tree. An empty
    group matches (AND of nothing = True; OR of nothing = False)."""
    if tree.get("type") == "condition":
        return _eval_leaf(tree, ctx)
    children = tree.get("children", [])
    if tree.get("op") == "or":
        return any(evaluate(c, ctx) for c in children)
    # "and" (default) — vacuously True on no children.
    return all(evaluate(c, ctx) for c in children)
