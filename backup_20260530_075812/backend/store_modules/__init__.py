"""
Store sub-modules extracted from agent_store.py for maintainability.

Each module exposes a `register(router, db, get_current_user, helpers)` function
that registers its endpoints onto the supplied router. This preserves the
original `/api/...` URL surface while splitting the file along business lines.

Modules:
  * coupons       — admin coupon CRUD + public validate-coupon + _evaluate_coupon
  * hr_agents     — HR external-agents directory + add-to-employees
  * store_admin   — admin store settings + product CRUD + admin image upload

The shared `helpers` dict contains the closure utilities that endpoints need:
  - now() -> str
  - strip_mongo(doc) -> dict
  - slugify(s) -> str
  - ensure_admin(user)
  - validate_carousel_images(arr)
  - validate_faqs(arr, field)
  - validate_iso_date(s, field)
  - DEFAULT_STORE_SETTINGS (dict)
"""
