# How I Self-Hosted SigNoz on a Linux Server (And Everything That Went Wrong)

*By [YOUR NAME / HANDLE]*

---

I spent an afternoon self-hosting SigNoz on a bare Linux server. The official docs make it look straightforward. It was not. ZooKeeper 3.8.5 doesn't exist yet, ClickHouse crashed three different ways before it started, and I ended up doing the whole thing twice on two different machines. By the end, I had a fully working observability stack — traces, metrics, logs, dashboards, and alerts — and a much better understanding of what SigNoz actually does once it's running.

This post covers what I did, what broke, and how I fixed it. If you're planning to self-host SigNoz on Linux, this will save you a few hours.

---

## Why Self-Host at All?

SigNoz Cloud exists and works fine. But for the WeMakeDevs x SigNoz hackathon, I wanted to understand the full stack — not just point an SDK at a cloud endpoint. Self-hosting forces you to understand how the pieces fit together: ClickHouse as the storage backend, ZooKeeper for coordination, the OTel Collector as the ingestion layer, and SigNoz itself as the UI and API.

It also means your data stays on your own infrastructure, which matters if you're building anything sensitive.

---

## The Stack

Before starting, here's what you're actually installing:

- **ClickHouse** — columnar database that stores all your traces, metrics, and logs
- **ZooKeeper** — coordination service ClickHouse uses for distributed DDL
- **SigNoz** — the main backend and UI, runs on port 8080
- **SigNoz OTel Collector** — receives telemetry from your apps and writes to ClickHouse

All four need to be running for anything to work.

---

## Step 1: Install ClickHouse

Follow the official ClickHouse install guide to get the package installed. The SigNoz docs say clearly: **do not start the ClickHouse service yet**. I missed this the first time and had to restart with a clean state.

```bash
sudo apt-get install -y clickhouse-server clickhouse-client
```

Do not run `sudo systemctl start clickhouse-server` yet.

---

## Step 2: Install ZooKeeper — Where Things Got Interesting

The SigNoz docs tell you to download ZooKeeper 3.8.5 from the Apache CDN:

```bash
curl -L https://dlcdn.apache.org/zookeeper/zookeeper-3.8.5/apache-zookeeper-3.8.5-bin.tar.gz -o zookeeper.tar.gz
```

This returns a 196-byte HTML 404 page. ZooKeeper 3.8.5 does not exist on that mirror yet. The fix is to use the Apache archive mirror with 3.8.4:

```bash
wget https://archive.apache.org/dist/zookeeper/zookeeper-3.8.4/apache-zookeeper-3.8.4-bin.tar.gz -O zookeeper.tar.gz
tar -xzf zookeeper.tar.gz
```

`archive.apache.org` has every released version. `dlcdn.apache.org` only keeps recent ones. When the docs reference a version that isn't out yet, always fall back to the archive.

### Java is Required

ZooKeeper runs on the JVM. Install it before trying to start ZooKeeper:

```bash
sudo apt update && sudo apt install default-jdk -y
```

I spent 20 minutes debugging a `JAVA_HOME is not set` error before realising Java was never actually installed — only the bash completion for it was.

### Setting Up ZooKeeper as a Service

```bash
sudo mkdir -p /opt/zookeeper /var/lib/zookeeper /var/log/zookeeper
sudo bash -c 'cp -r /home/ubuntu/apache-zookeeper-3.8.4-bin/* /opt/zookeeper/'

sudo bash -c 'cat <<EOF > /opt/zookeeper/conf/zoo.cfg
tickTime=2000
dataDir=/var/lib/zookeeper
clientPort=2181
admin.serverPort=3181
EOF'

sudo bash -c 'cat <<EOF > /opt/zookeeper/conf/zoo.env
ZOO_LOG_DIR=/var/log/zookeeper
JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
EOF'

sudo getent passwd zookeeper >/dev/null || sudo useradd --system --home /opt/zookeeper --no-create-home --user-group --shell /sbin/nologin zookeeper
sudo chown -R zookeeper:zookeeper /opt/zookeeper /var/lib/zookeeper /var/log/zookeeper
```

One more gotcha: the `zoo.env` file needs `JAVA_HOME` set explicitly, otherwise the systemd service can't find Java even if it's in your `$PATH`. Add it to the env file, not just your shell.

Create the systemd service:

