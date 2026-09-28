# FactoryIQ

FactoryIQ is a governed GenAI manufacturing knowledge assistant built for the Techgium Challenge 49 concept: multimodal manufacturing knowledge assistance with source traceability, revision awareness, abstention and expert approval.

## Core workflow

**Retrieve → Verify revision → Ground → Govern → Answer / Abstain / Escalate → Audit**

## Stack

- React + Vite
- FastAPI
- PyPDF
- TF-IDF + keyword retrieval
- Groq-compatible OpenAI API
- Multimodal vision endpoint
- Deterministic governance layer

## Local run

### Backend
```powershell
cd backend
python -m venv venv
venv\Scripts\Activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload
```

### Frontend
```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open the Vite URL shown in the terminal.

## Deployment

Recommended split deployment:

- Backend → Render / Railway / Fly.io using `backend/Dockerfile`
- Frontend → Vercel
- Set frontend `VITE_API_URL` to the deployed backend URL.
- Set backend `FRONTEND_ORIGIN` to the deployed frontend URL.
- Set backend `GROQ_API_KEY` as a server-side secret.

## Important

The bundled knowledge PDFs are a **demo corpus**, not official plant documentation. Replace them with approved plant documents before operational use.
