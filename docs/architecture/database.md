# Database Architecture

## 1. 目的

このドキュメントでは、Personal Desk v0.1におけるDatabase設計方針、主要Table、Relation、Index、Timestamp、External ProviderとのID管理方針を定義する。

Databaseは単なるExternal API Cacheではなく、

- Normalized State
- 横断検索用Data
- Activity History
- Integration State
- Sync Metadata
- Provider障害時のFallback

を保持する。

ただし、外部サービスがSource of TruthであるDataについて、Personal Desk Databaseが競合するSource of Truthにならないようにする。

---

# 2. Technology

## Engine

PostgreSQL

## ORM

Drizzle ORM

## Timestamp Type

実際の瞬間を表す日時には原則として:

`timestamptz`

を使用する。

詳細は:

`docs/specifications/datetime.md`

に従う。

---

# 3. Databaseの役割

Personal Desk Databaseは主に以下を担当する。

- External Provider DataのNormalization
- UI向けRead Model
- Project / Resource Relation
- Activity History
- Infrastructure Current State
- Alert State
- Backup State
- Integration Health
- Sync History
- Incremental Sync State
- Provider障害時のCached Data

UIは原則としてExternal APIを直接参照せず、Personal Desk Database上のNormalized Dataを利用する。

---

# 4. Source of Truthとの関係

初期方針:

| Data | Source of Truth |
|---|---|
| Area | Notion |
| Project | Notion |
| Task | Notion |
| Milestone | Notion |
| Calendar Event | Google Calendar |
| Repository | GitHub |
| Issue / PR | GitHub |
| Infrastructure Metrics | Prometheus |
| Backup State | Backup Integration |
| Activity | Personal Desk |
| Integration State | Personal Desk |

External Source of Truthを持つDataは、Database上ではNormalized / Cached representationとして扱う。

---

# 5. ID方針

## Internal ID

Personal Desk内部のPrimary KeyにはUUIDを使用する。

推奨:

`UUID v7`

理由:

- External IDへ依存しない
- Provider変更に耐えられる
- 複数Provider DataのRelationを統一できる
- 時系列的な生成特性を持つ
- Distributed環境でも生成しやすい

例:

```text id="swjd0v"
id uuid primary key
```

---

## External ID

Provider側のIDはInternal IDとは分離する。

基本構造:

```text id="quqg2n"
provider
external_id
```

External IDをPrimary Keyとして使用しない。

### Uniqueness

Provider由来Entityについては原則:

```text id="unshke"
UNIQUE(provider, external_id)
```

とする。

---

# 6. Timestamp方針

External Provider由来Entityでは、可能な限り以下を分離する。

## `source_updated_at`

External Provider側で最後に変更された時刻。

例:

Notion PageのLast Edited Time。

## `synced_at`

Personal DeskがそのEntityを最後に確認・同期した時刻。

例:

```text id="9asf17"
source_updated_at = 2026/09/17 15:00
synced_at         = 2026/09/18 20:00
```

この場合、Sourceは前日に変更されているが、Personal Deskは現在まで同期できている。

---

# 7. Meaningful Update

Project一覧などで使用する「最終更新」は、External Provider上のあらゆる小変更と一致させない。

そのためProjectには:

`meaningful_updated_at`

を保持する。

## Purpose

以下のようなMeaningful Changeで更新する。

- Status変更
- Milestone変更
- 重要なProject Metadata変更
- Project Activityとして扱うべき更新

一方で、

- 軽微なDescription変更
- Notion上の装飾変更
- 同期のみでData変更なし

などでは更新しない。

UIの「○分前に更新」は原則として`meaningful_updated_at`を利用する。

---

# 8. Soft Delete

External ProviderからEntityが消えた場合、即時Physical Deleteは行わない。

主要Normalized Entityには:

`deleted_at`

を持たせる。

対象:

- areas
- projects
- milestones
- tasks
- resources
- systems
- services
- backups

## Purpose

- Activity Historyを保持する
- Foreign Key Relationを壊さない
- Provider一時的な取得漏れに耐える
- Source DeleteとDomain Statusを区別する

### Important

```text id="ynuk3j"
project.status = done
```

と:

```text id="aid6go"
project.deleted_at IS NOT NULL
```

は別概念。

Doneは正常なDomain State。

DeletedはSourceから存在しなくなった状態。

---

# 9. Table一覧

v0.1では以下を使用する。

