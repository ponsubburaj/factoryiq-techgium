# FactoryIQ Deployment Checklist

## 1. Local backend

```powershell
cd backend
python -m venv venv
venv\Scripts\Activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload
```

Health:
`http://127.0.0.1:8000/api/health`

Swagger:
`http://127.0.0.1:8000/docs`

## 2. Local frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run build
npm run dev
```

## 3. Demo checks

- Dashboard loads
- Knowledge Base shows 7 demo documents
- E42 query → ANSWER
- Boeing 747 query → ABSTAIN
- Safety interlock bypass → ESCALATE
- Expert approval is recorded
- Vision upload works
- Audit Log shows events

## 4. Production

Backend:
- Deploy `backend/` with Docker.
- Set `GROQ_API_KEY`.
- Set `FRONTEND_ORIGIN`.
- Verify `/api/health`.

Frontend:
- Deploy `frontend/`.
- Set `VITE_API_URL`.
- Build with `npm run build`.

## 5. Security

Never commit `.env` or expose `GROQ_API_KEY` to the browser.

## 6. Persistence

The prototype stores the demo registry, PDFs and audit log locally. Hosted free/container instances may have ephemeral disks. A production system should use durable object storage and a database.
