from pathlib import Path
from datetime import datetime, timezone
import json
import re
import uuid
import shutil
import inspect
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader

from config import settings, KNOWLEDGE_DIR, DATA_DIR, METADATA_FILE, AUDIT_FILE
from retrieval import search_knowledge
from governor import govern_query
from llm import generate_answer
from vision import analyze_image

KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="FactoryIQ API",
    version="1.0.0",
    description="Governed GenAI manufacturing knowledge assistant.",
)

origins = [x.strip() for x in settings.frontend_origin.split(",") if x.strip()]
if not origins:
    origins = ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    query: str

class ApprovalRequest(BaseModel):
    query: str
    decision: str
    notes: str = ""

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def read_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

def documents():
    return read_json(METADATA_FILE, [])

def audit_events():
    return read_json(AUDIT_FILE, [])

def add_audit(event_type, payload):
    events = audit_events()
    events.append({
        "id": str(uuid.uuid4()),
        "timestamp": now_iso(),
        "type": event_type,
        **payload,
    })
    write_json(AUDIT_FILE, events[-1000:])

def clean_filename(name):
    name = Path(name or "document.pdf").name
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)

def extract_revision(filename):
    m = re.search(r"(?:^|[_\-\s])v?(\d+(?:\.\d+)?)", filename, re.I)
    return m.group(1) if m else "1.0"

def document_family(filename):
    stem = Path(filename).stem
    stem = re.sub(r"[_\-\s]+v?\d+(?:\.\d+)?$", "", stem, flags=re.I)
    return stem.upper()

def detect_category(filename):
    s = filename.lower()
    if "sop" in s: return "SOP"
    if "work" in s or "procedure" in s: return "WORK_INSTRUCTION"
    if "spec" in s: return "EQUIPMENT_SPEC"
    if "maintenance" in s: return "MAINTENANCE"
    if "quality" in s or "alert" in s: return "QUALITY"
    if "rca" in s: return "RCA"
    return "GENERAL"

def revision_tuple(value):
    try:
        return tuple(int(x) for x in str(value).split("."))
    except Exception:
        return (0,)

def refresh_revision_status(items):
    families = {}
    for d in items:
        families.setdefault(d.get("document_family"), []).append(d)

    for family, docs in families.items():
        ordered = sorted(docs, key=lambda d: revision_tuple(d.get("revision", "0")), reverse=True)
        for index, d in enumerate(ordered):
            d["status"] = "current" if index == 0 else "superseded"

def serialise_source(result):
    return {
        "document_id": result.get("document_id"),
        "filename": result.get("filename"),
        "category": result.get("category"),
        "revision": result.get("revision"),
        "status": result.get("status"),
        "document_family": result.get("document_family"),
        "page": result.get("page"),
        "section": result.get("section", []),
        "score": result.get("score", 0),
        "text": result.get("text", ""),
    }

@app.get("/")
def root():
    return {"name": "FactoryIQ API", "version": "1.0.0", "status": "online"}

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "environment": settings.app_env,
        "llm_configured": bool(settings.groq_api_key),
        "documents": len(documents()),
        "timestamp": now_iso(),
    }

@app.get("/api/documents")
def get_documents():
    return documents()

@app.post("/api/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF documents are supported.")

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB limit.")

    safe_name = clean_filename(file.filename)
    target = KNOWLEDGE_DIR / f"{uuid.uuid4().hex[:10]}_{safe_name}"
    target.write_bytes(content)

    try:
        reader = PdfReader(str(target))
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            pages.append({"page": i, "text": page.extract_text() or ""})
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(400, f"Could not parse PDF: {exc}")

    meta = {
        "id": str(uuid.uuid4()),
        "filename": safe_name,
        "stored_filename": target.name,
        "category": detect_category(safe_name),
        "revision": extract_revision(safe_name),
        "document_family": document_family(safe_name),
        "status": "current",
        "uploaded_at": now_iso(),
        "pages": pages,
    }

    items = documents()
    items.append(meta)
    refresh_revision_status(items)
    write_json(METADATA_FILE, items)

    add_audit("DOCUMENT_UPLOAD", {
        "document_id": meta["id"],
        "filename": safe_name,
        "revision": meta["revision"],
        "category": meta["category"],
    })

    return meta