```text id="79p15m"
areas
projects
milestones
tasks
resources

activities

systems
services
backups
alerts

integrations
sync_runs
integration_cursors
```

---

# 10. `areas`

ProjectのAreaをNormalizedして保持する。

## Columns

```text id="9nnmc2"
id
provider
external_id

name
slug

source_updated_at
synced_at

created_at
updated_at
deleted_at
```

## Types

概念:

```text id="f8a3wv"
id                uuid
provider          text
external_id       text
name              text
slug              text
source_updated_at timestamptz
synced_at         timestamptz
created_at        timestamptz
updated_at        timestamptz
deleted_at        timestamptz nullable
```

## Constraints

```text id="cdu8m1"
UNIQUE(provider, external_id)
UNIQUE(slug)
```

---

# 11. `projects`

Personal Deskの中心Entity。

## Columns

```text id="6dz6l2"
id
provider
external_id

area_id

slug
name
description
status

source_created_at
source_updated_at
meaningful_updated_at
synced_at

completed_at

created_at
updated_at
deleted_at
```

## Status

Domain値:

```text id="azmns0"
planning
active
waiting
blocked
done
```

定義は:

`docs/specifications/project.md`

に従う。

## Constraints

```text id="3dc6xz"
UNIQUE(provider, external_id)
UNIQUE(slug)
```

## Relation

```text id="aypwo1"
projects.area_id
→ areas.id
```

Area削除時はProjectを削除しない。

推奨:

`ON DELETE SET NULL`

---

# 12. `milestones`

Project-level Deadline / Milestoneを保持する。

## Columns

```text id="npn4xn"
id
provider
external_id

project_id

title
description
status

due_at
all_day

completed_at

source_updated_at
synced_at

created_at
updated_at
deleted_at
```

## Status

初期値:

```text id="mop4b0"
pending
completed
cancelled
```

## `all_day`

時刻を持たない期限を区別するために使用する。

例:

```text id="yaphre"
2026/09/30
```

のみ指定されているMilestone:

```text id="8owb72"
all_day = true
```

## Relation

```text id="whwo39"
milestones.project_id
→ projects.id
```

MilestoneはProjectに所属するため、Physical Delete時は:

`ON DELETE CASCADE`

でもよい。

ただし通常はProject Soft Deleteを使用する。

---

# 13. `tasks`

Dashboard Todayで使用するTaskをNormalizedして保持する。

## Columns

```text id="bz2byl"
id
provider
external_id

project_id

title
status
priority

due_at
all_day

completed_at

source_updated_at
synced_at

created_at
updated_at
deleted_at
```

## Status

初期候補:

```text id="3pv1s8"
todo
in_progress
done
cancelled
```

## Priority

Source Provider側に存在する場合のみ保持する。

Nullable。

初期候補:

```text id="fvfc16"
low
medium
high
urgent
```

Personal Desk独自のTask Priorityはv0.1では生成しない。

## Relation

```text id="x67mu5"
tasks.project_id
→ projects.id
```

Projectに属さないTaskを将来扱う可能性を考え:

`project_id`はNullableでもよい。

---

# 14. `resources`

Projectに紐づく外部Resourceを保持する。

## Columns

```text id="9r56ld"
id
project_id

type
category
provider

external_id

name
description
url

is_primary
sort_order

created_at
updated_at
deleted_at
```

## Type

定義は:

`docs/specifications/resource.md`

に従う。

例:

```text id="t0wcy5"
repository
documentation
deployment
monitoring
service
other
```

## Category

```text id="yayigk"
development
documentation
deployment
monitoring
other
```

## Provider

Providerは拡張頻度が高いため、PostgreSQL Enumではなく`text`を推奨する。

例:

```text id="0mx1od"
github
notion
grafana
prometheus
custom
```

## Relation

```text id="ei2qnj"
resources.project_id
→ projects.id
```

Project Physical Delete時:

`ON DELETE CASCADE`

を使用可能。

---

# 15. `activities`

Personal Desk全体のNormalized Activity History。

ActivityはPersonal Deskが所有するDomain Dataとする。

## Columns

```text id="7awpfl"
id

project_id
system_id
service_id

provider
external_id
dedup_key

type
category
importance

title
description

occurred_at

internal_path
external_url

metadata

created_at
```

## Importance

```text id="gd21cf"
low
normal
high
critical
```

## Category

```text id="2d9zx8"
source_control
project
infrastructure
deployment
other
```

定義は:

`docs/specifications/activity.md`

に従う。

