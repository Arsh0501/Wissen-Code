# Render deployment

Use the repository-root `render.yaml` to create a Render Blueprint. It provisions a frontend proxy, private API, AI/grading/mail workers, PostgreSQL 16, and persistent Key Value in Singapore. These are paid plans; review the Render cost estimate before applying.

The frontend proxies both `/api/` and `/socket.io/` over the private network, preserving same-origin API calls and WebSockets. Database migrations run before API and worker deployment. Secrets are generated or entered in Render, never committed.

During Blueprint setup, set `APP_URL` and `CORS_ORIGINS` to the frontend HTTPS URL (no trailing slash). If Render assigns a different hostname, update both API values and sync the Blueprint to refresh worker references. Set your live `JUDGE0_API_URL` and provider key. AI and email keys can be left blank until those features are enabled. Do not use the local mock executor in production.

Provision an administrator privately using the API service shell and Prisma with a unique email and bcrypt password hash. Do not run `db:seed-users` or `db:seed`: they create known demo credentials or replace assessment data. Configure optional SSO/TURN/ATS settings from `production.md` before using those integrations.

After deployment, check `/api/health` and `/api/ready` on the frontend URL, log in, and verify live code execution, an assessment submission, grading, and interview WebSocket connectivity before sharing the site. Render account access is required to apply the Blueprint; adding this file alone does not deploy anything.
