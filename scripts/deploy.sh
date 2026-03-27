#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# KOL - King of the Oil Lines | Deploy Script
# Target: Ubuntu 24.04 LTS + Nginx + Certbot
# ═══════════════════════════════════════════════════════════
#
# Usage:
#   chmod +x scripts/deploy.sh
#   sudo ./scripts/deploy.sh --domain yourdomain.com --email you@email.com
#
# What this does:
#   1. Installs system deps (Python 3, Nginx, Certbot)
#   2. Creates a 'kol' system user
#   3. Copies project to /opt/kol
#   4. Sets up Python venv & installs pip deps
#   5. Creates .env from .env.example (if not present)
#   6. Creates systemd service for the backend
#   7. Configures Nginx reverse proxy
#   8. Obtains SSL cert via Certbot
#   9. Enables & starts everything
#
set -euo pipefail

# ─── Parse args ───

DOMAIN=""
EMAIL=""
APP_PORT=9000
APP_USER="kol"
APP_DIR="/opt/kol"

usage() {
    echo "Usage: sudo $0 --domain <domain> --email <email> [--port <port>]"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --email)  EMAIL="$2";  shift 2 ;;
        --port)   APP_PORT="$2"; shift 2 ;;
        *)        usage ;;
    esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    usage
fi

if [[ $EUID -ne 0 ]]; then
    echo "Error: This script must be run as root (use sudo)."
    exit 1
fi

echo "═══════════════════════════════════════════════"
echo "  KOL Deploy — $DOMAIN"
echo "═══════════════════════════════════════════════"
echo ""

# ─── 1. System packages ───

echo "[1/9] Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    python3 python3-venv python3-pip \
    nginx certbot python3-certbot-nginx \
    curl git ufw > /dev/null

echo "  Done."

# ─── 2. Create app user ───

echo "[2/9] Setting up app user..."
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$APP_USER"
    echo "  Created user: $APP_USER"
else
    echo "  User $APP_USER already exists."
fi

# ─── 3. Copy project files ───

echo "[3/9] Deploying project to $APP_DIR..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

mkdir -p "$APP_DIR"

# Sync project files (exclude dev artifacts)
rsync -a --delete \
    --exclude='venv/' \
    --exclude='__pycache__/' \
    --exclude='.git/' \
    --exclude='contracts/target/' \
    --exclude='node_modules/' \
    --exclude='*.pyc' \
    --exclude='scripts/deploy.sh' \
    "$PROJECT_ROOT/" "$APP_DIR/"

chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
echo "  Done."

# ─── 4. Python venv & deps ───

echo "[4/9] Setting up Python environment..."
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/venv"
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"
echo "  Done."

# ─── 5. Environment file ───

echo "[5/9] Configuring environment..."
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    cp "$APP_DIR/.env.example" "$ENV_FILE"
    # Generate a random secret key
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET/" "$ENV_FILE"
    sed -i "s/^ENV=.*/ENV=production/" "$ENV_FILE"
    sed -i "s/^PORT=.*/PORT=$APP_PORT/" "$ENV_FILE"
    chown "$APP_USER":"$APP_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "  Created $ENV_FILE (edit to set SOLANA_RPC_URL, KOL_TOKEN_MINT, etc.)"
else
    echo "  $ENV_FILE already exists, skipping."
fi

# ─── 6. Systemd service ───

echo "[6/9] Creating systemd service..."
cat > /etc/systemd/system/kol.service <<EOF
[Unit]
Description=KOL - King of the Oil Lines
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment=PATH=$APP_DIR/venv/bin:/usr/bin
ExecStart=$APP_DIR/venv/bin/uvicorn main:app --host 127.0.0.1 --port $APP_PORT --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kol

# Hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$APP_DIR/backend
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kol --quiet
echo "  Done."

# ─── 7. Nginx config ───

echo "[7/9] Configuring Nginx..."
cat > /etc/nginx/sites-available/kol <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # Static assets — served directly by Nginx for performance
    location /css/ {
        alias $APP_DIR/static/css/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /js/ {
        alias $APP_DIR/static/js/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /img/ {
        alias $APP_DIR/static/img/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /audio/ {
        alias $APP_DIR/static/audio/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Everything else → FastAPI backend
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 90s;
        proxy_buffering off;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
EOF

# Enable site, disable default
ln -sf /etc/nginx/sites-available/kol /etc/nginx/sites-enabled/kol
rm -f /etc/nginx/sites-enabled/default

nginx -t
echo "  Done."

# ─── 8. Firewall ───

echo "[8/9] Configuring firewall..."
ufw allow OpenSSH > /dev/null 2>&1 || true
ufw allow 'Nginx Full' > /dev/null 2>&1 || true
ufw --force enable > /dev/null 2>&1 || true
echo "  Done."

# ─── 9. Start services & SSL ───

echo "[9/9] Starting services & obtaining SSL..."
systemctl restart nginx
systemctl restart kol

# Wait for backend to be ready
echo "  Waiting for backend..."
for i in {1..10}; do
    if curl -sf http://127.0.0.1:$APP_PORT/health > /dev/null 2>&1; then
        echo "  Backend is up."
        break
    fi
    sleep 2
done

# Obtain SSL certificate
echo "  Running Certbot..."
certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domain "$DOMAIN" \
    --redirect

echo ""
echo "═══════════════════════════════════════════════"
echo "  KOL deployed successfully!"
echo "═══════════════════════════════════════════════"
echo ""
echo "  URL:     https://$DOMAIN"
echo "  App:     https://$DOMAIN/app"
echo "  API:     https://$DOMAIN/api/docs"
echo "  Health:  https://$DOMAIN/health"
echo ""
echo "  Service: systemctl status kol"
echo "  Logs:    journalctl -u kol -f"
echo "  Config:  $APP_DIR/.env"
echo ""
echo "  IMPORTANT: Edit $APP_DIR/.env to set:"
echo "    - SOLANA_RPC_URL (use a private RPC for production)"
echo "    - KOL_TOKEN_MINT (your token mint address)"
echo "    - PROGRAM_ID (your deployed Anchor program)"
echo ""
echo "  Then restart: sudo systemctl restart kol"
echo "═══════════════════════════════════════════════"
