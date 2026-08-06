"""
DSAT LMS v2 — Question-bank taxonomy cache
Domain: Question Bank
Description: The category tree and the tag list, held in Redis.

These are the right things to cache and almost the only ones. The tree is the
College Board's own taxonomy — 8 domains and 24 skills that change when someone
edits the syllabus, i.e. approximately never — and it is fetched on every load
of the question bank, the drill builder and the admin editor. Everything else
worth serving is per-student and would need a cache key per user, which is a
cache that never hits.

Invalidated by VERSION, not by delete. Bumping an integer is one atomic write
that cannot half-fail and cannot race a concurrent read into serving a stale
tree under a key someone has already re-populated; hunting down every derived
key on every edit is how a cache starts lying. Old entries simply expire.
"""

from django.core.cache import cache

VERSION_KEY = "qb:taxonomy:version"
TTL = 60 * 60 * 6  # A backstop, not the invalidation — see the module docstring.


def _version() -> int:
    version = cache.get(VERSION_KEY)
    if version is None:
        version = 1
        cache.set(VERSION_KEY, version, None)  # no expiry: it IS the pointer
    return version


def key(name: str) -> str:
    return f"qb:taxonomy:{_version()}:{name}"


def get_or_set(name: str, build):
    """Serve `name` from cache, or build it and keep it.

    A cache backend that is down must never take the question bank down with it,
    so every failure falls through to the database. Slower is not broken.
    """
    # The KEY derivation reads the version out of Redis, so it has to be inside
    # the guard too — a dead cache raising here would 500 the endpoint, which is
    # the exact failure the fallback exists to prevent.
    try:
        cache_key = key(name)
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
    except Exception:  # noqa: BLE001
        return build()

    value = build()
    try:
        cache.set(cache_key, value, TTL)
    except Exception:  # noqa: BLE001
        pass
    return value


def invalidate() -> None:
    """Retire every cached taxonomy entry. Called on any category/tag write."""
    try:
        cache.set(VERSION_KEY, _version() + 1, None)
    except Exception:  # noqa: BLE001
        # A failed bump means stale reads for up to TTL, which is why TTL exists.
        pass


def connect_invalidation() -> None:
    """Bump the version whenever a category or tag changes, however it changed.

    A signal rather than a call in each admin view, because the views are not the
    only writer: `seed_sat_taxonomy`, the Django admin and a shell session all
    edit these models directly, and a cache that only eight known code paths
    remember to invalidate is a cache that eventually lies. Soft delete goes
    through save(), so post_save covers it too.
    """
    from django.db.models.signals import post_delete, post_save

    from .models import QuestionCategory, QuestionTag

    def _bump(sender, **kwargs):
        invalidate()

    for model in (QuestionCategory, QuestionTag):
        post_save.connect(_bump, sender=model, dispatch_uid=f"qb-cache-save-{model.__name__}")
        post_delete.connect(_bump, sender=model, dispatch_uid=f"qb-cache-del-{model.__name__}")
