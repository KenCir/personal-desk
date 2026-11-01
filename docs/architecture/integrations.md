# Integrations Architecture

## 1. 目的

このドキュメントでは、Personal Desk v0.1におけるExternal Provider Integrationの責務、同期方式、同期頻度、Normalization、差分検出、Activity生成、障害時の挙動を定義する。

対象Provider:

- Notion
- GitHub
- Google Calendar
- Prometheus
- Backup Integration

Personal DeskのUIは原則としてExternal Provider APIを直接参照せず、Integration LayerによってPostgreSQLへ同期されたNormalized Dataを利用する。

---

# 2. 基本Architecture

External ProviderとのData Flowは原則として以下とする。

```text
External Provider
        │
        ▼
Collector
        │
        ▼
Normalizer
        │
        ├── Domain State
        ├── Difference Detection
        ├── Activity Generation
        └── Alert Generation
                │
                ▼
            PostgreSQL
                │
                ▼
          Personal Desk UI
```

## Collector

Provider固有APIからDataを取得する。

責務:

- Authentication
- API Request
- Pagination
- Retry
- Provider-specific Cursor / Token
- Rate Limit Handling

Provider固有DataをUI向け形式へ変換する責務は持たない。

## Normalizer

Provider DataをPersonal Desk Domainへ変換する。

責務:

- Project / Task / Milestone等へのNormalization
- Status Mapping
- External ID Mapping
- Difference Detection
- Soft Delete判定
- Meaningful Change判定
- Activity生成
- Alert生成

---

# 3. UIとの境界

Browserから以下へ直接接続しない。

- Notion API
- GitHub API
- Google Calendar API
- Prometheus API

UIはPersonal Desk Backend / Database上のNormalized Dataを利用する。

これにより以下を実現する。

- Provider障害時のCached表示
- 横断検索
- Provider間の共通Domain表現
- Activity統合
- API Rate Limit削減
- Credential非公開

---

# 4. Integration共通状態

各Provider Integrationは`integrations` Tableで状態を管理する。

主な状態:

- enabled
- status
- last_attempt_at
- last_success_at
- last_error_at
- last_error

Integration Status:

```text
healthy
error
disabled
unknown
```

Provider DataのHealthとIntegration自体のHealthは区別する。

例:

```text
Prometheus Integration Error
```

は、

```text
VPS Down
```

を意味しない。

---

# 5. Sync Run

各同期は`sync_runs`へ記録する。

記録対象:

- integration
- sync type
- started_at
- finished_at
- result
- fetched count
- created count
- updated count
- deleted count
- error

Status:

```text
running
success
partial
failed
```

---

# 6. 共通Sync Policy

## 6.1 Full Sync

Provider全体または対象Scope全体を取得して整合性を確認するSync。

用途:

- Initial Sync
- Periodic Reconciliation
- Deletion Detection

Full SyncはPollingより低頻度でよい。

## 6.2 Incremental Sync

前回以降の変更だけを取得する。

可能なProviderではIncremental Syncを優先する。

## 6.3 Webhook

Providerが信頼できるWebhookを提供する場合は利用可能。

Webhookを利用してもPeriodic Reconciliationは残す。

理由:

- Webhook漏れ
- Delivery Failure
- Configuration Error

への耐性を持たせるため。

---

# 7. Retry Policy

Temporary ErrorではRetryを許可する。

対象例:

- HTTP 429
- HTTP 5xx
- Network timeout

初期方針:

```text
Attempt 1
↓
short backoff
↓
Attempt 2
↓
longer backoff
↓
Attempt 3
```

最大3回程度。

Exact backoffは実装側で定義する。

Authentication Error等のPermanent Errorは無制限Retryしない。

---

# 8. Rate Limit

Provider Rate Limitを尊重する。

Collectorは必要に応じて:

- Retry-After
- Rate Limit Header
- Provider-specific quota

を利用する。

同期頻度を高くすることより、安定して継続的に同期できることを優先する。

---

# 9. Partial Failure

一部Resourceの取得に失敗しても、取得可能なDataは更新可能とする。

例:

Notion:

```text
Projects取得成功
Tasks取得失敗
```

この場合:

`partial`

として記録可能。

Tasksの既存Cached Dataを即座に削除してはならない。

---

# 10. Delete Detection

External Providerの1回の取得失敗を削除扱いしない。

