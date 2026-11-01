
# `docs/architecture/backend.md`

## 1. Runtime

- Node.js
- TypeScript

## 2. Initial architecture

v0.1ではNext.js server functionalityを利用してよい。

## 3. Responsibilities

Backendは以下を担当する。

- DB access
- Authentication/Authorization if required
- External integration access
- Data normalization
- Synchronization
- Activity generation
- Cache management

## 4. Worker

初期実装では必須ではない。

定期同期やWebhook処理が増えた時点で:

`apps/worker`

へ分離可能な構造にする。

## 5. Browser responsibilities

Browserから直接GitHub / Notion等へ複数API requestを飛ばす設計を避ける。

BrowserはPersonal Desk Backendを利用する。

## 6. Read-heavy

v0.1はread-heavy Applicationとする。

外部Source of Truthへのwrite-backは基本的に行わない。