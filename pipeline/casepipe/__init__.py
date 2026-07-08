"""Case Management Automation — document processing pipeline.

Code-first pipeline: text-layer extraction / OCR -> term matching with
negation handling -> finding assembly with page + bbox + evidence ->
confidence scoring -> PDF annotation (highlights + bookmark tree) ->
structured findings JSON. Agent escalation attaches at the confidence
gate (see gate.py) and is optional: everything below runs deterministically.
"""

__version__ = "0.1.0"
