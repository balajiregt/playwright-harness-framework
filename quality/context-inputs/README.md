# Local work-item artifacts

Put your downloaded Confluence epics/PRDs and Jira tickets in this folder.
Its contents are ignored by Git except this README. Use one work-item collection
per campaign; configure `artifactDir` for another folder.

Accepted: PDF with selectable text, DOC/DOCX, HTML, JSON, CSV, TXT/Markdown and
XLS/XLSX with literal values. These are passive exports; no Atlassian API is used.
PDF extraction needs `python/requirements-artifacts.txt`. Scanned documents need
OCR text supplied separately. Original files and exact requirement quotes are
hashed and linked in the private report. Conflicts and missing criteria need review.

Use `examples/mutation/context` for the explicitly synthetic first demonstration.
No customer artifacts are bundled or downloaded automatically.
