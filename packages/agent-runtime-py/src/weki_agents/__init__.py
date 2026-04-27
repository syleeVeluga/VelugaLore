"""WekiDocs agent runtime package."""

from .ask import AskRequest, create_ask_patch
from .draft import DraftRequest, create_draft_patch
from .improve import ImproveRequest, create_improve_patch
from .ingest import IngestRequest, create_ingest_patch
from .models import AskPatch, DraftPatch, ImprovePatch, IngestPatch

__version__ = "0.0.0"

__all__ = [
    "AskPatch",
    "AskRequest",
    "DraftPatch",
    "DraftRequest",
    "ImprovePatch",
    "ImproveRequest",
    "IngestPatch",
    "IngestRequest",
    "__version__",
    "create_ask_patch",
    "create_draft_patch",
    "create_improve_patch",
    "create_ingest_patch",
]