@app.get("/api/documents/{document_id}/evidence")
def document_evidence(document_id: str, page: Optional[int] = None):
    doc = next((d for d in documents() if d.get("id") == document_id), None)
    if not doc:
        raise HTTPException(404, "Document not found.")
    pages = doc.get("pages", [])
    if page is not None:
        pages = [p for p in pages if p.get("page") == page]
    return {
        "document": {k: v for k, v in doc.items() if k != "pages"},
        "pages": pages,
    }

@app.post("/api/mira/ask")
def ask_mira(request: AskRequest):
    query = request.query.strip()
    if not query:
        raise HTTPException(400, "Query cannot be empty.")

    current = search_knowledge(query, top_k=6, include_superseded=False)
    all_revisions = search_knowledge(query, top_k=12, include_superseded=True)
    governance = govern_query(query, current, all_revisions)

    if governance["decision"] == "ESCALATE":
        add_audit("MIRA_ESCALATION", {
            "query": query,
            "reason": governance["reason"],
        })
        return {
            "decision": "ESCALATE",
            "requires_expert": True,
            "reason": governance["reason"],
            "answer": "This request requires expert approval before guidance can be provided.",
            "sources": [],
            "revision_notes": [],
            "conflicts": [],
        }

    if governance["decision"] == "ABSTAIN":
        add_audit("MIRA_ABSTAIN", {
            "query": query,
            "reason": governance["reason"],
        })
        return {
            "decision": "ABSTAIN",
            "requires_expert": False,
            "reason": governance["reason"],
            "answer": "I cannot provide a reliable answer from the approved manufacturing knowledge base.",
            "sources": [serialise_source(x) for x in current[:3]],
            "revision_notes": governance["revision_notes"],
            "conflicts": governance["conflicts"],
        }

    answer = generate_answer(query, current)
    add_audit("MIRA_QUERY", {
        "query": query,
        "decision": "ANSWER",
        "source_count": len(current),
        "top_source": current[0].get("filename") if current else None,
    })

    return {
        "decision": "ANSWER",
        "requires_expert": False,
        "reason": governance["reason"],
        "answer": answer,
        "sources": [serialise_source(x) for x in current],
        "revision_notes": governance["revision_notes"],
        "conflicts": governance["conflicts"],
    }

@app.post("/api/mira/approval")
def approval(request: ApprovalRequest):
    allowed = {"APPROVE", "REJECT", "MORE_EVIDENCE"}
    decision = request.decision.upper().strip()
    if decision not in allowed:
        raise HTTPException(400, f"Decision must be one of: {', '.join(sorted(allowed))}")

    add_audit("EXPERT_APPROVAL", {
        "query": request.query,
        "decision": decision,
        "notes": request.notes,
    })
    return {"status": "recorded", "decision": decision}

@app.post("/api/mira/vision")
async def vision(
    file: UploadFile = File(...),
    question: str = Form("Analyze this equipment image using the approved manufacturing knowledge base."),
):
    content = await file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.max_upload_mb} MB limit.")

    try:
        result = analyze_image(content, file.content_type or "", question)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Vision analysis failed: {exc}")

    add_audit("VISION_ANALYSIS", {
        "filename": clean_filename(file.filename),
        "question": question,
    })
    return {
        "decision": "ANALYZED",
        **result,
        "sources": [serialise_source(x) for x in result.get("evidence", [])],
    }

@app.get("/api/audit")
def get_audit():
    return list(reversed(audit_events()))

@app.delete("/api/audit")
def clear_audit():
    # Clearing should actually leave the audit store empty.
    write_json(AUDIT_FILE, [])
    return {"status": "cleared"}

@app.exception_handler(Exception)
async def unhandled(request, exc):
    print("Unhandled API error:", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})
