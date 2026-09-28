from pathlib import Path
import json
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

BASE_DIR = Path(__file__).resolve().parent
METADATA_FILE = BASE_DIR / "data" / "documents.json"

def load_documents():
    if not METADATA_FILE.exists():
        return []
    try:
        return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []

def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()

def extract_sections(text: str):
    sections, current = [], "General"
    for raw in text.splitlines():
        clean = raw.strip()
        if not clean:
            continue
        if re.search(
            r"(section|procedure|work instruction|findings|corrective action|"
            r"root cause|preventive action|operating parameters|safety|"
            r"containment|escalation|maintenance|troubleshooting|quality|"
            r"steps?|inspection|startup|shutdown)",
            clean, re.I,
        ):
            current = clean
        sections.append((current, clean))
    return sections

def build_chunks(include_superseded=False):
    chunks = []
    for document in load_documents():
        status = document.get("status", "current")
        if status == "superseded" and not include_superseded:
            continue
        for page in document.get("pages", []):
            text = (page.get("text") or "").strip()
            if not text:
                continue
            section_names = list(dict.fromkeys(s for s, _ in extract_sections(text)))
            chunks.append({
                "document_id": document.get("id"),
                "filename": document.get("filename"),
                "category": document.get("category"),
                "revision": document.get("revision"),
                "status": status,
                "document_family": document.get("document_family"),
                "page": page.get("page"),
                "section": section_names,
                "text": text,
            })
    return chunks

def keyword_score(query, text):
    q = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", query.lower()))
    t = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", text.lower()))
    return len(q & t) / len(q) if q else 0.0

def search_knowledge(query: str, top_k: int = 6, include_superseded=False):
    query = query.strip()
    if not query:
        return []
    chunks = build_chunks(include_superseded)
    if not chunks:
        return []

    corpus = [normalize_text(c["text"]) for c in chunks]
    vectorizer = TfidfVectorizer(
        lowercase=True, stop_words="english",
        ngram_range=(1, 2), sublinear_tf=True
    )
    try:
        matrix = vectorizer.fit_transform(corpus)
        qv = vectorizer.transform([query])
        scores = cosine_similarity(qv, matrix)[0]
    except Exception:
        return []

    results = []
    for i, chunk in enumerate(chunks):
        tfidf = float(scores[i])
        kw = keyword_score(query, chunk["text"])
        # Exact error codes and identifiers get an additional deterministic boost.
        identifier_boost = 0.0
        identifiers = re.findall(r"\b[A-Z]{1,8}[-_]\d+\b|\bE\d{2,4}\b", query.upper())
        for identifier in identifiers:
            if identifier.lower() in chunk["text"].lower():
                identifier_boost = max(identifier_boost, 0.18)
        final = min(1.0, 0.68 * tfidf + 0.22 * kw + identifier_boost)
        if final <= 0:
            continue
        item = chunk.copy()
        item.update({
            "tfidf_score": round(tfidf, 4),
            "keyword_score": round(kw, 4),
            "score": round(final, 4),
        })
        results.append(item)

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