Soft Deleteを許可するのは原則として以下の場合。

- Providerが明示的にDeleted / Archivedを返した
- 正常に完了したFull Syncで存在しないことを確認した
- Deletion Webhookを受信した

Failed / Partial Syncによって大量Soft Deleteを発生させない。

---

# 11. Activity生成

ActivityはProvider Eventそのものをそのまま保存するのではなく、Personal Desk Domain上で意味のあるEventへ変換する。

例:

```text
GitHub Pull Request Event
        ↓
PR merged
        ↓
Activity
```

Activity Ruleは:

`docs/specifications/activity.md`

に従う。

---

# 12. Deduplication

WebhookとPollingの両方から同じEventを検出する可能性があるため、Activityは`dedup_key`を利用する。

例:

```text
github:<repository>:pr:<number>:merged
```

同じMeaningful Eventから複数Activityを生成しない。

---

# 13. Notion Integration

## 13.1 役割

Notionを以下のSource of Truthとして扱う。

- Areas
- Projects
- Tasks
- Milestones

---

## 13.2 取得対象

### Areas

取得:

- External ID
- Name
- Relevant metadata

Normalized:

`areas`

### Projects

取得:

- External ID
- Name
- Description
- Status
- Area Relation
- Created Time
- Last Edited Time
- Completion information

Normalized:

`projects`

### Tasks

取得:

- External ID
- Title
- Status
- Priority
- Due date
- Project Relation
- Completion state

Normalized:

`tasks`

### Milestones

取得:

- External ID
- Title
- Description
- Due date
- Completion state
- Project Relation

Normalized:

`milestones`

---

# 14. Notion Sync Strategy

v0.1ではPollingを基本とする。

初期候補:

```text
Incremental polling:
5 minutes

Full reconciliation:
6 hours
```

理由:

- Project / Taskは秒単位Realtimeである必要がない
- API負荷を抑えられる
- Dashboard用途として5分程度で十分

Exact intervalは運用後に調整可能とする。

---

# 15. Notion Meaningful Change

Notion上のすべてのLast Edited変更をMeaningful Changeとはみなさない。

Meaningful Change例:

- Project Status変更
- Area変更
- Milestone変更
- Project Completion
- Important Deadline変更

Routine Change例:

- Description typo修正
- Page formatting
- Minor metadata edit

Meaningful Changeが発生した場合のみ必要に応じて:

- `meaningful_updated_at`
- Activity

を更新する。

---

# 16. Notion Activity

生成候補:

- Project created
- Project status changed
- Project completed
- Milestone created
- Milestone completed
- Important deadline changed
- Important Task completed

Routine Task edit等は原則Activityにしない。

---

# 17. Notion Failure Behavior

Notion API取得失敗時:

- Existing normalized dataは保持
- Entityを削除しない
- Integration StatusをErrorにできる
- UIはCached Dataを継続利用可能

---

# 18. GitHub Integration

## 18.1 役割

GitHubを以下のSource of Truthとして扱う。

- Repository
- Pull Request
- Issue
- Release
- CI / Workflow State

Repository自体を独立Domain Tableとして持つことはv0.1では必須ではない。

Project ResourceおよびActivity生成Sourceとして扱える。

---

# 19. GitHub対象Repository

すべてのGitHub Repositoryを自動Importするのではなく、Personal Desk Projectへ関連付けられたRepositoryのみを監視する。

例:

```text
Project
Personal Desk

Resource
type = repository
provider = github
```

このResource Relationを基準に監視対象を決定する。

---

# 20. GitHub Sync Strategy

GitHubはWebhook + Periodic ReconciliationのHybridを推奨する。

## Webhook

対象例:

- Pull Request
- Issues
- Release
- Workflow Run
- Push

Webhook受信後:

```text
Webhook
  ↓
Validation
  ↓
Normalizer
  ↓
Activity / Current State
```

## Periodic Reconciliation

初期候補:

```text
30 minutes
```

目的:

- Webhook Delivery漏れ検出
- Configuration Error補完
- Current State整合性確認

---

# 21. GitHub Push

Routine Push / Commitは原則Importance `low`。

Project Detail Activityでは表示可能。

Dashboardには通常表示しない。

Default Branchへの特別に意味のあるPushを`normal`以上にする場合は明示的Ruleを設ける。

v0.1ではRoutine Pushを自動昇格しない。

