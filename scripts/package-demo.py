#!/usr/bin/env python3
"""Package reviewed working-tree source; never install, invoke providers or publish."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import uuid
import zipfile


ARCHIVE_ROOT = "playwright-agent"
ROOT_FILES = (
    "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md", "AGENTS.md",
    "package.json", "package-lock.json", "playwright.config.ts", "tsconfig.json",
    ".gitignore", ".npmrc", ".nvmrc", ".python-version", ".gitleaks.toml",
    ".env.example", ".env.sample", ".env.template",
    "quality/README.md", "quality/AGENTS.md", "quality/VALIDATION.md",
    "quality/package.json", "quality/package-lock.json", "quality/tsconfig.json",
    "quality/.gitignore", "quality/.npmrc", "quality/.nvmrc",
    "quality/.python-version", "quality/.gitleaks.toml", "quality/.platform-publish.json",
    "quality/.env.example", "quality/.env.sample", "quality/.env.template",
    "graphs/README.md", "docs/blog/assets/graph-metrics.png",
)
# Each entry is a reviewed source owner. Unknown sibling directories are excluded.
SOURCE_TREES = (
    "src", "tests", "fixtures", "pages", "assertions", "data", "specs", "scripts",
    "examples", "contexts", "benchmarks", "docs", ".agents", ".codex/agents",
    ".github", ".vscode", "quality/src", "quality/tests", "quality/fixtures",
    "quality/examples", "quality/scripts", "quality/python", "quality/shared",
    "quality/integrations/code-mode", "quality/.agents", "quality/benchmarks",
    "quality/docs",
)
EXCLUDED_PARTS = frozenset({
    ".git", "node_modules", ".venv", "venv", "artifacts", "results", "reports",
    "test-results", "playwright-report", "benchmark-results", ".auth", ".runtime",
    ".resolved", "__pycache__", ".cache", "cache", "caches", "models", "weights",
    "datasets", "downloads", "dist", "target", ".next", ".playwright",
    ".playwright-cli", ".aws", ".ssh", "context-inputs", "localconfigs",
    "local-config", "logs", "drafts", "unpublished", "blog", "evidence",
})
TEXT_SUFFIXES = frozenset({
    ".md", ".txt", ".json", ".yml", ".yaml", ".toml", ".lock", ".mjs", ".cjs",
    ".js", ".ts", ".mts", ".cts", ".py", ".sh", ".html", ".css", ".svg",
})
SYNTHETIC_DOCUMENTS = frozenset({
    "quality/examples/team/requirements.doc", "quality/examples/team/requirements.docx",
    "quality/examples/team/requirements.xls", "quality/examples/team/requirements.xlsx",
})
# Public, authored reference inputs. Never walk contexts/tasks to find these.
PUBLIC_TASK_FILES = frozenset({
    "contexts/tasks/CRM-DEMO-001/epic.md",
    "contexts/tasks/CRM-DEMO-001/jira-tickets.json",
    "contexts/tasks/CRM-DEMO-001/requirements.json",
})
REQUIRED_FILES = ("package.json", "package-lock.json", "README.md", "AGENTS.md", "LICENSE", "THIRD_PARTY_NOTICES.md")
PRIVATE_PATH = re.compile(rb"(?:/Users/|/home/)[A-Za-z0-9_.-]+/|[A-Za-z]:\\Users\\[^\\\r\n]+\\")
PRIVATE_KEY = re.compile(rb"-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----")


def permitted(relative: Path, *, explicit: bool = False) -> bool:
    """Apply recursive exclusions even inside an allowed source tree."""
    parts = relative.parts
    name = relative.name.lower()
    if any(part.lower() in EXCLUDED_PARTS for part in parts):
        # One individually reviewed README image; other draft assets stay private.
        if relative.as_posix() != "docs/blog/assets/graph-metrics.png":
            return False
    lower_parts = tuple(part.lower() for part in parts)
    if "contexts" in lower_parts and "tasks" in lower_parts and relative.as_posix() not in PUBLIC_TASK_FILES:
        return False
    if name.startswith(".env") and name not in {".env.example", ".env.sample", ".env.template"}:
        return False
    if (name.endswith((".local.json", ".local.yml", ".local.yaml", ".local.toml", ".log", ".pyc", ".pem", ".key", ".p12", ".pfx"))
            or name.startswith(("id_rsa", "id_ed25519")) or "draft" in name):
        return False
    if explicit or relative.as_posix() in SYNTHETIC_DOCUMENTS:
        return True
    if parts[:2] == ("contexts", "captures") and relative.suffix.lower() in {".png", ".jpg", ".jpeg"}:
        return True
    return relative.suffix.lower() in TEXT_SUFFIXES or name in {"license", ".gitignore", ".npmrc", ".nvmrc", ".python-version"}


def collect(root: Path) -> list[Path]:
    selected: set[Path] = set()

    def visit(path: Path, *, explicit: bool = False) -> None:
        relative = path.relative_to(root)
        # Excluded dependencies and private trees are not traversed or dereferenced.
        if any(part.lower() in EXCLUDED_PARTS for part in relative.parts) and not explicit:
            return
        lower_parts = tuple(part.lower() for part in relative.parts)
        if "contexts" in lower_parts and "tasks" in lower_parts:
            return
        if path.is_symlink():
            raise ValueError(f"Symlink in source allowlist: {relative.as_posix()}")
        if not permitted(relative, explicit=explicit) and not path.is_dir():
            return
        if path.is_dir():
            for child in sorted(path.iterdir()):
                visit(child)
        elif path.exists():
            if not path.is_file():
                raise ValueError(f"Non-regular source entry: {relative.as_posix()}")
            if permitted(relative, explicit=explicit):
                selected.add(relative)

    for name in ROOT_FILES:
        visit(root / name, explicit=True)
    for name in SOURCE_TREES:
        visit(root / name)
    # Explicit leaf selection preserves the no-traversal boundary for every other
    # work item, extra file and subdirectory, including inside the public task.
    for name in sorted(PUBLIC_TASK_FILES):
        relative = Path(name)
        source_path_guard(root, relative)
        target = root / relative
        if target.exists():
            if not target.is_file():
                raise ValueError(f"Non-regular source entry: {name}")
            if permitted(relative, explicit=True):
                selected.add(relative)
    missing = [name for name in (*REQUIRED_FILES, *sorted(PUBLIC_TASK_FILES)) if Path(name) not in selected]
    if missing:
        raise ValueError("Missing required source files: " + ", ".join(missing))
    return sorted(selected, key=lambda path: path.as_posix())


def source_path_guard(root: Path, relative: Path) -> None:
    # Check from the root down before inspecting a leaf through an ancestor link.
    for depth in range(1, len(relative.parts) + 1):
        if (root / Path(*relative.parts[:depth])).is_symlink():
            raise ValueError(f"Symlink in source allowlist: {relative.as_posix()}")


def source_bytes(root: Path, relative: Path) -> bytes:
    path = root / relative
    source_path_guard(root, relative)
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
            raise ValueError(f"Non-regular source entry: {relative.as_posix()}")
        payload = handle.read()
    if PRIVATE_PATH.search(payload) or PRIVATE_KEY.search(payload):
        raise ValueError(f"Private path or key marker in source: {relative.as_posix()}")
    return payload


def sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def package(root: Path, output_dir: Path) -> dict[str, object]:
    if root.is_symlink():
        raise ValueError("Source root must not be a symlink")
    root = root.resolve(strict=True)
    files = collect(root)
    payloads = [(path.as_posix(), source_bytes(root, path)) for path in files]
    now = dt.datetime.now(dt.timezone.utc)
    manifest = {
        "formatVersion": 1, "product": "playwright-agent", "archiveRoot": ARCHIVE_ROOT,
        "generatedAt": now.isoformat(), "sourceMode": "reviewed-working-tree-allowlist",
        "hashScope": "Every payload file below; generated SOURCE-MANIFEST.json is excluded from its own payload list.",
        "files": [{"path": name, "bytes": len(payload), "sha256": sha256(payload)} for name, payload in payloads],
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    destination = output_dir.expanduser().resolve() / (now.strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12])
    destination.mkdir(parents=True, exist_ok=False)
    archive_path = destination / "playwright-agent-source.zip"
    with zipfile.ZipFile(archive_path, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, payload in payloads + [("SOURCE-MANIFEST.json", manifest_bytes)]:
            if PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts:
                raise ValueError("Unsafe archive filename")
            archive.writestr(f"{ARCHIVE_ROOT}/{name}", payload)
    (destination / "SOURCE-MANIFEST.json").write_bytes(manifest_bytes)
    sums = f"{sha256(archive_path.read_bytes())}  {archive_path.name}\n{sha256(manifest_bytes)}  SOURCE-MANIFEST.json\n"
    (destination / "SHA256SUMS").write_text(sums, encoding="utf-8")
    # Reopen the ZIP and verify the complete file/hash boundary before returning.
    with zipfile.ZipFile(archive_path) as archive:
        expected = {f"{ARCHIVE_ROOT}/{name}" for name, _ in payloads} | {f"{ARCHIVE_ROOT}/SOURCE-MANIFEST.json"}
        if set(archive.namelist()) != expected or len(archive.namelist()) != len(expected):
            raise ValueError("Archive payload does not match source manifest")
        for item in manifest["files"]:
            payload = archive.read(f"{ARCHIVE_ROOT}/{item['path']}")
            if sha256(payload) != item["sha256"] or len(payload) != item["bytes"]:
                raise ValueError(f"Archive hash mismatch: {item['path']}")
    return {"directory": str(destination), "archive": str(archive_path), "files": len(payloads), "sha256": sha256(archive_path.read_bytes())}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).absolute().parents[1])
    parser.add_argument("--output-dir", type=Path, help="Release parent directory; a unique child is created")
    args = parser.parse_args()
    try:
        result = package(args.root, args.output_dir or args.root / "artifacts/releases")
    except (ValueError, OSError, zipfile.BadZipFile) as exc:
        print(f"Packaging failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
