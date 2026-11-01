# Infrastructure

## 1. 目的

Personal DeskからInfrastructure全体の現在状態を素早く確認し、異常や要対応項目がある場合に、その対象と原因の概要を把握できる画面とする。

この画面はGrafanaやPrometheusの代替ではなく、

- 現在異常があるか
- どのSystem / Serviceに問題があるか
- Backupが正常に動いているか
- Active Alertが存在するか
- 詳細確認のためにどこへ移動すべきか

を短時間で判断するための入口とする。

Historical Metricsや詳細Graphは外部Monitoring Toolへ委譲する。

---

## 2. Route

`/infrastructure`

---

## 3. 基本レイアウト

Infrastructure画面は以下のSectionで構成する。

1. Overall Status
2. Systems
3. Services
4. Backups
5. Active Alerts

```text
┌──────────────┬───────────────────────────────────────────────────────┐
│              │ インフラ                                             │
│              │                                                       │
│              │ Overall                                               │
│              │ ● すべて正常                                         │
│              │ 最終更新: 2分前                         [ 更新 ]      │
│              │                                                       │
│              │ Systems                                               │
│ Sidebar      │ ───────────────────────────────────────────────────   │
│              │ VPS                                                   │
│              │ ● 正常                                                │
│              │ CPU 18%   RAM 42%   Disk 61%                         │
│              │ [ Grafanaで詳細を見る → ]                            │
│              │                                                       │
│              │ Raspberry Pi                                          │
│              │ ● 正常                                                │
│              │ CPU 12%   RAM 67%   Disk 73%                         │
│              │                                                       │
│              │ Services                                              │
│              │ ───────────────────────────────────────────────────   │
│              │ Immich        ● 正常     VPS        2分前             │
│              │ Nextcloud     ● 正常     Pi         2分前             │
│              │ PostgreSQL    ● 正常     VPS        2分前             │
│              │                                                       │
│              │ Backups                                               │
│              │ ───────────────────────────────────────────────────   │
│              │ Immich        ✓ 成功     4時間前                      │
│              │ Nextcloud     ✓ 成功     7時間前                      │
│              │                                                       │
│              │ Active Alerts                                         │
│              │ ───────────────────────────────────────────────────   │
│              │ 現在アクティブなAlertはありません。                  │
└──────────────┴───────────────────────────────────────────────────────┘
```

### レイアウト方針

- Desktop first
- 1ページ内でInfrastructure全体を確認できる
- System Detail専用画面はv0.1では作成しない
- Graphを大量に配置しない
- 異常項目を正常項目より視覚的・順序的に優先する

---

## 4. Page Header

### Title

`インフラ`

### Data Freshness

最新状態の取得時刻を表示する。

例:

`最終更新: 2分前`

または:

`最終更新: 09:12`

### Manual Refresh

Action:

`更新`

Behavior:

- 最新状態の取得を要求する
- Browser全体をReloadしない
- 既存データを可能な限り表示したまま更新する
- 各Sectionは独立して更新可能とする

更新の具体的な実装方式はArchitecture側で定義する。

---

# 5. Overall Status

## 目的

Infrastructure全体として、現在問題があるかを一目で判断できるようにする。

## 表示例

正常:

```text
● すべて正常
```

警告:

```text
▲ 注意が必要な項目があります
```

停止:

```text
× 停止しているサービスがあります
```

監視不明:

```text
? 一部の状態を確認できません
```

## Status

UI上では以下の状態を扱う。

- Healthy
- Warning
- Down
- Unknown
- Stale

具体的なDomain定義はInfrastructure Specificationに従う。

## Aggregation Rule

初期方針:

1. 1件以上`Down`
   - Overall = Down
2. `Down`なし、1件以上`Warning`
   - Overall = Warning
3. `Down` / `Warning`なし、1件以上`Unknown`または`Stale`
   - Overall = Warning相当の注意状態
4. すべてHealthy
   - Overall = Healthy

`Unknown`や`Stale`をHealthyとして扱わない。

---

# 6. Stale

## Threshold

最後の正常なStatus Updateから:

`5分`

以上経過した場合、Staleとする。

## Meaning

Staleは、

> 最新状態を確認できていない

ことを意味する。

StaleはDownとは異なる。

### Example

```text
VPS
最終更新: 7分前
更新情報が古い可能性があります
```

監視Systemの障害を対象Systemの障害として誤表示しない。

---

# 7. Systems

## 目的

