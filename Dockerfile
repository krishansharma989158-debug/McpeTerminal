# ====================================================================
# Ubuntu GUI Desktop (XFCE4/VNC/noVNC) + PaperMC (Bukkit) + GeyserMC + Terminal Panel
# Optimized for Railway Cloud Deployment & BuildKit
# ====================================================================
FROM --platform=linux/amd64 ubuntu:22.04

LABEL maintainer="Ubuntu RDP & PaperMC Terminal Panel"
LABEL description="Ubuntu Desktop GUI (XFCE4 + noVNC), PaperMC Bukkit Server, GeyserMC Bedrock Bridge, and RDP Terminal Management Panel"

# Prevent interactive prompts during installation & setup base environment
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Etc/UTC \
    USER=root \
    HOME=/root \
    DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=6080 \
    PORT=3000 \
    PAPER_PORT=25565 \
    GEYSER_PORT=19132 \
    PLAYIT_CONFIG_DIR=/root/.config/playit \
    JAVA_HOME=/opt/java \
    PATH="/opt/java/bin:${PATH}"

WORKDIR /app

# 1. Install Base Packages, Desktop Environment (XFCE4), VNC, tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    wget \
    unzip \
    tar \
    git \
    jq \
    nano \
    sudo \
    procps \
    htop \
    net-tools \
    iproute2 \
    openssl \
    libssl3 \
    libcurl4 \
    libcap2-bin \
    libc6 \
    dbus-x11 \
    x11-utils \
    x11-xserver-utils \
    xfce4 \
    xfce4-terminal \
    tigervnc-standalone-server \
    novnc \
    websockify \
    python3 \
    python3-numpy \
    && rm -rf /var/lib/apt/lists/*

# Setup Xauthority & default index for noVNC
RUN touch /root/.Xauthority && \
    mkdir -p /root/.vnc /usr/share/novnc && \
    ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html || true

# 2. Install Eclipse Temurin Java 21 LTS (Required for modern PaperMC 1.20.6 / 1.21.x)
RUN mkdir -p /opt/java && \
    curl -fsSL https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jre_x64_linux_hotspot_21.0.6_7.tar.gz -o /tmp/jre21.tar.gz \
    && tar -xzf /tmp/jre21.tar.gz -C /opt \
    && rm -f /tmp/jre21.tar.gz \
    && ln -s /opt/jdk-21*/* /opt/java/ || true \
    && ln -sf /opt/java/bin/java /usr/local/bin/java || ln -sf /opt/jdk-21*/*/bin/java /usr/local/bin/java || true

# 3. Install Node.js 20 LTS for the Web Terminal & Control Panel
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 4. Install Playit.gg Tunnel Agent
RUN curl -SsL -o /usr/local/bin/playit https://github.com/playit-cloud/playit-agent/releases/download/v0.15.26/playit-linux-amd64 \
    && chmod +x /usr/local/bin/playit

# 5. Prepare Minecraft PaperMC & Bukkit plugins directory
RUN mkdir -p /minecraft-paper /minecraft-paper/plugins /minecraft-paper/logs /minecraft-paper/config
WORKDIR /minecraft-paper

# Accept Minecraft EULA by default for automated Docker deployment
RUN echo "eula=true" > /minecraft-paper/eula.txt

# Create standard server.properties for PaperMC
RUN printf "server-port=25565\nmotd=PaperMC Bukkit Server with GeyserMC\nmax-players=20\nonline-mode=false\ndifficulty=normal\ngamemode=survival\npvp=true\nview-distance=10\nsimulation-distance=5\nspawn-protection=0\nallow-flight=true\nnetwork-compression-threshold=256\n" > /minecraft-paper/server.properties

# 6. Build and Setup Web Terminal Control Panel
WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev --legacy-peer-deps --no-audit

COPY . .
RUN npm run build

# Set production environment for runtime
ENV NODE_ENV=production

# 7. Setup startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose Web Panel (3000), noVNC RDP GUI (6080), VNC (5901), Paper Java (25565), and GeyserMC Bedrock UDP (19132)
EXPOSE 3000 6080 5901 25565 19132/udp

CMD ["/bin/bash", "/start.sh"]
