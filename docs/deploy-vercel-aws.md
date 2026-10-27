# Vercel frontend and AWS backend: complete demo deployment

This walkthrough keeps the React frontend on a Vercel deployment of the static Vite build. One Ubuntu EC2 instance runs the API/Socket.IO server, PostgreSQL, Redis, AI worker, mail worker, grading worker, private transcription service and Caddy HTTPS proxy. DuckDNS supplies a free backend hostname. Application logic is unchanged.

No AWS resources have been created by preparing these files. The commands below are for you to execute. This creates a NEW, empty cloud database; it does not upload your local database or `.env` automatically.

## 1. Check credits and save the deployment version

Vercel Hobby is for personal, non-commercial use. Company hiring use may require Vercel Pro; a demo written for an employer is not automatically eligible for Hobby. Check <https://vercel.com/docs/limits/fair-use-guidelines> before choosing the plan. AWS credits cover eligible AWS services only, not a Vercel plan or external AI services.

You need your existing AWS/Vercel/GitHub accounts and one additional free DuckDNS account. No separate managed-database or Redis account is needed. PostgreSQL and Redis run on EC2. Gmail/AI/Judge0 use the existing configured providers.

Your screenshot shows $120 remaining. In AWS Billing > Credits, open each credit and check its expiration date and applicable services. A credit balance is not a guarantee that every AWS service is free. Check your account plan and enable billing/budget notifications before launching compute. Budgets are alerts, not hard spending caps.

Commit and push the local version you want to deploy, including the reorganized source and these new deployment files, to your chosen GitHub branch. Do not commit `server/.env`, `.env.aws`, private keys, database dumps or candidate data. Vercel and EC2 only receive pushed commits, not unsaved/local files.

Use the branch containing `compose.aws.yaml` in every step below. Your current local branch is `feature/interview`, so the examples use it. If you deliberately deploy a different branch, replace it consistently in Git commands, Vercel production tracking and the EC2 clone.

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

## 4. Configure and publish the Vercel frontend

### Edit the deployment configuration on your local PC

Open `client/vercel.json`. Replace `replace-with-your-name.duckdns.org` in the API rewrite destination with the actual hostname you reserved. Do not add a second `/api` segment or remove the trailing `:path*`. This rewrite supports existing frontend-relative API download and SSO links. The final SPA rewrite supports refreshing nested application routes. Socket.IO connects directly to AWS instead of going through a Vercel rewrite.

In your local PowerShell terminal:

```powershell
cd C:\Users\Wissen\Desktop\Wissen-Code-all-new-wissen-code
git branch --show-current
git status
git add .
git diff --cached --name-only
```

Review the staged list. It must not include `.env` files, private keys, candidate data, temporary files or database backups. The example environment files are intentional templates. `server/.env` and `.env.aws` are ignored by Git; check with `git check-ignore server/.env .env.aws`. If an actual secret file is already tracked, unstage it and correct tracking before pushing.

```powershell
git commit -m "Prepare Vercel frontend and AWS demo deployment"
git push -u origin feature/interview
```

If your branch name differs, push that branch instead. If Git says nothing to commit, the files may already be committed; still verify the remote contains them. If the push is rejected, stop and resolve the rejection normally; do not force-push as part of deployment.

### Import the project

1. Sign in at <https://vercel.com/>.
2. Click **Add New > Project** and connect GitHub if it is not connected.
3. Authorize access to `Arsh0501/Wissen-Code`, then click **Import**.
4. Name the project, for example `wissen-demo` (the exact available name determines your frontend URL).
5. Set these build settings:

| Field            | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| Framework Preset | Vite                                                  |
| Root Directory   | `client`                                              |
| Install Command  | `npm ci`                                              |
| Build Command    | `npm run build`                                       |
| Output Directory | `dist`                                                |
| Node.js Version  | 22.x, under Project Settings if not offered on import |

6. Add these environment variables for **Production** and **Preview**, replacing the hostname:

```dotenv
VITE_API_URL=https://your-unique-wissen-demo.duckdns.org/api
VITE_SOCKET_URL=https://your-unique-wissen-demo.duckdns.org
```

`VITE_API_URL` ends in `/api`. `VITE_SOCKET_URL` is only the backend origin, without `/api`. Vite exposes these URLs publicly in the browser bundle; do not add database passwords, JWT secrets, AI keys or SMTP credentials here.