物理MachineまたはVirtual Machine単位でInfrastructureの健康状態を確認する。

## Initial Examples

- VPS
- Raspberry Pi

将来的には以下も追加可能:

- Windows PC
- NAS
- Additional VPS

## System Row / Card

表示内容:

- Name
- Status
- CPU usage
- Memory usage
- Disk usage
- Last update
- Optional monitoring link

### Example

```text
VPS

● 正常

CPU       18%
Memory    42%
Disk      61%

最終更新: 2分前

Grafanaで詳細を見る →
```

---

## 7.1 Metrics

v0.1で表示するSummary Metric:

- CPU
- Memory
- Disk

### 表示方法

数値中心のSummaryとする。

例:

```text
CPU 18%
RAM 42%
Disk 61%
```

Historical Graphは表示しない。

---

## 7.2 Disk

Systemに複数Filesystemが存在する場合、Dashboard Summaryでは最も注意が必要なFilesystemを代表値として表示してよい。

例:

- 使用率が最も高いFilesystem
- Monitoring Policy上のPrimary Filesystem

詳細なFilesystem情報はGrafana等へ委譲する。

---

## 7.3 System Ordering

問題のあるSystemを上に表示する。

初期順序:

1. Down
2. Warning
3. Stale
4. Unknown
5. Healthy

同一Status内は設定順を基本とする。

設定順が存在しない場合はName順でもよい。

---

## 7.4 System Interaction

System Detail専用Routeはv0.1では作らない。

Monitoring Resourceが存在する場合:

`Grafanaで詳細を見る →`

等のLinkを表示する。

---

## 7.5 System Empty State

```text
監視対象のSystemがありません。
```

---

# 8. Services

## 目的

各System上で動作する主要Serviceの現在状態を確認する。

## Examples

- Immich
- Nextcloud
- PostgreSQL
- Traefik
- Prometheus
- Grafana

## Service Row

表示:

- Service name
- Status
- Host
- Last check

### Example

```text
Immich        ● 正常
VPS           2分前
```

または横並び:

```text
Immich    ● 正常    VPS    2分前
```

## Displayed Information

v0.1ではServiceごとの:

- CPU
- RAM
- Disk

は表示しない。

Resource usage詳細はMonitoring Toolへ委譲する。

---

## 8.1 Service Status

UI上で扱う状態:

- Healthy
- Warning
- Down
- Unknown
- Stale

状態表示には:

- Icon
- Text
- Color

を組み合わせる。

色のみで状態を示さない。

---

## 8.2 Service Ordering

初期順序:

1. Down
2. Warning
3. Stale
4. Unknown
5. Healthy

同一Status内は設定順。

---

## 8.3 Service Interaction

MonitoringまたはService ResourceへのLinkがある場合は遷移可能としてよい。

v0.1ではService操作は行わない。

禁止対象:

- Restart
- Stop
- Start
- Redeploy

---

## 8.4 Service Empty State

```text
監視対象のServiceがありません。
```

---

# 9. Backups

## 目的

重要なBackupが正常に動作しているか確認する。

Infrastructure画面ではBackupをSystem Metricsと同等以上に重要な情報として扱う。

## Display

各Backupについて:

- Name
- Current status
- Last successful backup
- Last attempt
- Optional error summary

### Normal Example

```text
Immich

✓ 成功
4時間前
```

### Failed Example

```text
Immich

× 失敗
最後の成功: 26時間前
```

---

## 9.1 Backup Status

UI上では以下を扱う。

- Success
- Failed
- Running
- Unknown
- Stale

具体的な判定RuleはDomain Specification側で定義する。

---

## 9.2 Ordering

問題があるBackupを上に表示する。

初期順序:

1. Failed
2. Stale
3. Unknown
4. Running
5. Success

同一状態では設定順。

---

## 9.3 Routine Success

正常なBackup成功はInfrastructure画面の現在状態として表示する。

Routineな成功ごとにActivityを生成してDashboardを埋めない。

ただし:

- Failed
- Recovery after failure

はActivity対象とする。

Activityの扱いは`docs/specifications/activity.md`に従う。

---

## 9.4 Backup Empty State

```text
監視対象のBackupがありません。
```

---

# 10. Active Alerts

## 目的

現在ユーザーが確認・対応する必要のあるAlertを一覧する。

Resolved Alertは表示しない。

## Example

```text
Active Alerts

Critical
Immich backup failed
12分前

Warning
VPS disk usage 91%
1時間前
```

## Displayed Information

