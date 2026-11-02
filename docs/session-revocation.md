# Administrator session revocation

Open Admin > Team Access, search by email or name, and choose Log out all devices for the account. The confirmation identifies the email and warns about ongoing assessments. Guest accounts are included; this action does not add guest recovery or allow a second admission to the same assessment.

POST /api/users/:id/revoke-sessions requires an authenticated administrator. It locks the affected User row (the same lock used for login), deletes all UserSession rows, and records actor ID, target ID, count, and timestamp in SessionRevocationAudit in the same transaction. It then disconnects Socket.IO connections in the user's authentication room; the existing Redis adapter propagates this across backend instances. Database-backed authentication rejects deleted sessions on subsequent HTTP requests and refresh attempts. Requests already executing are not rolled back. Revocation does not disable the account: a later normal login creates a new session.

Accounts, passwords, invitation participation, assessment attempts, original deadlines, and results are preserved. Existing active assessments can be resumed after a registered user signs in again, subject to the original deadline. Guests cannot recover a lost session for the same assessment with the current flow. A valid subsequent login after revocation is intentionally allowed. Administrators can revoke their own sessions as well and will need to sign in again.

The Accounts table shows non-expired login-session counts and searches up to 200 matching accounts per query. Audit records are durable and remain after account deletion; they do not contain JWTs, refresh tokens, or passwords.

Deploy the additive migration 20261102010000_session_revocation_audit with the backend before using the frontend action. AWS Compose's migration service applies it during the established deployment process. Redeploy the frontend on Vercel for the new button and interview confirmation dialog. Local migration and verification do not update production automatically.