---

## `metadata`

Provider固有の補足情報には`jsonb`を使用できる。

例:

```json id="cjlfhi"
{
  "repository": "example/personal-desk",
  "prNumber": 42,
  "workflowRunId": 1234
}
```

主要な検索・Filter対象FieldはJSONへ押し込まない。

以下は通常Columnとして保持する。

- importance
- category
- occurred_at
- project_id
- system_id
- service_id
- provider
- title

---

## Deduplication

Webhook再送やPolling重複によるActivity重複を防ぐため:

`dedup_key`

を持つ。

例:

```text id="mut425"
github:example/personal-desk:pr:42:merged
```

`dedup_key`はNullable。

Constraint:

```text id="z0m1ru"
UNIQUE(dedup_key)
```

PostgreSQLではNULL同士は通常Unique Constraint上で競合しないため、Deduplication不要ActivityはNULLを利用できる。

---

## Relations

Activity Historyを保持するためForeign Key削除時は原則:

`ON DELETE SET NULL`

を使用する。

例:

```text id="cqkiuj"
activities.project_id
→ projects.id
ON DELETE SET NULL
```

同様に:

- system_id
- service_id

も履歴維持を優先する。

---

# 16. `systems`

監視対象Machine / Host。

## Columns

```text id="k7egda"
id

name
slug
description

status

cpu_usage
memory_usage
disk_usage

last_checked_at
last_success_at

monitoring_url
sort_order

created_at
updated_at
deleted_at
```

## Status

Persisted Stateとして使用:

```text id="gbhg8v"
healthy
warning
down
unknown
```

`stale`は保存しない。

詳細は後述。

## Metrics

v0.1で保持するSummary:

- CPU usage
- Memory usage
- Disk usage

Historical Metricsは原則Prometheusへ委譲する。

## Constraint

```text id="t4qh4f"
UNIQUE(slug)
```

---

# 17. `services`

System上またはExternal Environment上で稼働するService。

## Columns

```text id="lgu093"
id
system_id

name
slug
description

status

last_checked_at
last_success_at

resource_url
sort_order

created_at
updated_at
deleted_at
```

## Host

`system_id`はNullable。

理由:

将来的に外部Managed Service等を扱えるようにするため。

## Status

Persisted:

```text id="rtexlt"
healthy
warning
down
unknown
```

`stale`はDerived State。

## Relation

```text id="kxpec9"
services.system_id
→ systems.id
ON DELETE SET NULL
```

---

# 18. `backups`

Backup Job / PolicyのCurrent State。

## Columns

```text id="v5o3wh"
id

system_id
service_id

name

status

expected_interval_seconds
stale_after_seconds

last_attempt_at
last_success_at
last_failure_at

last_error

sort_order

created_at
updated_at
deleted_at
```

## Persisted Status

```text id="6y2kt2"
success
failed
running
unknown
```

`stale`は保存しない。

## Relations

```text id="e3tcrs"
backups.system_id
→ systems.id
ON DELETE SET NULL
```

```text id="h1e8d6"
backups.service_id
→ services.id
ON DELETE SET NULL
```

SystemまたはServiceのRelationはいずれもNullable。

---

# 19. `alerts`

現在または過去のInfrastructure Alert。

## Columns

```text id="pwclq7"
id

system_id
service_id
backup_id

provider
external_id
dedup_key

severity
status

title
description

started_at
resolved_at

external_url
metadata

created_at
updated_at
```

## Severity

```text id="tgdd0c"
warning
critical
```

## Status

```text id="mkgyco"
active
resolved
```

## Deduplication

例:

```text id="baf7d2"
prometheus:DiskUsageHigh:vps
```

Constraint:

```text id="kebcys"
UNIQUE(dedup_key)
```

Nullableを許可してよい。

## Relations

History保持を優先して:

- system_id
- service_id
- backup_id

はPhysical Delete時:

`ON DELETE SET NULL`

を推奨する。

---

# 20. Staleは保存しない

Infrastructure Domainにおける`stale`はDatabase上のPersisted StatusではなくDerived Stateとする。

## System / Service

DB:

```text id="78cjja"
status = healthy
last_success_at = 10分前
```

Current timeとの差が5分以上なら:

```text id="axc643"
effective_status = stale
```

と算出する。

## 理由

StaleはData自体の変更ではなく、時間経過だけで発生するため。

DBへStaleを保存すると:

```text id="n7znnv"
04:59 healthy
05:00 stale
```

