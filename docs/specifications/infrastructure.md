# Infrastructure Specification

## 1. 目的

このドキュメントでは、Personal DeskにおけるInfrastructure関連のDomain概念と共通ルールを定義する。

対象:

- System
- Service
- Backup
- Alert
- Infrastructure Status
- Stale
- Overall Status
- Activityとの関係

画面上の表示方法は`docs/ui/infrastructure.md`で定義する。

具体的な監視方式やDatabase実装は`docs/architecture/`で定義する。

---

# 2. Infrastructureの基本方針

Personal DeskにおけるInfrastructure機能は、詳細なMonitoring Platformそのものではなく、

- 現在正常か
- 異常があるか
- どこに問題があるか
- Backupが成功しているか
- 現在対応すべきAlertがあるか

を短時間で判断するための集約情報を扱う。

Historical Metricsや詳細分析はGrafana等の外部Monitoring Toolに委譲する。

---

# 3. System

## 3.1 定義

Systemは、Infrastructure上で独立して監視する物理MachineまたはVirtual Machineを表す。

例:

- VPS
- Raspberry Pi
- NAS
- Windows PC
- Additional VPS

SystemはServiceの実行Hostになり得る。

---

## 3.2 Systemが持つ概念

Systemは最低限以下を持つ。

- Stable ID
- Name
- Status
- Last successful check
- Optional description
- Optional monitoring resource
- Optional summary metrics

### Summary Metrics

v0.1では主に以下を想定する。

- CPU usage
- Memory usage
- Disk usage

---

## 3.3 System Status

Systemは共通Infrastructure Statusを使用する。

```text id="w4uxop"
healthy
warning
down
unknown
stale
```

---

# 4. Service

## 4.1 定義

Serviceは、System上または外部環境上で提供される、独立して状態確認するApplicationやInfrastructure Serviceを表す。

例:

- Immich
- Nextcloud
- PostgreSQL
- Traefik
- Prometheus
- Grafana

---

## 4.2 Systemとの関係

Serviceは原則として0または1つのPrimary Host Systemに関連付ける。

例:

```text id="i3bh8c"
Immich
→ VPS
```

ただし、将来的にClusterや外部Managed Serviceを扱う可能性があるため、Host Systemを必須にはしない。

---

## 4.3 Service Status

Serviceも共通Infrastructure Statusを使用する。

```text id="ujv2jj"
healthy
warning
down
unknown
stale
```

---

# 5. Backup

## 5.1 定義

Backupは、特定のDataまたはServiceに対して実行されるBackup JobまたはBackup Policyの現在状態を表す。

例:

- Immich Backup
- Nextcloud Backup
- Database Backup

---

## 5.2 Backupが持つ概念

最低限以下を扱う。

- Name
- Current Status
- Last Attempt
- Last Successful Backup
- Optional error summary
- Optional related System
- Optional related Service

---

## 5.3 Backup Status

BackupはInfrastructure Statusとは別に、以下のStatusを使用する。

```text id="yuayur"
success
failed
running
unknown
stale
```

### success

最後の実行が正常に成功し、Backup Policy上期待されるFreshnessを満たしている。

### failed

最後のBackup attemptが失敗している。

### running

Backupが現在実行中である。

### unknown

現在のBackup状態を判断できない。

例:

- Providerから状態を取得できない
- 初回同期前
- 必要なMetadataが不足している

### stale

最後のBackup自体は成功している可能性があるが、期待されるBackup間隔を超えて新しい成功が確認できていない。

---

# 6. Alert

## 6.1 定義

Alertは、現在または過去にInfrastructure上で発生した、ユーザーが認識すべき異常・警告状態を表す。

AlertはCurrent StateとHistoryの橋渡しになる。

---

## 6.2 Alert Severity

v0.1では以下を使用する。

```text id="x5q4r8"
warning
critical
```

### warning

即時停止ではないが、確認・対応が推奨される状態。

例:

- Disk usage 85%
- Backup delay
- Service response degraded

### critical

重大な障害または強い対応必要性がある状態。

例:

- Service down
- Backup failed repeatedly
- Critical disk exhaustion
- Monitoring target unreachable with confirmed outage

---

## 6.3 Alert State

Alertは少なくとも以下のStateを持つ。

```text id="87j1xs"
active
resolved
```

### active

現在も問題が継続している。