- Severity
- Title
- Short description
- Related System / Service
- Started time
- Optional external destination

---

## 10.1 Severity

UIでは少なくとも:

- Critical
- Warning

を扱う。

必要であればInfo等を将来追加可能。

---

## 10.2 Ordering

Severity優先:

1. Critical
2. Warning

同じSeverityでは:

古い順または新しい順のどちらかを選択できるが、v0.1では:

`StartedAt DESC`

を初期案とする。

---

## 10.3 Resolved Alerts

Resolved AlertはActive Alerts Sectionから除外する。

Alert発生・解消の履歴はActivityへ記録する。

役割:

```text
Infrastructure
→ 今どうなっているか

Activity
→ 過去に何が起きたか
```

---

## 10.4 Alert Interaction

Personal Desk内に適切なDestinationがある場合は内部Navigationを優先する。

例:

`/infrastructure`

外部Monitoring Linkがある場合は外部遷移も可能。

---

## 10.5 Alert Empty State

```text
現在アクティブなAlertはありません。
```

Empty Stateは正常状態として扱い、Error表示にはしない。

---

# 11. Monitoring Toolとの役割分担

Personal Deskでは以下を扱う。

- Current status
- Summary metrics
- Backup state
- Active Alerts
- Data freshness

Grafana等では以下を扱う。

- Historical graphs
- Detailed metrics
- Long-term trends
- Performance analysis
- Detailed filesystem information
- Detailed network metrics

Personal Deskから必要に応じて:

`Grafanaで詳細を見る →`

への導線を提供する。

---

# 12. Filters

v0.1ではInfrastructure画面にFilterを実装しない。

対象外:

- Status Filter
- Host Filter
- Service Filter
- System Filter

理由:

初期の監視対象数では、常時一覧表示の方が速く状態を把握できるため。

監視対象数が増えた場合に再検討する。

---

# 13. Search

Infrastructure専用Searchはv0.1では実装しない。

---

# 14. Write Operations

Infrastructure画面はv0.1ではread-onlyとする。

以下の操作は実装しない。

- Server restart
- System shutdown
- Service restart
- Service stop/start
- Container restart
- Deployment
- Backup manual run
- Alert acknowledge
- Alert resolve

Operation機能は将来、権限・監査・誤操作対策を含めて別途設計する。

---

# 15. Refresh

## Manual Refresh

Page Headerの`更新`から最新状態取得を要求できる。

### Behavior

- Full page reloadを行わない
- Cached/current dataを可能な限り残す
- Section単位で更新可能
- 更新中もNavigationは利用可能

## Automatic Refresh

自動更新の具体的intervalや方式はArchitecture側で定義する。

UI仕様では特定intervalを要求しない。

ただしStatusのFreshnessは5分Thresholdで評価する。

---

# 16. Loading State

## Initial Loading

以下のSectionごとにSkeletonを表示する。

- Overall
- Systems
- Services
- Backups
- Alerts

画面全体を1つのLoading Spinnerだけにしない。

## Refresh

既存Dataを表示したまま更新状態を示す。

System / Service Cardを消してSkeletonへ戻す必要はない。

---

# 17. Empty State

各Sectionは独立したEmpty Stateを持つ。

### Systems

`監視対象のSystemがありません。`

### Services

`監視対象のServiceがありません。`

### Backups

`監視対象のBackupがありません。`

### Active Alerts

`現在アクティブなAlertはありません。`

Alertが0件であることは正常状態であり、警告扱いしない。

---

# 18. Error State

## Full Fetch Error

利用可能なInfrastructure Dataがない場合:

```text
Infrastructure状態を取得できませんでした。

[ 再試行 ]
```

## Cached Data Available

以前のDataが存在する場合は削除せず表示する。

例:

```text
最新のInfrastructure状態を取得できませんでした。
最終更新: 09:10
```

Cached DataにはStale表示を適用する。

---

# 19. Partial Failure

1つのProviderやData Sourceが失敗しても、他の情報は表示する。

例:

Prometheus Metricsの取得に失敗しても、Backup integrationが正常ならBackup状態は表示する。

Provider障害をInfrastructure全体のDownとして扱わない。

---

# 20. UnknownとDownの区別

以下を明確に区別する。

### Down

対象が停止していることを監視結果から判断できる。

### Unknown

対象の状態を判断できない。

### Stale

以前の状態は存在するが、最新確認が一定時間行われていない。

### Fetch Error

今回の取得処理自体が失敗した。