```bash
sudo bash -c 'cat <<EOF > /etc/systemd/system/zookeeper.service
[Unit]
Description=Zookeeper
Documentation=http://zookeeper.apache.org

[Service]
EnvironmentFile=/opt/zookeeper/conf/zoo.env
Environment=JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
Type=forking
WorkingDirectory=/opt/zookeeper
User=zookeeper
Group=zookeeper
ExecStart=/opt/zookeeper/bin/zkServer.sh start /opt/zookeeper/conf/zoo.cfg
ExecStop=/opt/zookeeper/bin/zkServer.sh stop /opt/zookeeper/conf/zoo.cfg
ExecReload=/opt/zookeeper/bin/zkServer.sh restart /opt/zookeeper/conf/zoo.cfg
TimeoutSec=30
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl start zookeeper.service
sudo systemctl status zookeeper.service
```

When ZooKeeper is running you'll see `Active: active (running)` with a Java process in the CGroup.

---

## Step 3: Configure ClickHouse to Use ZooKeeper

Now start ClickHouse — but first wire it to ZooKeeper:

```bash
sudo bash -c 'cat <<EOF > /etc/clickhouse-server/config.d/cluster.xml
<clickhouse replace="true">
    <distributed_ddl>
        <path>/clickhouse/task_queue/ddl</path>
    </distributed_ddl>
    <remote_servers>
        <cluster>
            <shard>
                <replica>
                    <host>127.0.0.1</host>
                    <port>9000</port>
                </replica>
            </shard>
        </cluster>
    </remote_servers>
    <zookeeper>
        <node>
            <host>127.0.0.1</host>
            <port>2181</port>
        </node>
    </zookeeper>
    <macros>
        <shard>01</shard>
        <replica>01</replica>
    </macros>
</clickhouse>
EOF'
sudo chown clickhouse:clickhouse /etc/clickhouse-server/config.d/cluster.xml
sudo systemctl start clickhouse-server
```

Verify ClickHouse is up:

```bash
clickhouse-client --password password --query "SELECT 1"
```

If it returns `1`, you're good.

> **Note:** The default ClickHouse install sets the password to `password` (SHA256 hashed). Check `/etc/clickhouse-server/users.d/default-password.xml` if you get an authentication error.

---

## Step 4: Run ClickHouse Migrations

Download the SigNoz OTel Collector binary — you need it for migrations before you need it as a service:

```bash
curl -L https://github.com/SigNoz/signoz-otel-collector/releases/latest/download/signoz-otel-collector_linux_amd64.tar.gz -o signoz-otel-collector.tar.gz
tar -xzf signoz-otel-collector.tar.gz
```

Run the three migrations in order, waiting for each to complete:

```bash
./signoz-otel-collector_linux_amd64/bin/signoz-otel-collector migrate bootstrap \
  --clickhouse-dsn="tcp://localhost:9000?password=password" \
  --clickhouse-replication=true

./signoz-otel-collector_linux_amd64/bin/signoz-otel-collector migrate sync up \
  --clickhouse-dsn="tcp://localhost:9000?password=password" \
  --clickhouse-replication=true

./signoz-otel-collector_linux_amd64/bin/signoz-otel-collector migrate async up \
  --clickhouse-dsn="tcp://localhost:9000?password=password" \
  --clickhouse-replication=true
```

If bootstrap fails with `DDL background thread is not initialized`, ClickHouse started before ZooKeeper was ready. Restart ClickHouse and try again.

---

## Step 5: Install and Start SigNoz

```bash
curl -L https://github.com/SigNoz/signoz/releases/latest/download/signoz_linux_amd64.tar.gz -o signoz.tar.gz
tar -xzf signoz.tar.gz

sudo mkdir -p /opt/signoz /var/lib/signoz
sudo cp -r signoz_linux_amd64/* /opt/signoz

sudo bash -c 'cat <<EOF > /opt/signoz/conf/systemd.env
SIGNOZ_INSTRUMENTATION_LOGS_LEVEL=info
INVITE_EMAIL_TEMPLATE=/opt/signoz/templates/invitation_email_template.html
SIGNOZ_SQLSTORE_SQLITE_PATH=/var/lib/signoz/signoz.db
SIGNOZ_WEB_ENABLED=true
SIGNOZ_WEB_DIRECTORY=/opt/signoz/web
SIGNOZ_JWT_SECRET=secret
SIGNOZ_ALERTMANAGER_PROVIDER=signoz
SIGNOZ_TELEMETRYSTORE_PROVIDER=clickhouse
SIGNOZ_TELEMETRYSTORE_CLICKHOUSE_DSN=tcp://localhost:9000?password=password
DOT_METRICS_ENABLED=true
EOF'

sudo getent passwd signoz >/dev/null || sudo useradd --system --home /opt/signoz --no-create-home --user-group --shell /sbin/nologin signoz
sudo chown -R signoz:signoz /var/lib/signoz /opt/signoz

sudo bash -c 'cat <<EOF > /etc/systemd/system/signoz.service
[Unit]
Description=SigNoz
After=clickhouse-server.service

[Service]
User=signoz
Group=signoz
Type=simple
KillMode=mixed
Restart=on-failure
WorkingDirectory=/opt/signoz
EnvironmentFile=/opt/signoz/conf/systemd.env
ExecStart=/opt/signoz/bin/signoz server

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl start signoz.service
```

