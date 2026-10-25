# Email verification

Ported from [Arsh0501/Wissen-Code main](https://github.com/Arsh0501/Wissen-Code/tree/main): Redis OTP logic, verification UI, Gmail OAuth/SMTP transport and OTP request/verify endpoints. Existing registration roles, login, invitation checks and password reset remain in place.

## When and how to use it

Open `/login`, choose **Sign up**, and create a candidate or interviewer account. When mail and Redis are configured, a six-digit verification screen appears. Enter or paste the email code; successful verification records `User.emailVerifiedAt` and continues to the dashboard (or the original invitation).

As in the reference, **Verify later** allows continuing without verification. This confirms mailbox ownership; it does not impose mandatory verification before login or assessment access. Existing accounts are not automatically sent codes on login. The existing profile email-verification link flow remains available.

Codes expire 10 minutes after first issue. Resend is available after 60 seconds and sends the same code without extending its lifetime. Five incorrect attempts lock the code until expiry. Successful verification consumes the code. If email delivery is unconfigured, or OTP setup fails during signup, registration continues as in the reference.

## Configuration

Keep credentials in `server/.env`. A running Redis instance is required:

```dotenv
REDIS_URL=redis://localhost:6379
APP_URL=http://localhost:3000
```

All queued mail (including bulk invitations and verification) uses Nodemailer. Configure Gmail SMTP below or Gmail OAuth. Gmail OAuth takes priority when fully configured. Resend API credentials are no longer used. Restart the backend and worker after changing environment variables.

### Gmail SMTP: Gmail SMTP with an app password

Enable Google account 2-Step Verification and create an App Password, if your account/organization permits it. Use that password, not your normal Google password. This option needs no Resend API key or Google Cloud OAuth client.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-account@gmail.com
SMTP_PASS=your_google_app_password
MAIL_FROM=your-account@gmail.com
MAIL_FROM_NAME=Wissen Code
```

Official instructions: [Google App Passwords](https://support.google.com/mail/answer/185833), [Nodemailer Gmail setup](https://nodemailer.com/guides/using-gmail).

### Alternative: Gmail OAuth (reference's preferred transport)

Create a Google Cloud project and OAuth consent configuration, then a Web application OAuth client. Obtain its client ID and client secret. Authorize the sending Google account with the `https://mail.google.com/` scope and offline access to obtain a refresh token. For a manual setup, use Google's OAuth Playground with your own OAuth credentials and register `https://developers.google.com/oauthplayground` as a redirect URI on the client. Exchange the authorization code for tokens and store the refresh token server-side. Follow your organization's consent/publishing requirements; testing-mode refresh tokens can expire.

```dotenv
GOOGLE_MAIL_USER=your-account@gmail.com
GOOGLE_MAIL_CLIENT_ID=your_client_id
GOOGLE_MAIL_CLIENT_SECRET=your_client_secret
GOOGLE_MAIL_REFRESH_TOKEN=your_refresh_token
MAIL_FROM=your-account@gmail.com
```

Official instructions: [Nodemailer OAuth2](https://nodemailer.com/smtp/oauth2), [Google OAuth Playground](https://developers.google.com/oauthplayground).

## Run and troubleshoot

Run the backend normally, keep Redis available, and run `npm run worker:mail` from `server` in another terminal. Signup attempts immediate delivery through the durable outbox; the worker processes pending retries. A queued/sent OTP response means delivery was scheduled, not that it reached the inbox. Check the provider logs, spam folder, Redis connectivity and outbox errors if a message does not arrive. A retry delayed beyond 10 minutes requires a new code. No actual delivery credentials were changed or emails sent during implementation.

## API

`POST /api/auth/otp/request` with `{ "email": "person@example.com", "purpose": "email-verification" }` requests/resends a code for an existing non-guest account. Unknown accounts receive the same generic response. `POST /api/auth/otp/verify` with that email/purpose and `"code": "123456"` verifies and consumes it. The reference also supports `login` and `password-reset` purpose namespaces, but these endpoints do not issue login sessions or reset passwords, and those workflows were not changed.
