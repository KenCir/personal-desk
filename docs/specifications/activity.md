
# `docs/specifications/activity.md`

## 1. Activityとは

外部サービスやPersonal Desk内部で発生した「後から確認する価値のある状態変化」。

単なるログとは区別する。

## 2. Importance

```text
low
normal
high
critical
```

### Dashboard

`normal` 以上。

### Project Detail

`low` 以上。

## 3. Category

```text
source_control
project
infrastructure
deployment
other
```

## 4. GitHub

### normal以上候補

- PR created
- PR merged
- PR closed
- Issue created
- Issue closed
- Release created
- CI failed
- CI recovered

### low候補

- Commit
- Routine push
- Branch activity

## 5. Project / Notion

表示対象候補:

- Project created
- Status changed
- Project completed
- Important Task completed
- Milestone created
- Milestone completed
- Important deadline changed

通常除外:

- Title edit
- Description edit
- Minor property update

## 6. Infrastructure

表示対象:

- Service down
- Service recovered
- Warning triggered
- Warning resolved
- Backup failed
- Backup recovered
- Deployment completed
- Deployment failed

除外:

- 定期Health Check成功
- 通常Backup成功
- Routine metric change

## 7. Dashboard Rule

- importance >= normal
- 最大5件
- 7日以内
- occurredAt DESC

## 8. Deduplication

将来的に同一イベントの連続発生をまとめてもよい。

例:

`CI failed ×3`

v0.1では必須ではない。

## 9. Source of Truth

Normalized ActivityはPersonal Deskが所有する。