"""Helpers to resolve the tourist identity shown to Rangers / Control Room."""
from typing import Optional


def display_name(user, fallback_name: Optional[str] = None) -> str:
    """Registered full name always wins; then client-sent name; then email prefix."""
    if user is not None and getattr(user, "full_name", None):
        return user.full_name.strip()
    if fallback_name and fallback_name.strip():
        return fallback_name.strip()
    if user is not None and getattr(user, "email", None):
        return user.email.split("@")[0].replace(".", " ").title()
    return "Unknown Tourist"


def display_phone(user, fallback_phone: Optional[str] = None) -> str:
    """Registered phone wins; then client-sent phone; otherwise 'Not provided'."""
    if user is not None and getattr(user, "phone", None):
        return user.phone
    if fallback_phone and fallback_phone.strip():
        return fallback_phone.strip()
    return "Not provided"