Health check:

```bash
curl -X GET http://localhost:8080/api/v1/health
```

Expected output: `{"status":"ok"}`

---

## Step 6: Install the SigNoz OTel Collector as a Service

```bash
sudo mkdir -p /opt/signoz-otel-collector /var/lib/signoz-otel-collector
sudo cp -r signoz-otel-collector_linux_amd64/* /opt/signoz-otel-collector
sudo chown -R signoz:signoz /opt/signoz-otel-collector /var/lib/signoz-otel-collector
```

Create `/opt/signoz-otel-collector/conf/config.yaml` with your pipeline config (receivers, processors, exporters), then:

```bash
sudo bash -c 'cat <<EOF > /opt/signoz-otel-collector/conf/opamp.yaml
server_endpoint: ws://127.0.0.1:4320/v1/opamp
EOF'

sudo systemctl start signoz-otel-collector.service
```

---

## The Feature I Like Most: [YOUR FAVORITE FEATURE]

> **[SCREENSHOT PLACEHOLDER 1]**
> *How to get this screenshot: Open SigNoz at http://YOUR-SERVER-IP:8080, navigate to [Traces / Logs / Dashboards / Alerts — pick your feature], and take a screenshot of what you see. Describe what it shows in a caption below.*
> *Caption: [e.g. "Distributed trace view showing a request flowing through three services"]*

[2-3 paragraphs about your favorite feature. Be specific — what does it show you, why is it useful, what problem does it solve that you couldn't solve before? Reference the screenshot above.]

> **[SCREENSHOT PLACEHOLDER 2]**
> *How to get this screenshot: Navigate deeper into the same feature — click on a specific trace, open a log line, or drill into a metric. Take a screenshot of the detail view.*
> *Caption: [e.g. "Span detail showing exact latency breakdown and attributes"]*

[1-2 more paragraphs continuing on the feature — what surprised you, what would you use it for in a real project?]

---

## Sending Real Data (Demo App)

An empty SigNoz is not very useful. To see traces and logs flowing, run the OpenTelemetry demo app:

```bash
git clone https://github.com/SigNoz/opentelemetry-demo-lite
cd opentelemetry-demo-lite
docker compose up -d
```

Within a few minutes, traces from multiple services start appearing in SigNoz.

> **[SCREENSHOT PLACEHOLDER 3]**
> *How to get this screenshot: After the demo app is running, go to SigNoz → Services (or Traces). You should see multiple services listed. Take a screenshot of the services list or the trace explorer with some traces in it.*
> *Caption: [e.g. "Services view showing the demo app's microservices reporting to SigNoz"]*

> **[SCREENSHOT PLACEHOLDER 4 — OPTIONAL BUT RECOMMENDED]**
> *How to get this screenshot: Click on any trace in the Traces section to open the flame graph / waterfall view. This is the most visually compelling screenshot you can take.*
> *Caption: [e.g. "Flame graph showing a single request broken into spans across services"]*

---

## What I'd Tell My Past Self

**Use `archive.apache.org` instead of `dlcdn.apache.org`.** The CDN only keeps the latest releases. If a version is referenced in docs but returns 404, the archive mirror always has it.

**JAVA_HOME must be in the systemd EnvironmentFile.** Your shell's PATH doesn't carry over into systemd services. I lost time on this.

**Start ClickHouse after ZooKeeper is confirmed running.** If ClickHouse initializes before ZooKeeper is up, the DDL background thread won't start and migrations will fail.

**Run commands one at a time.** I kept having commands concatenate in my terminal — `command1\ncommand2` running as a single broken string. Each command on its own line, wait for the prompt, then run the next.

---

## Conclusion

Self-hosting SigNoz is not plug-and-play, but it's absolutely doable on a single Linux server. The four-service stack (ZooKeeper, ClickHouse, SigNoz, OTel Collector) takes about an hour to get right the first time, mostly because of version mismatches and permission issues the docs gloss over.

Once it's running, [YOUR FAVORITE FEATURE] alone makes it worth the effort — [one sentence on why].

- SigNoz docs: https://signoz.io/docs
- OpenTelemetry demo: https://github.com/SigNoz/opentelemetry-demo-lite
- WeMakeDevs x SigNoz Hackathon: https://www.wemakedevs.org/hackathons/signoz

---

*Written as part of the WeMakeDevs x SigNoz "Agents of SigNoz" hackathon, July 2026.*
