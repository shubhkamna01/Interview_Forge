# Interview Forge: frontend

React + TypeScript + Vite. See the project README one level up for how to run everything.

```bash
npm install
npm run dev        # http://localhost:5173, forwards /api to the backend on :8000
npm run build      # type-check and build into dist/
npm run lint
npm run test:ui    # needs the backend running, see the main README
```

Set `VITE_API_URL` (see `.env.example`) when the backend is hosted somewhere else.

Layout: `src/api` (the only code that knows backend URLs), `src/auth`, `src/pages`, `src/components`, `src/hooks`, `src/lib`.
