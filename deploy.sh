#!/bin/bash
set -e

echo "=========================================="
echo "  CareIntegrity.AI - Server Deployment"
echo "=========================================="

# Install dependencies
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv nodejs npm nginx certbot python3-certbot-nginx git curl

# Clone or update repo
if [ -d /opt/careintegrity ]; then
    cd /opt/careintegrity && git pull
else
    git clone https://github.com/uozef/careintegrity.net.git /opt/careintegrity
fi
cd /opt/careintegrity

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt
pip install "bcrypt==4.0.1"
deactivate
cd ..

# Frontend setup
cd frontend
npm install --silent
npm run build
cd ..

# Create systemd service
cat > /etc/systemd/system/careintegrity.service << 'SVCEOF'
[Unit]
Description=CareIntegrity.AI NDIS Fraud Detection
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/careintegrity/backend
Environment=PATH=/opt/careintegrity/backend/venv/bin:/usr/local/bin:/usr/bin
ExecStart=/opt/careintegrity/backend/venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable careintegrity
systemctl restart careintegrity

# Wait for backend to start
echo "Waiting for backend to initialize..."
sleep 30

# Configure Nginx
cat > /etc/nginx/sites-available/careintegrity << 'NGXEOF'
server {
    listen 80;
    server_name demo.careintegrity.ai careintegrity.ai www.careintegrity.ai;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
    }
}
NGXEOF

ln -sf /etc/nginx/sites-available/careintegrity /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "=========================================="
echo "  HTTP deployment complete!"
echo "  Now setting up SSL certificate..."
echo "=========================================="

# SSL Certificate
certbot --nginx -d demo.careintegrity.ai --non-interactive --agree-tos --email admin@careintegrity.ai || echo "SSL setup requires DNS to be pointed first"

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "  URL: https://demo.careintegrity.ai"
echo "  Login: admin / NDISAdmin2025!"
echo "=========================================="
