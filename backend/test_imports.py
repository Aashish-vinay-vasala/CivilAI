"""
Smoke test: imports a hardcoded list of route modules and prints a check/
cross mark per module, to catch import-time errors (missing deps, circular
imports, syntax errors) early without spinning up the full FastAPI app.
"""

import traceback

modules = [
    "app.api.v1.routes.copilot",
    "app.api.v1.routes.documents",
    "app.api.v1.routes.contracts",
    "app.api.v1.routes.safety",
    "app.api.v1.routes.cost",
    "app.api.v1.routes.ml",
    "app.api.v1.routes.projects",
    "app.api.v1.routes.writing",
    "app.api.v1.routes.green",
    "app.api.v1.routes.vendors",
    "app.api.v1.routes.payments",
    "app.api.v1.routes.evaluation",
    "app.api.v1.routes.judge",
]

for module in modules:
    try:
        __import__(module)
        print(f"✅ {module}")
    except Exception as e:
        print(f"❌ {module}: {e}")
        traceback.print_exc()
        print()