7. Create the project. If its initial deployment comes from `main`, do not treat that as the intended final version yet.
8. Open **Project Settings > Environments > Production > Branch Tracking**, set **`feature/interview`**, and save. Use the same branch that you pushed. Then use **Deployments > Create Deployment** to deploy that branch, or make your next normal push to trigger it. If the dashboard uses slightly different labels, select the production-branch setting and confirm the deployment's commit SHA matches your pushed commit.
9. Wait for the build to finish. The frontend can build before AWS is ready; login and API features will fail until the backend is running.
10. In **Settings > Domains**, copy the stable production hostname, for example `https://wissen-demo.vercel.app`. Do not use a changing commit-preview URL in the AWS environment.
11. If you want other people to open the demo, verify deployment protection allows access to the intended visitors. Keep protection on any preview that contains private test data. Production and previews have different protection settings.

The `client/vercel.json` file already includes the SPA rewrite. Do not paste Vercel configuration into the repository root: Vercel's project root here is `client`.

If your hostname changes, update both `VITE_*` variables and the `/api` rewrite destination, then redeploy. Existing deployments do not automatically receive new Vite build-time values. For cross-origin preview testing, add only the exact desired preview origin to backend CORS rather than allowing every `*.vercel.app` origin.

## 5. Connect to EC2 and install Docker

Wait until the EC2 instance is **Running** and its status checks pass. Copy its public IPv4 address from the instance details. Keep the downloaded private key on your PC; do not upload it into the application repository.

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
git clone --branch feature/interview https://github.com/Arsh0501/Wissen-Code.git
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
APP_URL=https://your-wissen-demo.vercel.app
CORS_ORIGINS=https://your-wissen-demo.vercel.app

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

Open the Vercel site and log in with those credentials. Then create/invite the other users through the existing UI. If you want your existing local accounts, assessments and reports instead, migrate a PostgreSQL backup deliberately; deploying the repository alone does not transfer database records. Use compatible PostgreSQL tools, protect the dump, and do not import data while users are writing to the destination. This setup uses PostgreSQL 18; a local PostgreSQL 18 dump is compatible at the major-version level.

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

## 10. Optional free-software TURN relay for calls across networks

First try the video call on two different networks. If direct WebRTC fails, you can run Coturn on the SAME EC2 instance without registering another provider account. The software is free; relayed bandwidth and EC2 resources still consume your AWS credits. This is a basic authenticated demo relay, not a guarantee of connectivity through every corporate firewall.

In the EC2 instance details, copy BOTH its public IPv4 and private IPv4. Edit `.env.aws` and add:

```dotenv
TURN_PUBLIC_IP=YOUR_EC2_PUBLIC_IPV4
TURN_PRIVATE_IP=YOUR_EC2_PRIVATE_IPV4
TURN_USERNAME=wissen-demo
TURN_PASSWORD=YOUR_SEPARATE_RANDOM_HEX_PASSWORD
```

Generate a separate long password with `openssl rand -hex 32`. Do not reuse the SMTP, admin or database password. Replace the existing `WEBRTC_ICE_SERVERS` value with this single line, substituting the same DuckDNS hostname and TURN credentials:

```dotenv
WEBRTC_ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:your-unique-wissen-demo.duckdns.org:3478?transport=udp","turn:your-unique-wissen-demo.duckdns.org:3478?transport=tcp"],"username":"wissen-demo","credential":"YOUR_SEPARATE_RANDOM_HEX_PASSWORD"}]'
```

These TURN credentials are deliberately delivered to interview participants' browsers so WebRTC can authenticate to the relay. Use dedicated demo credentials, rotate them after the demonstration and do not use this simple static-credential setup as your final production credential system.

Add these EC2 security-group inbound rules only when enabling TURN:

| Protocol/port   | Source      |
| --------------- | ----------- |
| UDP 3478        | `0.0.0.0/0` |
| TCP 3478        | `0.0.0.0/0` |
| UDP 49160-49200 | `0.0.0.0/0` |

The small relay range is for a low-user demo. Keep PostgreSQL, Redis, the raw API and transcription ports private. This overlay uses Linux host networking and must run on the Ubuntu EC2 host, not as a local Windows networking workaround.

Redefine `dc` to include the TURN overlay, then recreate the demo stack so the API receives the changed ICE configuration:

