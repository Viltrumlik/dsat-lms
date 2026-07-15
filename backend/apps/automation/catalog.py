"""
DSAT LMS v2 — Automation catalog
Domain: Automation
Description: The whitelist that makes the condition DSL safe. Every rule field, op,
    action, and event a rule may reference is enumerated here — nothing outside
    this catalog is accepted by the validator or reachable at execution. This is
    the single source of truth the builder UI (GET /admin/automation/catalog/) and
    the validator (conditions.py) both read.

Subjects are academy STUDENTS in v1: fields resolve against a per-student context
(analytics signals + risk + lifecycle status) built once per cohort in the sweep.
"""

# ── Field value types ────────────────────────────────────────────────────────
TYPE_NUMBER = "number"
TYPE_ENUM = "enum"

# ── Operators, grouped by the value type they apply to ───────────────────────
NUMERIC_OPS = ("eq", "ne", "gt", "lt", "gte", "lte")
ENUM_OPS = ("eq", "ne", "in")
ALL_OPS = ("eq", "ne", "gt", "lt", "gte", "lte", "in", "contains")

OP_LABELS = {
    "eq": "is",
    "ne": "is not",
    "gt": "greater than",
    "lt": "less than",
    "gte": "at least",
    "lte": "at most",
    "in": "is one of",
    "contains": "contains",
}

# ── Structural bounds (rule-storm / abuse guards) ────────────────────────────
MAX_DEPTH = 4  # nesting depth of the condition tree
MAX_CHILDREN = 20  # children per group node
MAX_ACTIONS = 5  # actions per rule


# A field's `resolve(ctx)` reads the per-student context assembled in services.py.
FIELDS = {
    "homework_completion": {
        "label": "Homework completion %",
        "type": TYPE_NUMBER,
        "ops": NUMERIC_OPS,
        "resolve": lambda ctx: ctx["signals"].get("completion_pct"),
    },
    "overall_accuracy": {
        "label": "Overall accuracy %",
        "type": TYPE_NUMBER,
        "ops": NUMERIC_OPS,
        "resolve": lambda ctx: (
            ctx["signals"].get("overall_accuracy") if ctx["signals"].get("has_accuracy") else None
        ),
    },
    "score_trend": {
        "label": "Score trend (Δ%)",
        "type": TYPE_NUMBER,
        "ops": NUMERIC_OPS,
        "resolve": lambda ctx: ctx["signals"].get("delta_pct"),
    },
    "days_inactive": {
        "label": "Days inactive",
        "type": TYPE_NUMBER,
        "ops": NUMERIC_OPS,
        "resolve": lambda ctx: ctx["signals"].get("days_inactive"),
    },
    "attendance_rate": {
        "label": "Attendance rate %",
        "type": TYPE_NUMBER,
        "ops": NUMERIC_OPS,
        "resolve": lambda ctx: ctx["signals"].get("attendance_rate"),
    },
    "risk_level": {
        "label": "Risk level",
        "type": TYPE_ENUM,
        "ops": ENUM_OPS,
        "choices": ["green", "yellow", "red"],
        "resolve": lambda ctx: ctx.get("risk_level"),
    },
    "lifecycle_status": {
        "label": "Lifecycle status",
        "type": TYPE_ENUM,
        "ops": ENUM_OPS,
        "choices": ["active", "frozen", "graduated", "dropped"],
        "resolve": lambda ctx: ctx.get("lifecycle_status"),
    },
}

# ── Actions ──────────────────────────────────────────────────────────────────
# Each param: (key, kind, required, choices?). `kind` = string | enum | text.
NOTIFY_RECIPIENTS = ["student", "mentor"]
STATUS_CHOICES = ["active", "frozen", "graduated", "dropped"]

ACTIONS = {
    "notify": {
        "label": "Send notification",
        "params": {
            "recipient": {"kind": "enum", "required": True, "choices": NOTIFY_RECIPIENTS},
            "message": {"kind": "text", "required": True},
        },
    },
    "add_tag": {
        "label": "Add tag",
        "params": {
            "tag": {"kind": "string", "required": True},
        },
    },
    "change_status": {
        "label": "Change lifecycle status",
        "params": {
            "status": {"kind": "enum", "required": True, "choices": STATUS_CHOICES},
        },
    },
}

# ── Triggers + events ────────────────────────────────────────────────────────
TRIGGERS = {
    "scheduled_daily": {"label": "Every day (scheduled)"},
    "event": {"label": "When an event happens"},
}

# Event keys a rule may listen for; each maps to a subject_type. v1 wires one seam.
EVENTS = {
    "homework_submitted": {"label": "Homework submitted", "subject_type": "student"},
}

SUBJECT_TYPES = ("student",)


def catalog_payload():
    """The full builder catalog (GET /admin/automation/catalog/). Everything is
    LIST-shaped where a dict would otherwise be keyed by a snake_case value the
    frontend axios client would camelize."""
    return {
        "subject_types": list(SUBJECT_TYPES),
        "triggers": [{"key": k, "label": v["label"]} for k, v in TRIGGERS.items()],
        "events": [
            {"key": k, "label": v["label"], "subject_type": v["subject_type"]}
            for k, v in EVENTS.items()
        ],
        "fields": [
            {
                "key": k,
                "label": v["label"],
                "type": v["type"],
                "ops": list(v["ops"]),
                "choices": v.get("choices", []),
            }
            for k, v in FIELDS.items()
        ],
        "operators": [{"op": op, "label": OP_LABELS[op]} for op in ALL_OPS],
        "actions": [
            {
                "type": k,
                "label": v["label"],
                "params": [
                    {
                        "key": pk,
                        "kind": pv["kind"],
                        "required": pv["required"],
                        "choices": pv.get("choices", []),
                    }
                    for pk, pv in v["params"].items()
                ],
            }
            for k, v in ACTIONS.items()
        ],
        "limits": {
            "max_depth": MAX_DEPTH,
            "max_children": MAX_CHILDREN,
            "max_actions": MAX_ACTIONS,
        },
    }