### resolved

問題が解消している。

---

## 6.4 Active Alert

Infrastructure画面に表示するのは原則として`active` Alertのみ。

Resolved AlertはActivity History側で確認する。

---

# 7. Infrastructure Status

## 7.1 共通Status

System / Serviceで共通利用するStatus:

```text id="rm4cvi"
healthy
warning
down
unknown
stale
```

---

## 7.2 healthy

監視結果から正常動作が確認でき、Freshness要件も満たしている。

例:

- Health check success
- Metrics取得成功
- 直近確認がStale threshold以内

---

## 7.3 warning

対象は利用可能だが、注意が必要な状態が確認されている。

例:

- Disk usage threshold超過
- Performance degradation
- Non-critical health warning

`warning`はServiceが停止していることを意味しない。

---

## 7.4 down

監視結果から対象が利用不能・停止状態であることが確認されている。

例:

- Health endpointが明確に失敗
- Expected process/service unavailable
- Monitoring Ruleが明示的にDown判定

監視Dataを取得できないだけでは`down`にしない。

---

## 7.5 unknown

対象の現在状態を判断できない。

例:

- 初回監視前
- Provider data不足
- 状態判定に必要なSignalがない

`unknown`は障害確定ではない。

---

## 7.6 stale

以前は状態を取得できていたが、Freshness thresholdを超えて更新されていない。

Staleは、

> 現在状態が古く、信頼できない可能性がある

ことを示す。

対象がDownであることは意味しない。

---

# 8. Stale Rule

## 8.1 Infrastructure Status

System / Serviceについて、最後の正常なStatus Updateから:

`5分`

以上経過した場合、Staleとする。

---

## 8.2 StaleとFetch Error

Fetch Errorは取得処理の結果。

StaleはDataのFreshness状態。

両者は別概念とする。

例:

```text id="l7l3w5"
Last successful status: 7分前
Latest fetch: failed
```

この場合:

- Status representation: stale
- Latest fetch result: error

となり得る。

---

# 9. Overall Status

## 9.1 目的

Infrastructure全体の現在状態を1つに集約する。

---

## 9.2 Aggregation Rule

対象:

- Systems
- Services
- Active Alerts
- Backup State

初期Rule:

### 1. Downが存在する

Overall:

`down`

### 2. Critical Alertが存在する

Overall:

`down`

Critical AlertがInfrastructure全体の停止を意味しない場合でも、v0.1では最上位の注意状態として扱う。

### 3. Downなし、WarningまたはFailed Backupが存在する

Overall:

`warning`

### 4. Down/Warningなし、StaleまたはUnknownが存在する

Overall:

`warning`

表示上は「一部状態を確認できません」など、通常Warningとは意味を区別してよい。

### 5. すべて正常

Overall:

`healthy`

---

# 10. Status Priority

## 10.1 System / Service

表示優先順位:

```text id="g5zobm"
down
warning
stale
unknown
healthy
```

---

## 10.2 Backup

表示優先順位:

```text id="tapzzd"
failed
stale
unknown
running
success
```

---

## 10.3 Alert

表示優先順位:

```text id="28wqsd"
critical
warning
```

同じSeverity内は新しいものから表示する。

---

# 11. Monitoringと状態判定

## 11.1 原則

StatusはUI側で推測しない。

Integration / Normalization LayerでStatusを判定し、UIにはNormalized Statusを渡す。

---

## 11.2 Provider-specific Data

Prometheus等のProvider固有Metricは、UIへそのまま露出させず、共通Domainへ変換する。

例:

```text id="cggf3s"
Prometheus metric
      ↓
Normalizer
      ↓
System.status = warning
System.diskUsage = 91
```

---

# 12. Metrics

## 12.1 v0.1 Summary Metrics

Systemでは以下をSummaryとして扱う。

- CPU usage
- Memory usage
- Disk usage

---

## 12.2 Historical Metrics

Historical MetricsはPersonal DeskのPrimary Domainとして保持しなくてよい。

詳細履歴はPrometheus / GrafanaをSourceとする。

Personal Deskでは必要なSummaryだけを保持・表示する。

---

# 13. Disk Usage

複数Filesystemが存在する場合、System summaryでは代表値を1つ使用できる。

初期方針:

> 使用率が最も高い監視対象Filesystem

を代表Disk Usageとする。

