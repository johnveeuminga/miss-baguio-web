# API Integration Guidelines (Miss Baguio Tabulation API)

This document explains how a frontend app can securely consume the Miss Baguio Tabulation API: authentication, core endpoints, real-time SignalR integration, examples (fetch + SignalR), and notes about fields introduced by the importer (for audit and normalization).

Checklist for frontend integrators

- Obtain API base URL (e.g., `https://api.example.com` or `http://localhost:5000`).
- Implement JWT-based authentication and persist the token securely in the client (in-memory or secure storage).
- Wire SignalR for live updates (pass the JWT as `access_token`).
- Use the results endpoints below; prefer `GET /api/results/table/full` for a complete preliminary table (per-judge scores + weighted totals).

Base URL and environment

- Local development base: `http://localhost:5000`
- API prefix: `/api`

Required server-side envs (for deployers)

- `ConnectionStrings:DefaultConnection` — MySQL connection string
- `Jwt:SecretKey`, `Jwt:Issuer`, `Jwt:Audience`, `Jwt:TokenExpirationMinutes`

Authentication (JWT)

All protected endpoints require an Authorization header with a Bearer token. The flow is:

1. POST `/api/auth/login` with `{ email, password }`.
2. Store the returned JWT securely in the frontend.
3. Send `Authorization: Bearer <token>` for subsequent requests.

Roles and policies

- `AdminOnly` — admin actions
- `JudgeOnly` / `AdminOrJudge` — score submission and judge actions
- `ViewerOrAbove` — result views

Example: login (fetch)

```javascript
const res = await fetch(`${BASE_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "judge1@missbaguio.com",
    password: "Judge123!",
  }),
});
const body = await res.json();
const token = body.token; // store securely
```

Core endpoints (most-used)

- POST `/api/auth/login` — get JWT
- GET `/api/candidates` — list candidates
- POST `/api/scoring/scores` — submit a score (Judge role)
- GET `/api/results/preliminary` — lightweight preliminary results (aggregated totals)
- GET `/api/results/table/full` — full preliminary table: per-candidate, per-category averages, per-judge scores (including original raw values when imported), per-category weighted contribution and weighted total; recommended for frontend result tables
- GET `/api/results/table?round=preliminary&category=closed_door_interview` — single-category per-judge table
- GET `/api/results/live` — live scoring for the currently active category
- GET `/api/me` — fetch current authenticated user (judge/admin/viewer)

New/important fields to know

- `Score.OriginalScoreValue` (nullable decimal): when scores are imported from the Excel tally, the raw value from the sheet is preserved here (useful for audit). Programmatic/generated scores have this field null.
- `PerCategoryScoreDto.WeightedContribution` (nullable decimal): equals `AverageScore * (WeightPercentage / 100)` for that category; included in `/api/results/table/full`.

Example: Get full preliminary table (fetch)

```javascript
const token = localStorage.getItem("token");
const res = await fetch(`${BASE_URL}/api/results/table/full`, {
  headers: { Authorization: `Bearer ${token}` },
});
const table = await res.json();
// Each row: { candidateId, candidateNo, candidateName, categoryScores: [{ categoryId, categoryName, averageScore, weightPercentage, weightedContribution, judgeScores: [{ judgeId, judgeName, score, originalScore }] }], weightedTotal, rank }
```

Sample category object (excerpt)

```json
{
  "categoryId": 3,
  "categoryName": "creative_costume",
  "averageScore": 7.928571428571429,
  "weightPercentage": 5,
  "weightedContribution": 0.3964,
  "judgeScores": [
    {
      "judgeId": 1,
      "judgeName": "Judge A",
      "score": 8.0,
      "originalScore": null
    },
    {
      "judgeId": 2,
      "judgeName": "Judge B",
      "score": 7.5,
      "originalScore": null
    }
  ]
}
```

SignalR: real-time scoring

Hub URL: `${BASE_URL}/scoringHub`

When connecting from the browser include the JWT as `access_token` in the query string.

Browser client example

```javascript
import * as signalR from "@microsoft/signalr";

const token = localStorage.getItem("token");
const conn = new signalR.HubConnectionBuilder()
  .withUrl(`${BASE_URL}/scoringHub?access_token=${encodeURIComponent(token)}`)
  .withAutomaticReconnect()
  .build();

conn.on("ScoreSubmitted", (payload) => {
  // update UI with payload (candidate/category/judge update)
});

await conn.start();
```

Seeding and importing notes

- The server supports seeding from `tally-sheet.xlsx` (used during development). On startup, the app will import all recognized preliminary sheets when running in `Development` or when `FORCE_SEED=true` is set in the environment (this behavior is wired in `Program.cs`).
- Imported sheets preserve raw values in `OriginalScoreValue` and normalize values for categories that use a 0–100 scale (e.g., closed-door interview, talent) — the normalized values are what's used for averages and totals.

Client-side best practices

- Keep tokens in memory or a secure store; prefer http-only cookies if your frontend and API share a top-level domain.
- Render per-category weights and contributions client-side using `weightedContribution` (already provided) to avoid extra calculation.
- Implement debounce when the UI polls for live data; prefer SignalR push updates instead of polling.

Error handling

- Typical status codes returned: 200, 201, 400, 401, 403, 404, 500.
- For non-2xx responses, read the JSON response and show the `message` to users; for transient 5xx errors, retry with exponential backoff.

Security

- Use HTTPS; never expose `Jwt:SecretKey` to the client.
- Restrict CORS to expected frontend origins in production.

Optional extras

- I can provide a small Postman collection or an OpenAPI snippet for this API. If you want it, say which format and I'll add it under `docs/`.

---

This guide focuses on the most common frontend needs: authentication, retrieving the full preliminary table (per-judge scores + weighted totals), and real-time updates via SignalR.

If you want a short example React component that renders `/api/results/table/full` into a table, I can add that next.
