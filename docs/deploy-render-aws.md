# Render frontend and AWS backend: demo deployment

This walkthrough keeps the React frontend on a free Render Static Site. One Ubuntu EC2 instance runs the API/Socket.IO server, PostgreSQL, Redis, AI worker, mail worker, grading worker, private transcription service and Caddy HTTPS proxy. DuckDNS supplies a free backend hostname. Application logic is unchanged.

No AWS resources have been created by preparing these files. The commands below are for you to execute. This creates a NEW, empty cloud database; it does not upload your local database or `.env` automatically.

## 1. Check credits and save the deployment version

Your screenshot shows $120 remaining. In AWS Billing > Credits, open each credit and check its expiration date and applicable services. A credit balance is not a guarantee that every AWS service is free. Check your account plan and enable billing/budget notifications before launching compute. Budgets are alerts, not hard spending caps.

Commit and push the local version you want to deploy, including the reorganized source and these new deployment files, to your chosen GitHub branch. Do not commit `server/.env`, `.env.aws`, private keys, database dumps or candidate data. Render and EC2 only receive pushed commits, not unsaved/local files.

Use the branch containing `compose.aws.yaml` in every step below. The clone example assumes it is `main`.

## 2. Launch an EC2 instance

In AWS Console > EC2 > Launch instance:

| Setting          | Demo selection                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Region           | A region close to your users, for example Mumbai                                                                                                |
| Name             | `wissen-demo-backend`                                                                                                                           |
| AMI              | Ubuntu Server 24.04 LTS, x86_64                                                                                                                 |
| Instance         | Start testing with 2 vCPU / 4 GB RAM; use 8 GB if builds/transcription run out of memory                                                        |
| Example instance | `c7i-flex.large` (4 GiB) for a part-time demo; `m7i-flex.large` (8 GiB) if more memory is needed. Verify account eligibility and regional cost. |
| Storage          | About 40 GB gp3 EBS for images, database and model cache                                                                                        |
| Key pair         | Create/download a `.pem` key and keep it private                                                                                                |
| Public IP        | Enable public IPv4 assignment                                                                                                                   |
| CPU credits      | For burstable T instances, consider Standard mode to avoid surplus CPU-credit charges                                                           |

**Mumbai credit budget (checked 27 October 2026):** the official Linux On-Demand rates are $0.08479/hour for `c7i-flex.large` and $0.10075/hour for `m7i-flex.large`. Compute alone for 30 days continuously is about $61.05 or $72.54 respectively, before storage, public IPv4, traffic and any other charges. At 6 hours/day, compute falls to about $15.26 or $18.14/month. For a $120 demo budget, run only during testing and stop the EC2 instance afterwards; do not assume the credits cover two months of continuous full-stack operation. Confirm the credit expiry and other account usage. [Official Mumbai pricing feed](https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/Asia%20Pacific%20%28Mumbai%29/Linux/index.json).

Do not assume a micro instance can handle the complete stack. Resource sizing is a starting estimate, not a performance guarantee. You do not need RDS, ElastiCache, a load balancer or a NAT Gateway for this single-server demo.

Allow these inbound security-group rules:

| Port            | Source      |
| --------------- | ----------- |
| TCP 22 / SSH    | My IP only  |
| TCP 80 / HTTP   | `0.0.0.0/0` |
| TCP 443 / HTTPS | `0.0.0.0/0` |

Do not expose 4001, 5432, 6379 or 8765. Keep the default outbound access so the backend can contact Gmail SMTP, Judge0, your LLM provider, image registries and the model download service. Ports 80/443 here handle HTTPS and Socket.IO signaling; a TURN relay would require its own network configuration.

## 3. Reserve a free DuckDNS hostname

Sign in at <https://www.duckdns.org/>, choose an available name such as `your-unique-wissen-demo`, and set its IPv4 address to the EC2 instance's public IPv4 address. The backend hostname will be:

```text
your-unique-wissen-demo.duckdns.org
```

DuckDNS may initially suggest the IP address of your own PC. Replace it with the EC2 public IP. Leave IPv6 empty unless you have deliberately configured IPv6 on EC2. Do not share the DuckDNS account token.

The normal EC2 public IP can change after stop/start. For this demo, update DuckDNS whenever that happens. An Elastic IP can provide a stable address, but inspect public IPv4 charges first.

## 4. Create the Render frontend

Render Dashboard > New > Static Site (not a Web Service and not the existing full-stack Blueprint). Connect `Arsh0501/Wissen-Code` and use:

| Field             | Value                                     |
| ----------------- | ----------------------------------------- |
| Branch            | The branch containing the code you pushed |
| Root Directory    | `client`                                  |
| Build Command     | `npm ci && npm run build`                 |
| Publish Directory | `dist`                                    |

Add these frontend environment variables, replacing the hostname:

```dotenv
NODE_VERSION=22
VITE_API_URL=https://your-unique-wissen-demo.duckdns.org/api
VITE_SOCKET_URL=https://your-unique-wissen-demo.duckdns.org
```

`VITE_API_URL` ends in `/api`. `VITE_SOCKET_URL` is the backend origin without `/api`. These are public URLs, not secrets. Never put SMTP passwords, database credentials, JWT secrets or AI keys in frontend variables.

Create the site. Its initial build can finish before the backend is available, but API features will fail until AWS is ready. Copy the EXACT Render site URL, for example `https://your-wissen-demo.onrender.com`.

In Redirects/Rewrites, add:

| Source | Destination   | Action  |
| ------ | ------------- | ------- |
| `/*`   | `/index.html` | Rewrite |

This enables direct navigation and refresh on routes such as `/login` and `/admin/interviews`. The browser connects directly to the AWS HTTPS backend; the SPA rewrite is not an API/WebSocket proxy. Redeploy the frontend whenever its `VITE_*` values change.

## 5. Connect to EC2 and install Docker

In your Windows PowerShell terminal, replace the private-key path and IP:

```powershell
ssh -i "C:\path\to\wissen-demo.pem" ubuntu@YOUR_EC2_PUBLIC_IP
```

Alternatively use EC2 > Connect > EC2 Instance Connect if available. The following commands run in the Ubuntu SSH terminal, not your Windows project terminal.

Install Git, Python and Docker from Docker's official Ubuntu repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git python3
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker compose version
```

Clone the deployment branch:

```bash
git clone --branch main https://github.com/Arsh0501/Wissen-Code.git
cd Wissen-Code
test -f compose.aws.yaml
```

If that last command fails, the chosen branch does not yet contain the new deployment files. Push them before continuing. Do not use `start-project.cmd` or `npm run dev:all` on EC2; those are development launchers.

## 6. Configure AWS environment variables

```bash
cp deployment/aws/.env.example .env.aws
chmod 600 .env.aws
nano .env.aws
```

The template lists all variables. Set at least:

```dotenv
API_HOST=your-unique-wissen-demo.duckdns.org
APP_URL=https://your-wissen-demo.onrender.com
CORS_ORIGINS=https://your-wissen-demo.onrender.com

POSTGRES_PASSWORD=YOUR_NEW_HEX_PASSWORD
DATABASE_URL=postgresql://wissen:YOUR_NEW_HEX_PASSWORD@postgres:5432/wissen_code?schema=public
JWT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
MONITORING_TOKEN=ANOTHER_RANDOM_SECRET

AI_PROVIDER=groq
GROQ_API_KEY=YOUR_WORKING_GROQ_KEY
GROQ_MODEL=YOUR_WORKING_MODEL_NAME
JUDGE0_API_URL=https://ce.judge0.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sender@gmail.com
SMTP_PASS="your-google-app-password-without-spaces"
MAIL_FROM=your-sender@gmail.com
MAIL_FROM_NAME="Wissen Code"

TRANSCRIPTION_TOKEN=ANOTHER_LONG_RANDOM_SECRET
WHISPER_MODEL=base.en
WHISPER_LANGUAGE=en
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

Generate a fresh secret with `openssl rand -hex 32`, separately for each secret. A hexadecimal database password avoids URL-escaping mistakes. Put the SAME database password in `POSTGRES_PASSWORD` and `DATABASE_URL`. Do not use the local `localhost:5432/wissendb` URL in containers: the new database hostname is `postgres`.

`API_HOST` is a hostname without `https://`. `APP_URL` and `CORS_ORIGINS` are the frontend HTTPS origin without a trailing slash. Invitation/recovery emails must open the frontend, not the API hostname. Choose the AI provider and working model already used locally; if using OpenAI, set its key/model instead. Question-set generation separately requires a Groq key.

The AWS Compose file sets production mode, live Judge0 mode, asynchronous grading, Redis and the private transcription URL consistently. All server processes receive the SMTP settings. The Python service shares only the API's network namespace, so its existing `127.0.0.1:8765` listener remains private and needs no application-code changes.

## 7. Build and start the AWS stack

Define a convenience command for this SSH session:

```bash
dc() { sudo docker compose --env-file .env.aws -f compose.aws.yaml "$@"; }
dc config --quiet
dc build
dc up -d
dc ps -a
dc logs --tail=80 api ai-worker mail-worker grading-worker transcription edge
```

Repeat the `dc()` definition when reconnecting through SSH. The schema migration service runs before the API/workers. It should exit with code 0; that is normal. PostgreSQL/Redis and long-running application services should stay running. First-time model downloading/loading can delay transcription health by several minutes.

Caddy obtains and renews a public HTTPS certificate for the DuckDNS hostname, provided DNS points to EC2 and ports 80/443 are reachable. Do not bypass certificate errors in the browser.

Check backend readiness from your PC or EC2:

```bash
curl -fsS https://your-unique-wissen-demo.duckdns.org/api/health
curl -fsS https://your-unique-wissen-demo.duckdns.org/api/ready
```

`/api/ready` verifies database and Redis connectivity. Verify transcription separately:

```bash
dc exec -T api node -e "fetch('http://127.0.0.1:8765/health').then(r=>r.text()).then(console.log)"
```

## 8. Create the first administrator

This deployment starts with no users. Do not publish the hardcoded demo accounts from the development seed. The deployment includes a one-time tool that creates one admin without modifying any existing account.

Run this in your interactive SSH terminal. It asks for an email and a new password of at least 12 characters; neither is echoed or placed in command arguments/history:

```bash
sudo -v
python3 -c 'import getpass,json; print(json.dumps({"email":getpass.getpass("Admin email (hidden): "),"password":getpass.getpass("Admin password (12+ characters): ")}))' | dc run --rm -T bootstrap-admin
```

Open the Render site and log in with those credentials. Then create/invite the other users through the existing UI. If you want your existing local accounts, assessments and reports instead, migrate a PostgreSQL backup deliberately; deploying the repository alone does not transfer database records. Use compatible PostgreSQL tools, protect the dump, and do not import data while users are writing to the destination. This setup uses PostgreSQL 18; a local PostgreSQL 18 dump is compatible at the major-version level.

## 9. Test the complete flow

1. Refresh `/login` and another frontend route directly; both must load.
2. Log in, create an assessment, and run/submit sample code. Verify grading completes.
3. Send one invitation to a mailbox you control. Check mail-worker logs and recipient spam folders.
4. Test signup OTP delivery and password recovery.
5. Join an interview with separate interviewer/candidate accounts, verify Socket.IO, shared code and call signaling.
6. Try a call between two DIFFERENT networks. STUN alone does not guarantee connectivity through restrictive NAT/firewalls; configure a TURN relay if needed. TURN relay costs are separate from this configuration.
7. Start transcription with consent and check recognized text.
8. Request an AI follow-up/observation, complete feedback, and download the PDF.

LLM/Judge0 provider permissions, quotas and billing remain separate from EC2 credits. This guide configures the service connections; it does not guarantee those providers will accept every request.

## Operations, updates and backups

On EC2, inspect failures with `dc logs --tail=100 SERVICE_NAME`. A failed AI-provider call, Gmail restriction or slow speech model is different from an unreachable API. Out-of-memory kills require more RAM or a lighter workload.

Create a database backup before updates (keep an additional encrypted copy off the EC2 instance):

```bash
mkdir -p backups
chmod 700 backups
umask 077
dc exec -T postgres pg_dump -U wissen -d wissen_code --format=custom > "backups/wissen-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

For an intentional demo update, schedule brief downtime:

```bash
git pull --ff-only
dc build
dc down
dc up -d
dc ps -a
```

`dc down` stops this stack while preserving named volumes. It also ensures the private transcription network is recreated with the API. **Never add `--volumes` or `-v`** unless you intentionally want to delete the database/cache/model/certificate volumes. Updating application files should not delete data.

When not demonstrating, stop the EC2 instance to reduce compute usage. EBS storage, public IPv4 allocations and other retained resources can still cost money. After restarting, check the public IP and update DuckDNS if needed. Back up before terminating an instance: Docker volumes on its root EBS disk are not an off-instance backup.

## Reference material

- [AWS EC2 launch/connect guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html)
- [AWS credit eligibility and expiry](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html)
- [Render static sites](https://render.com/docs/static-sites)
- [Render SPA rewrite rules](https://render.com/docs/redirects-rewrites)
- [Docker installation on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/)
- [DuckDNS setup](https://www.duckdns.org/install.jsp)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [PostgreSQL image volume conventions](https://hub.docker.com/_/postgres)