除外対象Filesystemが必要な場合はMonitoring Configuration側で定義する。

---

# 14. Backup Freshness

Infrastructure status用の5分Stale thresholdはBackupには使用しない。

Backupは実行周期がServiceごとに異なるため、各Backupに期待されるIntervalまたはFreshness thresholdを持てる設計とする。

例:

```text id="52jcrb"
Immich Backup

Expected interval:
24 hours

Stale after:
30 hours
```

v0.1ではこの値をConfigurationから与えてよい。

---

# 15. Backup FailureとRecovery

## Failure

BackupがFailedになった場合:

- Backup Current StateをFailedにする
- Alert生成対象にできる
- Activityを生成する

## Recovery

Failed状態のあとBackupが再びSuccessになった場合:

- Current StateをSuccessへ戻す
- Active AlertをResolvedにする
- Recovery Activityを生成する

RoutineなSuccessはActivity生成対象にしない。

---

# 16. AlertとActivityの関係

InfrastructureはCurrent Stateを扱う。

ActivityはHistoryを扱う。

例:

```text id="qg0u1a"
09:00 Service Down
→ Active Alert作成
→ Service.status = down
→ Activity作成

09:15 Service Recovered
→ Alert = resolved
→ Service.status = healthy
→ Recovery Activity作成
```

---

# 17. Activity生成対象

InfrastructureからActivityを生成する対象:

- Service down
- Service recovered
- System down
- System recovered
- Warning triggered
- Warning resolved
- Backup failed
- Backup recovered
- Deployment failed
- Deployment completed

Routine対象外:

- Periodic health success
- Routine backup success
- Normal metric collection
- Minor metric fluctuation

具体的なImportanceは`specifications/activity.md`に従う。

---

# 18. Source of Truth

## System / Service Current State

Source of Truth:

Monitoring Integration

初期候補:

- Prometheus
- Health check integrations

## Metrics

Source of Truth:

Prometheus

## Backup State

Source of Truth:

Backup integration / Backup provider

## Alerts

External Monitoring Alertが存在する場合はそれを利用可能。

Personal Desk独自Ruleから生成するAlertも許可する。

Personal DeskではNormalized Alertを保持する。

---

# 19. Cached State

Personal Deskは最新Normalized StateをDatabaseに保持してよい。

目的:

- 高速表示
- Provider障害時のFallback
- Stale判定
- Activity生成
- 状態差分検出

Cached StateはProviderの存在を置き換えるものではない。

---

# 20. State Transition

System / Service Statusの変更はMeaningful Changeとして扱う。

例:

```text id="mr3baf"
healthy → warning
warning → healthy
healthy → down
down → healthy
healthy → stale
stale → healthy
```

同じStatusの再取得は通常Activityを生成しない。

---

# 21. Unknown / Stale / Downの区別

この3つは必ず別々に扱う。

### unknown

状態判断材料がない。

### stale

以前の情報はあるが古い。

### down

監視結果から停止が確認できた。

UI・Database・Activity生成のすべてでこの区別を維持する。

---

# 22. Read-only Policy

v0.1ではInfrastructure Domainから外部Environmentへの操作を行わない。

対象外:

- Restart
- Stop
- Start
- Shutdown
- Container restart
- Deployment execution
- Backup execution
- Alert acknowledge

v0.1では観測と集約に集中する。

---

# 23. v0.1 Domain Scope

v0.1で必須:

- System
- Service
- Backup
- Alert
- Infrastructure Status
- Overall Status
- Stale判定
- Summary Metrics
- Activity generation rules

v0.1で不要:

- Cluster
- Multi-region
- Dependency Graph
- Auto-remediation
- Maintenance window
- SLO / SLA
- Incident management
- Infrastructure write operations

---

# 24. 設計原則まとめ

Personal DeskのInfrastructure Domainでは以下を守る。

1. Monitoring failureとTarget failureを区別する。
2. `unknown`、`stale`、`down`を別状態として扱う。
3. UI側でStatus判定しない。
4. Current StateはInfrastructureで扱う。
5. HistoryはActivityで扱う。
6. Routineな正常EventでActivityを埋めない。
7. Detailed MetricsはGrafana等へ委譲する。
8. Personal DeskはNormalized Stateを保持してよい。
9. External Source of Truthを不必要に置き換えない。
10. v0.1はread-onlyとする。