の更新を行うBackground Jobが必要になる。

Derived Stateなら不要。

---

# 21. Backup Stale

Backupも`stale`を保存しない。

判定:

```text id="jp1ow2"
last_success_at
+
stale_after_seconds
```

現在時刻がThresholdを超えた場合:

`effective_status = stale`

とする。

Backupは実行周期が異なるため、System / Service用の5分Thresholdは使用しない。

---

# 22. `integrations`

External Provider Integration自体の状態を保持する。

## Columns

```text id="dfacq1"
id

provider
name

enabled
status

last_attempt_at
last_success_at
last_error_at
last_error

created_at
updated_at
```

## Provider Examples

```text id="49mvgr"
notion
github
google_calendar
prometheus
backup
```

## Status

```text id="mi30ia"
healthy
error
disabled
unknown
```

## Credentials

API TokenやSecretそのものは原則Databaseへ保存しない。

利用候補:

- Environment Variables
- Docker Secrets
- Secret Manager

Databaseに必要な場合はSecret referenceのみ保持する。

---

# 23. `sync_runs`

External Integration Syncの実行履歴。

## Columns

```text id="55hxg1"
id
integration_id

type
status

started_at
finished_at

items_fetched
items_created
items_updated
items_deleted

error
metadata
```

## Status

```text id="m9h2y9"
running
success
partial
failed
```

## Purpose

以下を追跡できるようにする。

- 最終同期
- 同期失敗
- Partial failure
- 更新件数
- Integration Debugging

## Relation

```text id="hh2o2b"
sync_runs.integration_id
→ integrations.id
ON DELETE CASCADE
```

---

# 24. `integration_cursors`

Incremental Sync用のCursor / Tokenを保持する。

## Columns

```text id="mns45g"
integration_id
scope

cursor
metadata

updated_at
```

## Primary Key

Composite:

```text id="103wu6"
(integration_id, scope)
```

## Examples

### GitHub

```text id="o8m870"
scope = repository:personal-desk
```

### Google Calendar

```text id="gc0qde"
scope = calendar:<calendar-id>
```

Sync Token等を`cursor`または`metadata`に保持する。

---

# 25. Enum Policy

PostgreSQL Enumは、Domain上ほぼ固定であり変更頻度が低い値に限定して使用してよい。

候補:

- Project Status
- Activity Importance
- Activity Category
- Infrastructure Persisted Status
- Backup Persisted Status
- Alert Severity
- Alert Status
- Sync Run Status

一方、Provider名のように拡張頻度が高い値は`text`を推奨する。

---

# 26. JSONB Policy

`jsonb`はProvider固有Metadataや低頻度参照Dataに使用できる。

使用例:

- GitHub PR Metadata
- Prometheus Alert Labels
- Sync Provider State
- Debug Information

以下のような主要FieldはJSONBへ入れない。

- Status
- Importance
- Category
- Timestamp
- Foreign Key
- Search対象Title
- Project Relation

---

# 27. Index

v0.1で最低限以下を作成する。

## Projects

```text id="qk2h0j"
projects(status)
projects(area_id)
projects(slug)
projects(meaningful_updated_at DESC)
```

## Tasks

```text id="0mh5vu"
tasks(project_id)
tasks(status)
tasks(due_at)
```

## Milestones

```text id="fnkmhr"
milestones(project_id)
milestones(due_at)
```

## Resources

```text id="ss5wtw"
resources(project_id)
resources(category)
```

## Activities

```text id="36fgib"
activities(occurred_at DESC)
activities(project_id, occurred_at DESC)
activities(system_id, occurred_at DESC)
activities(service_id, occurred_at DESC)
activities(category)
activities(importance)
```

Activityは特に件数増加が予想されるため、Query Patternに合わせたIndexを優先する。

## Services

```text id="8o3j70"
services(system_id)
services(slug)
```

## Alerts

```text id="fj6k8o"
alerts(status, severity)
alerts(started_at DESC)
```

## Sync Runs

```text id="6iyzlw"
sync_runs(integration_id, started_at DESC)
```

---

# 28. Search

Project SearchはNormalized Dataを利用する。

初期対象:

- Project name
- Description
- Area name

v0.1では単純なCase-insensitive Searchで開始してよい。

Project数が増えた場合は:

- PostgreSQL Full Text Search
- `pg_trgm`

等を検討する。

初期段階からExternal ProviderへSearch Requestを投げる方式は採用しない。

---

