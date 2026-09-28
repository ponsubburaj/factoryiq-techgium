# FactoryIQ Deployment

## Backend: Render
- Create a Web Service from this repository.
- Root directory: `backend` (or use the included `render.yaml`).
- Set `GROQ_API_KEY` and `FRONTEND_ORIGIN`.
- Health endpoint: `/api/health`.

## Frontend: Vercel
- Project root: `frontend`.
- Build: `npm run build`.
- Output: `dist`.
- Set `VITE_API_URL=https://YOUR-BACKEND.onrender.com`.

## Production storage
The prototype stores PDFs and audit metadata on local disk. Hosted containers can have ephemeral storage; use object storage + a database for production.

Never expose `GROQ_API_KEY` in the frontend.