---

# 22. GitHub Activity Mapping

### Pull Request

生成候補:

- PR created
- PR merged
- PR closed

### Issue

生成候補:

- Issue created
- Issue closed

### Release

- Release created

### CI

- CI failed
- CI recovered

### Push

- Routine push → low

Activity Importanceは`specifications/activity.md`に従う。

---

# 23. CI Recovery

CI failed状態のあと成功した場合に:

`CI recovered`

を生成可能とする。

単発の通常CI successをActivityにしない。

つまり:

```text
success → success
Activityなし

success → failed
CI failed

failed → failed
通常追加Activityなし

failed → success
CI recovered
```

とする。

---

# 24. GitHub Deduplication

Webhook Delivery IDだけでなく、Meaningful Event単位のdedup_keyを利用する。

例:

```text
github:<repo>:pr:<number>:merged
github:<repo>:issue:<number>:closed
github:<repo>:workflow:<workflow-id>:failed:<run-id>
```

---

# 25. Google Calendar Integration

## 25.1 役割

Google CalendarをDashboard TodayのNext Event Sourceとして扱う。

v0.1ではFull Calendar UIは実装しない。

---

# 26. Calendar取得対象

必要なField:

- Event ID
- Title
- Start
- End
- All-day
- Status
- Calendar ID

Today表示に必要な範囲だけNormalized / Cachedしてよい。

---

# 27. Calendar Sync Strategy

Google CalendarのIncremental Sync Tokenが利用可能な場合は使用する。

Initial Sync:

Calendar Event取得。

Subsequent Sync:

Sync TokenによるIncremental Sync。

初期Polling候補:

`5 minutes`

Full Reconciliation:

Provider仕様上必要な場合のみ。

---

# 28. Calendar Cursor

Google Calendar Sync Tokenは:

`integration_cursors`

へ保存する。

例:

```text
scope = calendar:<calendar-id>
cursor = <sync-token>
```

Token invalidation時はFull SyncへFallbackする。

---

# 29. Calendar Event Scope

v0.1ではToday用途が中心だが、同期自体は短期間のFuture Eventを保持してもよい。

初期候補:

```text
Past:
1 day

Future:
30 days
```

これにより:

- 今日のNext Event
- 近い予定

を効率よく取得できる。

Calendar Historyを長期間保存する必要はない。

---

# 30. Calendar Activity

v0.1ではCalendar Event変更を通常Activityへ生成しない。

理由:

Dashboard Todayと重複しやすいため。

将来候補:

- Important event created
- Event cancelled
- Significant schedule change

---

# 31. Calendar Failure Behavior

Google Calendar取得失敗時:

Today内のCalendar BlockだけError / Staleとして扱う。

Tasks / Deadline等のToday情報は表示を継続する。

---

# 32. Prometheus Integration

## 32.1 役割

PrometheusをInfrastructure Current StateとSummary Metricsの主要Sourceとして扱う。

対象:

- System Metrics
- Service Health
- Alert-related Signals

---

# 33. Prometheus取得対象

System Summary:

- CPU usage
- Memory usage
- Disk usage

Health:

- System reachability
- Service health

詳細Historical MetricsはPersonal Desk Databaseへ複製しない。

---

# 34. Prometheus Sync Strategy

Pollingを使用する。

初期候補:

`1 minute`

理由:

Infrastructure Stale Thresholdが5分のため、その十分内側で更新する。

Personal DeskはPrometheusの代替Monitoring Systemではないため、秒単位Pollingは不要。

---

# 35. Prometheus Query Strategy

UIから任意PromQLを直接送信しない。

Integration側に必要Queryを定義する。

例:

```text
System CPU Summary Query
System Memory Summary Query
System Disk Summary Query
Service Health Query
```

Provider-specific Query結果をNormalizerでInfrastructure Domainへ変換する。

---

# 36. Prometheus Status Normalization

例:

```text
Prometheus Metric
      ↓
Configured Rule
      ↓
healthy / warning / down / unknown
```

UIでThreshold判定しない。

ThresholdはIntegration / Configuration側で管理する。

---

# 37. Prometheus Stale

Persisted Statusには`stale`を保存しない。

最後の正常なStatus更新:

`last_success_at`

から5分経過した場合、Personal Desk側でEffective StatusをStaleとして算出する。

詳細:

`docs/specifications/infrastructure.md`

