import re

HIGH_RISK_PATTERNS = [
    r"\bbypass\b.*\bsafety\b",
    r"\bdisable\b.*\bsafety\b",
    r"\boverride\b.*\bsafety\b",
    r"\bdisable\b.*\binterlock\b",
    r"\bbypass\b.*\binterlock\b",
    r"\boverride\b.*\binterlock\b",
    r"\bdisable\b.*\bemergency stop\b",
    r"\bbypass\b.*\bemergency stop\b",
    r"\bturn off\b.*\bsafety\b",
    r"\bdefeat\b.*\binterlock\b",
]

def detect_high_risk(query: str) -> bool:
    q = query.lower().strip()
    return any(re.search(p, q) for p in HIGH_RISK_PATTERNS)

def evaluate_evidence(results, revision_results=None):
    if not results:
        return {
            "decision": "ABSTAIN",
            "reason": "No supporting evidence was found in the approved knowledge base.",
            "revision_notes": [],
            "conflicts": [],
        }

    best = float(results[0].get("score", 0))
    if best < 0.15:
        return {
            "decision": "ABSTAIN",
            "reason": "Retrieved evidence is too weak to support a reliable manufacturing answer.",
            "revision_notes": [],
            "conflicts": [],
        }

    all_results = list(results) + list(revision_results or [])
    families = {}
    for r in all_results:
        family = r.get("document_family")
        if family:
            families.setdefault(family, []).append(r)

    revision_notes, conflicts = [], []
    for family, docs in families.items():
        current = [d for d in docs if d.get("status") == "current"]
        old = [d for d in docs if d.get("status") == "superseded"]
        current_revs = sorted({d.get("revision") for d in current if d.get("revision")})
        old_revs = sorted({d.get("revision") for d in old if d.get("revision")})

        if len(current_revs) > 1:
            conflicts.append({
                "document_family": family,
                "type": "MULTIPLE_CURRENT_REVISIONS",
                "revisions": current_revs,
            })
        if current and old:
            revision_notes.append({
                "document_family": family,
                "current_revision": current_revs[0] if current_revs else "current",
                "superseded_revisions": old_revs,
                "message": (
                    f"Current revision {current_revs[0] if current_revs else 'current'} "
                    f"was preferred over superseded revision(s): "
                    f"{', '.join(old_revs) or 'older revision'}."
                ),
            })

    if conflicts:
        return {
            "decision": "ABSTAIN",
            "reason": "Conflicting current document revisions were detected.",
            "revision_notes": revision_notes,
            "conflicts": conflicts,
        }

    return {
        "decision": "ANSWER",
        "reason": "Sufficient supporting evidence was found.",
        "revision_notes": revision_notes,
        "conflicts": conflicts,
    }

def govern_query(query, results, revision_results=None):
    if detect_high_risk(query):
        return {
            "decision": "ESCALATE",
            "requires_expert": True,
            "reason": "The request involves a safety-critical operation and requires expert approval.",
            "revision_notes": [],
            "conflicts": [],
        }
    evidence = evaluate_evidence(results, revision_results)
    return {
        **evidence,
        "requires_expert": evidence["decision"] == "ESCALATE",
    }