```bash
dc() { sudo docker compose --env-file .env.aws -f compose.aws.yaml -f compose.turn.yaml "$@"; }
dc config --quiet
dc down
dc up -d
dc logs --tail=50 turn
```

Rejoin the call in both browsers after restarting. From now on use this two-file `dc()` definition for updates, logs and shutdown, including after reconnecting by SSH. Update `TURN_PUBLIC_IP` and DuckDNS after any EC2 public-IP change. This configuration does not enable TURN TLS on port 443/5349; networks that block ordinary TURN UDP/TCP may require a separately configured TLS-capable relay.

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
git pull --ff-only origin feature/interview
dc build
dc down
dc up -d
dc ps -a
```

`dc down` stops this stack while preserving named volumes. It also ensures the private transcription network is recreated with the API. **Never add `--volumes` or `-v`** unless you intentionally want to delete the database/cache/model/certificate volumes. Updating application files should not delete data.

When not demonstrating, stop the EC2 instance to reduce compute usage. EBS storage, public IPv4 allocations and other retained resources can still cost money. After restarting, check the public IP and update DuckDNS if needed. Back up before terminating an instance: Docker volumes on its root EBS disk are not an off-instance backup.

## Troubleshooting the first deployment

| Symptom                                               | First checks                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Vercel build cannot find `package.json`               | Root Directory must be `client`; install/build commands run there                                               |
| Vercel shows the old layout or lacks deployment files | Inspect the deployment's branch/commit; set Production Branch Tracking to the branch you actually pushed        |
| Refreshing `/login` gives 404                         | Ensure `client/vercel.json` was committed and deployed                                                          |
| Login fails with CORS/network errors                  | Check HTTPS certificate, both `VITE_*` URLs and exact `CORS_ORIGINS`; redeploy after changing Vite variables    |
| Download/SSO links return the SPA or fail             | Replace the API rewrite hostname in `client/vercel.json`; keep the API rewrite before the catch-all SPA rewrite |
| Resume/question/PDF fetch is unauthorized             | Log in again; inspect the response in browser DevTools rather than disabling authorization                      |
| Browser receives 502 or certificate error             | Check DuckDNS IPv4, inbound 80/443, `dc ps -a` and `dc logs --tail=100 edge api`                                |
| `/api/ready` returns 503                              | Inspect `dc logs --tail=100 postgres redis migrate api`; verify the two database passwords match                |
| Email stays queued                                    | Inspect `dc logs --tail=100 mail-worker`; verify the Gmail app password and outbound SMTP access                |
| Grading stays pending                                 | Inspect `dc logs --tail=100 grading-worker`; verify live Judge0 availability and quota                          |
| Transcription is unavailable                          | Wait for model loading; check `dc logs --tail=100 transcription` and its private health endpoint                |
| Video connects only on some networks                  | Configure a TURN relay and verify UDP/TCP reachability; HTTPS signaling alone does not relay the media          |
| SSH times out                                         | Verify instance status, public IP and the SSH rule's current My IP address                                      |

Do not paste environment files, private keys, passwords or provider tokens into public logs/issues. Do not run automated development fixture tests against the deployed database.

## What is covered by free services and what is not

- DuckDNS hostname: free.
- Caddy certificates, PostgreSQL, Redis, Docker Engine, faster-whisper and Coturn software: no per-use software fee; you operate them on EC2.
- Vercel: Hobby only if your use qualifies; otherwise choose a paid plan. Usage limits still apply.
- AWS: eligible charges use the credit balance until expiry/exhaustion; EC2, EBS, public IPv4 and traffic are resources to monitor.
- Gmail: account sending limits and organization policies still apply.
- LLM and Judge0: their own permissions, rate limits, free allowances or bills apply; AWS promotional credit does not pay external-provider bills.

## Reference material

- [AWS EC2 launch/connect guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html)
- [AWS credit eligibility and expiry](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/useconsolidatedbilling-credits.html)
- [Vercel Vite deployment](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel rewrites](https://vercel.com/docs/routing/rewrites)
- [Vercel production branch settings](https://vercel.com/docs/git)
- [Vercel Hobby fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines)
- [Docker installation on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/)
- [DuckDNS setup](https://www.duckdns.org/install.jsp)
- [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [PostgreSQL image volume conventions](https://hub.docker.com/_/postgres)

- [Coturn Docker configuration](https://github.com/coturn/coturn/blob/master/docker/coturn/README.md)
