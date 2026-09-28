import base64
import io

from config import settings
from retrieval import search_knowledge

ALLOWED = {"image/jpeg", "image/png", "image/webp"}

def _client():
    if not settings.groq_api_key:
        return None
    from openai import OpenAI
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url="https://api.groq.com/openai/v1",
    )

def _fallback(question, evidence):
    observations = "Visual inspection model is not configured. Image was accepted, but no model observation was generated."
    citations = []
    for e in evidence[:3]:
        citations.append(
            f"[Source: {e.get('filename')} | Rev {e.get('revision')} | p.{e.get('page')}]"
        )
    return {
        "observation": observations,
        "answer": (
            "No multimodal model result is available. "
            "The image should be reviewed by a qualified engineer."
            + (" " + " ".join(citations) if citations else "")
        ),
    }

def analyze_image(image_bytes: bytes, content_type: str, question: str):
    if content_type not in ALLOWED:
        raise ValueError("Only JPG, PNG and WEBP images are supported.")

    try:
        from PIL import Image
        image = Image.open(io.BytesIO(image_bytes))
        image.verify()
    except Exception as exc:
        raise ValueError("The uploaded file is not a valid image.") from exc

    evidence = search_knowledge(question, top_k=5)
    client = _client()

    if client is None:
        return _fallback(question, evidence)

    b64 = base64.b64encode(image_bytes).decode("utf-8")
    prompt = f"""You are MIRA Vision for a manufacturing environment.

User question:
{question}

Inspect the supplied equipment image. Report only visible, defensible observations.
Do not claim a hidden machine fault as fact. Then connect the observation to the
approved evidence below if relevant.

Approved evidence:
{chr(10).join(
    f"- {e.get('filename')} | Rev {e.get('revision')} | p.{e.get('page')}: {e.get('text')}"
    for e in evidence[:5]
)}

Return:
1. Visible observation
2. Evidence-grounded interpretation
3. Recommended next action only when supported by evidence
4. Source citations
"""

    data_url = f"data:{content_type};base64,{b64}"
    try:
        response = client.chat.completions.create(
            model=settings.groq_vision_model,
            temperature=0.1,
            max_tokens=900,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }
            ],
        )
        answer = response.choices[0].message.content.strip()
        return {
            "observation": "Multimodal inspection completed.",
            "answer": answer,
            "evidence": evidence,
        }
    except Exception as exc:
        print("Vision error:", exc)
        return _fallback(question, evidence)