# 29. Foreign Key Delete Policy

## 履歴を持たないDependent Entity

Project Physical Delete時:

- milestones
- tasks
- resources

については`ON DELETE CASCADE`を利用可能。

ただし通常はSoft Deleteを優先する。

## History Entity

Activity / Alert等はHistory保持を優先する。

Foreign Key:

`ON DELETE SET NULL`

を推奨する。

---

# 30. Data Flow

基本Data Flow:

```text id="0l0msb"
External Provider
      │
      ▼
Integration Collector
      │
      ▼
Normalizer
      │
      ├── Domain State更新
      ├── 差分判定
      └── Activity / Alert生成
              │
              ▼
          PostgreSQL
              │
              ▼
        Personal Desk UI
```

BrowserがExternal Provider APIへ直接依存する設計は避ける。

---

# 31. Cached Data

External Providerに一時障害が発生しても、Database上の最後の正常Dataを利用可能とする。

UI側では:

- Cached Data
- Last successful sync
- Stale / Error state

を区別する。

External Providerが取得不能になっただけでNormalized Entityを削除してはならない。

---

# 32. Sync失敗時の削除禁止

1回の同期でEntityが取得できなかっただけでは`deleted_at`を設定しない。

Source Delete判定はIntegrationごとに安全な方法で行う。

例:

- Providerが明示的にArchived/Deletedを返した
- Full Syncが正常完了し、その中にEntityが存在しなかった
- Provider固有のDeletion Eventを受け取った

Partial SyncやSync Failure時に大量Soft Deleteを発生させない。

---

# 33. Activity生成とTransaction

可能な場合、Meaningful Domain State ChangeとActivity生成は同一Transaction内で行う。

例:

```text id="km4o65"
Project status:
planning → active

Transaction:
1. projects.status update
2. meaningful_updated_at update
3. activities insert
```

これにより、Stateだけ変わってActivityが存在しない、といった不整合を減らす。

---

# 34. Infrastructure State Change

同一Statusの再取得では通常Activityを生成しない。

例:

```text id="3qqfnf"
healthy → healthy
```

Activityなし。

Meaningful transition:

```text id="oeyv1u"
healthy → warning
warning → healthy
healthy → down
down → healthy
```

Activity生成対象。

`stale`はDerived Stateのため、Stale transition Activityを生成するかどうかはIntegration / Domain Policyで別途判断する。

v0.1では必須としない。

---

# 35. v0.1 Schema Summary

```text id="y1h3y0"
areas
 └─ projects
     ├─ milestones
     ├─ tasks
     ├─ resources
     └─ activities

systems
 ├─ services
 │   ├─ backups
 │   ├─ alerts
 │   └─ activities
 ├─ backups
 ├─ alerts
 └─ activities

integrations
 ├─ sync_runs
 └─ integration_cursors
```

Relationは必ずしもTreeに限定されず、Activity等は複数Domain EntityへOptional Relationを持つ。

---

# 36. v0.1で実装しないもの

Database側では以下をv0.1対象外とする。

- Multi-user ownership
- RBAC
- Organization / Workspace
- Comments
- Project write-back conflict history
- Full audit log
- Long-term metric storage
- Time-series Database replacement
- Infrastructure operation history
- Incident management
- Maintenance window
- SLO / SLA
- Custom Dashboard layout persistence
- AI embeddings
- Vector Database
- Semantic Search
- Activity deduplication aggregation
- Complex dependency graph

---

# 37. 設計原則まとめ

Personal Desk Databaseでは以下を守る。

1. External IDをPrimary Keyにしない。
2. Internal IDとExternal IDを分離する。
3. UIは原則PostgreSQL上のNormalized Dataを参照する。
4. External Providerを必要以上に直接UIへ露出しない。
5. Source of TruthとCacheを混同しない。
6. `source_updated_at`と`synced_at`を分離する。
7. Meaningful UpdateとProvider上の単なる編集を区別する。
8. Source DeleteとDomain Statusを区別する。
9. Historyを守るためSoft Deleteを利用する。
10. `stale`は可能な限りDerived Stateとして扱う。
11. Provider固有MetadataにはJSONBを利用できる。
12. Queryに重要なFieldは通常Columnとして保持する。
13. External Provider障害時にもCached Dataを利用可能にする。
14. Sync失敗をEntity削除として扱わない。
15. Meaningful State ChangeとActivity生成の整合性を保つ。
16. v0.1では必要以上の汎用化を行わない。