---

# 38. Prometheus Failure Behavior

Prometheus APIへ接続できない場合:

- System / ServiceをDownへ変更しない
- Existing Stateを保持する
- Freshness経過後はStaleになる
- Integration StatusはErrorにできる

監視System障害と監視対象障害を区別する。

---

# 39. Prometheus Activity

Status transitionからActivityを生成する。

例:

```text
healthy → down
Service down

down → healthy
Service recovered

healthy → warning
Warning triggered

warning → healthy
Warning resolved
```

Routine Poll成功はActivityにしない。

---

# 40. Backup Integration

## 40.1 役割

各Backup JobのCurrent StateをPersonal Deskへ取り込む。

Backup Sourceは実装環境によって異なるため、特定Providerへ固定しない。

例:

- restic
- Cron Result
- Custom Script
- Backup API
- Monitoring Metric

---

# 41. Backup Adapter

Backup SourceごとにAdapterを実装可能とする。

Normalized Result:

- Name
- Status
- Last Attempt
- Last Success
- Last Failure
- Error Summary
- Related System
- Related Service

---

# 42. Backup Sync Strategy

Backup Jobは実行頻度が低いため、Sourceに応じてPollingする。

初期候補:

`5 minutes`

ただしBackupのStale判定はPolling Intervalではなく各Backupの:

`stale_after_seconds`

を利用する。

---

# 43. Backup Activity

生成:

- Backup failed
- Backup recovered

生成しない:

- Routine backup success

Transition例:

```text
success → success
Activityなし

success → failed
Backup failed

failed → failed
通常追加Activityなし

failed → success
Backup recovered
```

---

# 44. Backup Alert

Backup failed時にAlertを生成可能とする。

Recovery時:

- Alert resolved
- Recovery Activity生成

Backup StaleについてAlertを生成するかはConfiguration可能とする。

v0.1初期方針:

Staleが一定時間継続した場合Warning Alert対象としてよい。

---

# 45. Integration Scheduling

v0.1初期候補:

| Integration | Method | Interval |
|---|---|---:|
| Notion | Polling | 5 min |
| Notion Full Reconciliation | Polling | 6 h |
| GitHub | Webhook | Event-driven |
| GitHub Reconciliation | Polling | 30 min |
| Google Calendar | Incremental Polling | 5 min |
| Prometheus | Polling | 1 min |
| Backup | Polling | 5 min |

これらはInitial Defaultであり、Configuration可能な設計とする。

---

# 46. Scheduler

v0.1ではSchedulerの具体的実装を固定しすぎない。

候補:

- Worker process
- Cron
- Application Scheduler

ただし長期的には:

`apps/worker`

が定期同期を担当する構成を推奨する。

Web Requestが発生したときだけ同期する設計にはしない。

---

# 47. Manual Refresh

Dashboard / Infrastructure等のManual Refreshは、External APIをBrowserから直接叩かない。

Flow:

```text
Browser
  ↓
Personal Desk Backend
  ↓
Refresh Request
  ↓
Integration / Worker
```

Manual Refreshは可能な限り非同期的に扱い、既存Cached Dataを即座に消さない。

---

# 48. Concurrency

同一Integration / Scopeについて複数Syncが同時実行されないようにする。

例:

```text
Notion Full Sync
```

実行中に同じFull Syncを重複起動しない。

必要に応じて:

- DB lock
- Advisory lock
- Job queue uniqueness

等を利用する。

具体方式はBackend実装時に決定する。

---

# 49. Transaction

NormalizationによるMeaningful State ChangeとActivity生成は、可能な限り同一Transactionで処理する。

例:

```text
PR merged
  ↓
Domain update
  +
Activity insert
```

Infrastructure:

```text
service.status:
healthy → down

+
Alert create/update

+
Activity create
```

を可能な限り原子的に処理する。

---

# 50. Integration Configuration

Provider固有設定をCodeへ散らさない。

Configuration候補:

- Enabled integrations
- Polling interval
- Target repository
- Calendar ID
- Prometheus query
- Status threshold
- Backup stale interval

ただしSecretはConfiguration fileやDatabaseへ平文保存しない。

---

# 51. Credentials

CredentialsはDatabaseへ直接保存しない方針とする。

候補:

- Environment Variables
- Docker Secrets
- Secret Manager

Examples:

```text
NOTION_TOKEN
GITHUB_TOKEN
GOOGLE_CLIENT_SECRET
```

Database側には必要に応じてSecret referenceのみ保持する。

---

# 52. Logging

Integration logにSensitive Dataを不必要に出力しない。

ログへ出してよい例:

- Provider
- Sync Run ID
- Scope
- Item counts
- Duration
- Error category

避ける:

- Access Token
- Authorization Header
- Personal Event content全文
- Sensitive Provider Payload全文

---

# 53. Observability

最低限以下を追跡できるようにする。

- Integration Status
- Last successful sync
- Last failed sync
- Sync duration
- Created/updated/deleted counts

これらは将来的にPersonal Desk自身のInfrastructure Monitoringにも利用可能。

---

# 54. Initial Sync

初回起動時はIntegrationごとにInitial Syncを行う。

推奨順序:

```text
1. Notion
2. GitHub Resources / State
3. Google Calendar
4. Prometheus
5. Backup
```

厳密な依存がなければ並列化可能。

Project Resource Relationが必要なGitHub処理については、Project Sync完了後の方が扱いやすい。

---

# 55. Startup Dependency

Personal Desk Web UIの起動を全Integration Initial Sync完了までBlockしない。

Dataが存在しないSectionではLoading / Empty / Syncing Stateを表示できる。

Provider障害があってもApplication自体は起動可能にする。

---

# 56. Integration HealthとDomain Health

以下を明確に分離する。

```text
Integration Health
```

External APIと正常に通信できているか。

```text
Domain Health
```

対象SystemやServiceそのものが正常か。

例:

```text
Prometheus Integration = error
VPS last known status = healthy
VPS effective status = stale
```

という状態を許容する。

---

# 57. Data Ownership Summary

| Provider | Owned Data |
|---|---|
| Notion | Area / Project / Task / Milestone |
| GitHub | Repo / PR / Issue / Release / CI source state |
| Google Calendar | Event |
| Prometheus | Metrics / Monitoring signals |
| Backup Source | Backup current state |
| Personal Desk | Normalized Activity / Integration State / Sync State |

---

# 58. v0.1で実装しないもの

- Bidirectional Notion write-back
- GitHub Issue / PR操作
- Calendar Event作成・編集
- Prometheus configuration editing
- Infrastructure restart/control
- Automatic remediation
- Multi-account Provider support
- OAuth account selector UI
- General-purpose Integration marketplace
- Arbitrary custom webhook UI
- Event streaming platform
- Cross-provider distributed transaction
- Exactly-once delivery guarantee

v0.1ではAt-least-once deliveryとDeduplicationで十分とする。

---

# 59. v0.1 初期設定まとめ

## Notion

```text
Method:
Polling

Incremental:
5 min

Full reconciliation:
6 h

Owns:
Areas
Projects
Tasks
Milestones
```

## GitHub

```text
Method:
Webhook + Polling

Reconciliation:
30 min

Owns:
Repository-related source state

Produces:
Activity
```

## Google Calendar

```text
Method:
Incremental polling

Interval:
5 min

Cursor:
Sync token

Primary usage:
Today / Next Event
```

## Prometheus

```text
Method:
Polling

Interval:
1 min

Owns:
Monitoring metrics/signals

Produces:
System / Service current state
Activity
Alert
```

## Backup

```text
Method:
Polling / Adapter

Interval:
5 min

Stale:
Per-backup threshold

Produces:
Backup state
Activity
Alert
```

---

# 60. 設計原則まとめ

Personal Desk Integration Layerでは以下を守る。

1. UIからExternal Providerへ直接依存しない。
2. Provider Dataを共通DomainへNormalizeする。
3. External IDとInternal IDを分離する。
4. Integration FailureとDomain Failureを区別する。
5. Polling失敗によってEntityを削除しない。
6. Webhook利用時もPeriodic Reconciliationを残す。
7. Meaningful ChangeだけをActivity化する。
8. Routine EventでActivityを埋めない。
9. Activity重複をDeduplicationする。
10. Provider障害時はCached Dataを保持する。
11. Current StateとHistoryを分離する。
12. External ProviderをSource of Truthとして尊重する。
13. SecretをDatabaseへ平文保存しない。
14. Sync Runを追跡可能にする。
15. 同一Scopeの重複Syncを防ぐ。
16. v0.1はRead-heavy Integrationとする。