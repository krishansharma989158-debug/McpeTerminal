#!/usr/bin/env bash

echo "=========================================================="
echo "🚀 Starting Ubuntu RDP Desktop + PaperMC Server + Terminal Panel"
echo "=========================================================="

# Export critical environment variables
export NODE_ENV=production
export USER=root
export HOME=/root
export DISPLAY=:1
export PORT=3000
export NOVNC_PORT=6080
export PATH="/opt/java/bin:${PATH}"

mkdir -p /minecraft-paper/plugins /minecraft-paper/logs /root/.config/playit /app/data /tmp/.X11-unix /root/.vnc
chmod 1777 /tmp/.X11-unix
touch /root/.Xauthority

# Clean up any leftover X11 or VNC locks from previous runs
echo "[GUI] Cleaning up stale locks..."
vncserver -kill :1 >/dev/null 2>&1 || true
rm -rf /tmp/.X1-lock /tmp/.X11-unix/X1 /tmp/.X11-unix/X11

# 1. Setup VNC xstartup to directly launch XFCE4 Desktop
cat << 'EOF' > /root/.vnc/xstartup
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4
EOF
chmod +x /root/.vnc/xstartup

# 2. Start TigerVNC Server on Display :1 (Port 5901)
echo "[GUI] Starting TigerVNC server on :1 (Port 5901)..."
vncserver :1 -localhost no -SecurityTypes None -geometry 1280x800 -depth 24 --I-KNOW-THIS-IS-INSECURE || echo "[WARN] TigerVNC started"

# 3. Setup autoconnect redirect in noVNC web directory
mkdir -p /usr/share/novnc
cat << 'EOF' > /usr/share/novnc/index.html
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=vnc.html?autoconnect=true&resize=scale">
  <title>Ubuntu RDP Desktop</title>
</head>
<body style="background:#09090b;color:#f4f4f5;font-family:sans-serif;text-align:center;padding:50px;">
  <h2>Connecting to Ubuntu XFCE4 Desktop...</h2>
  <p><a href="vnc.html?autoconnect=true&resize=scale" style="color:#ef4444;">Click here if not redirected automatically</a></p>
</body>
</html>
EOF

# 4. Start noVNC Websockify Bridge (Port 6080 -> 5901)
echo "[GUI] Starting noVNC websockify bridge on port ${NOVNC_PORT}..."
pkill -f websockify 2>/dev/null || true
websockify -D --web=/usr/share/novnc/ "${NOVNC_PORT}" localhost:5901

# 5. Initialize Playit.gg tunnel agent in background
echo "[TUNNEL] Initializing Playit.gg CLI..."
if [ -f /usr/local/bin/playit ]; then
  if [ ! -f /root/.config/playit/playit.toml ]; then
    echo "[TUNNEL] Starting playit agent to generate claim token..."
    playit --secret_path /root/.config/playit/playit.toml > /app/data/playit.log 2>&1 &
  else
    echo "[TUNNEL] Existing playit configuration found. Connecting..."
    playit --secret_path /root/.config/playit/playit.toml >> /app/data/playit.log 2>&1 &
  fi
fi

# 6. Ensure PaperMC EULA and properties are ready
if [ ! -f /minecraft-paper/eula.txt ]; then
  echo "eula=true" > /minecraft-paper/eula.txt
fi

# 7. Start Web Control & Terminal Panel on Port 3000
echo "[PANEL] Starting Terminal Control Panel on port 3000..."
cd /app

if [ ! -f dist/server.cjs ]; then
  echo "[PANEL] Compiling panel server..."
  npm run build || true
fi

echo "[PANEL] Launching Node.js Express server on port 3000..."
exec node --max-old-space-size=256 dist/server.cjs