これらを同じ表示にまとめない。

---

# 21. Navigation

## Incoming

Infrastructure画面へは以下から遷移できる。

- Sidebar
- Dashboard Infrastructure Summary
- Activity
- 将来のSearch / Command Palette

## Outgoing

主な遷移先:

- Grafana
- Other monitoring resource
- External service page

v0.1ではPersonal Desk内のSystem Detail Routeは持たない。

---

# 22. Responsive Behavior

## 1440px以上

- Sidebar展開
- System Summaryを十分な横幅で表示
- CPU / RAM / Diskを横並び表示可能
- Services / Backupsは読みやすいRow形式

## 1280px〜1439px

- Sidebar展開
- 基本Layoutを維持
- 必要に応じてMetric間隔を縮小

## 1280px未満

- Sidebar自動collapse
- System Metricは必要に応じて複数行へwrap
- Row内容が極端に圧縮されないようにする
- Page-level horizontal scrollを発生させない

## Mobile

Dedicated mobile UXはv0.1対象外。

---

# 23. Theme

Global Theme specificationに従う。

Supported:

- Dark
- Light
- System

Default:

`Dark`

特に以下がTheme間で明確に判別可能であること。

- Healthy
- Warning
- Down
- Unknown
- Stale
- Failed Backup
- Active Alert
- Interactive link
- Focus state

---

# 24. Accessibility

## Status

Statusは色だけで表示しない。

最低限:

- Icon
- Text

を表示する。

## Keyboard

以下をKeyboard操作可能とする。

- Refresh
- Grafana / external monitoring link
- Alert link
- Sidebar navigation
- Retry

## Focus

Interactive elementはVisible Focusを持つ。

## Screen Reader

System / Service / BackupのNameとStatusが意味のある順序で読み上げられるようにする。

## Reduced Motion

不要なAnimationを使用しない。

使用する場合は`prefers-reduced-motion`を尊重する。

---

# 25. Out of Scope for v0.1

Infrastructure画面では以下を実装しない。

- Historical charts
- Time range selector
- Detailed CPU graph
- Detailed RAM graph
- Detailed network graph
- Detailed filesystem list
- Log viewer
- System Detail route
- Service Detail route
- Infrastructure Search
- Filters
- Custom Dashboard layout
- Drag-and-drop
- Server restart
- Shutdown
- Service restart
- Container restart
- Deployment operation
- Manual backup execution
- Alert acknowledge
- Alert resolution
- Mobile-specific UX

---

# 26. v0.1 Acceptance Criteria

Infrastructure v0.1は以下を満たした場合に完成とする。

1. `/infrastructure`からInfrastructure全体の現在状態を確認できる。
2. Overall Statusを表示できる。
3. Systemsを一覧できる。
4. Servicesを一覧できる。
5. Backupsを一覧できる。
6. Active Alertsを一覧できる。
7. SystemにはCPU、Memory、DiskのSummaryを表示できる。
8. ServiceにはName、Status、Host、Last Checkを表示できる。
9. BackupにはStatusとLast Successful Backupを表示できる。
10. Active AlertsにはSeverity、Title、Related Target、Started Timeを表示できる。
11. Resolved AlertをActive Alertsに表示しない。
12. Resolved Alertの履歴はActivity側で確認できる。
13. Stale thresholdは5分とする。
14. StaleとDownを区別する。
15. UnknownとDownを区別する。
16. Fetch Errorと対象のDownを区別する。
17. Systemは異常Statusを優先して表示する。
18. Serviceは異常Statusを優先して表示する。
19. BackupはFailed / StaleをSuccessより上に表示する。
20. Routine Backup SuccessをActivityで大量生成しない。
21. Historical MetricsはPersonal Desk内に表示しない。
22. 詳細MonitoringはGrafana等へのLinkで確認できる。
23. Infrastructure画面からWrite操作を行わない。
24. Manual Refreshが利用できる。
25. Refresh時にFull Browser Reloadを必要としない。
26. Partial Provider Failure時にも取得可能なSectionは表示する。
27. Cached Dataがある場合はFetch Error時も表示を維持できる。
28. Alert 0件をErrorとして扱わない。
29. 1440px幅で快適に利用できる。
30. 13-inch MacBook Airで利用できる。
31. 1280px未満でSidebarが自動collapseする。
32. Dark / Light / Systemで利用できる。
33. Statusを色だけで表現しない。
34. Keyboard navigationとVisible Focusに対応する。