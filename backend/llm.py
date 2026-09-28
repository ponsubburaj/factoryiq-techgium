from config import settings

SYSTEM_PROMPT = """You are MIRA, the Manufacturing Intelligence & Response Assistant.

You answer only from the supplied approved evidence. Do not invent procedures,
parameters, limits, causes, part numbers, or safety instructions.

Rules:
1. Use the evidence as the authority.
2. If evidence is insufficient, say that the evidence is insufficient.
3. Prefer current revisions over superseded revisions.
4. Never recommend bypassing, disabling, defeating, or overriding safety systems.
5. Give concise, operator-friendly steps when the evidence supports them.
6. Cite claims inline using [Source: filename | Rev X | p.Y].
7. Distinguish documented facts from observations or limitations.
"""

def _client():
    if not settings.groq_api_key:
        return None
    from openai import OpenAI
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
    )

def fallback_answer(query, evidence):
    if not evidence:
        return "I cannot provide a reliable answer because the approved knowledge base does not contain sufficient supporting evidence."
    lines = [
        "Based on the approved manufacturing evidence, the relevant guidance is:",
    ]
    for e in evidence[:3]:
        text = " ".join((e.get("text") or "").split())
        lines.append(
            f"- {text[:420]} "
            f"[Source: {e.get('filename')} | Rev {e.get('revision')} | p.{e.get('page')}]"
        )
    return "\n".join(lines)

def generate_answer(query, evidence):
    client = _client()
    if client is None:
        return fallback_answer(query, evidence)

    evidence_text = "\n\n".join(
        f"""SOURCE {i+1}
Document: {e.get('filename')}
Revision: {e.get('revision')}
Status: {e.get('status')}
Page: {e.get('page')}
Category: {e.get('category')}
Section: {', '.join(e.get('section', []))}
Evidence:
{e.get('text')}
"""
        for i, e in enumerate(evidence[:6])
    )

    prompt = f"""User question:
{query}

Approved evidence:
{evidence_text}

Answer the user directly. Keep the response concise but actionable.
Every material factual claim should be traceable to a source citation.
"""

    try:
        response = client.chat.completions.create(
            model=settings.groq_text_model,
            temperature=0.1,
            max_tokens=900,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        print("LLM error:", exc)
        return fallback_answer(query, evidence)
