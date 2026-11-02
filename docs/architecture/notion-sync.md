# Notion自動同期

既存のCollector → Normalizer / planSync → Writer → Database Read Layerを使用する。手動CLIとWorkerは`runNotionSync`を共通の実接続入口とする。Notionは読み取りのみで、独立したMilestones DBや新しいQueueは導入しない。

## ScopeとBaseline

- Areas／Projects／TasksのData Source ID組を既存Integration名へ対応させる。手動同期で作られたIntegrationを再利用する。
- `integration_cursors`の`scope = notion.sync.v1`にWatermarkとversion付きmetadataを保存する。metadataはMapping fingerprint、Baseline確立時刻、最終Full成功時刻、確定Revision、Scopeで観測・保存したEntity ID、次回Retry可能時刻を持つ。
- 未確立ScopeはFullを強制し、Activityをすべて抑制する。Partial／Failedでは確立しない。正常なFullがCommitした時点で、その開始時刻をBaselineとして記録する。
- 既存同期済みEntityにCreatedを遡及生成しない。確立後に初めて取り込むProjectでも`source_created_at`がBaselineより古ければCreatedを生成しない。
- Mapping／API Versionのfingerprintが変わった場合はFullでBaselineを再確立する。既知IDとRetry-Afterは保持する。Data Source組が変わった場合は別Scopeとして扱う。
- 既存DBで未観測のEntityを、新しいScopeへ推測で所属させない。初回の消失判定はできず、観測・登録後のFullからWarning対象になる。

## Activityと原子性

すべてcategory=`project`、importance=`normal`とする。

| 変化 | Activity |
| --- | --- |
| Baseline確立後に作成された新規Project | project.created |
| doneへの遷移 | project.completed |
| doneからの復帰 | project.reopened |
| その他のProject Status変更 | project.status_changed |
| Project Deadline追加・変更・解除 | project.deadline_changed |
| 既存high／urgent Taskの未完了→done | task.completed |

Project-level Deadlineを重要期限として扱う。Synthetic Milestoneは同じ事実を表すので別Activityを重ねない。Area変更は既存どおりMeaningful時刻を更新するがActivityは生成しない。Title／Description／通常Task編集／Task Type／Last Editedのみの変更は対象外。初めて観測した完了済みTaskから完了履歴を推測しない。

`occurred_at`はProvider時刻。Dedup KeyはScope、Entity、Event種別、Provider時刻、確定状態からの次Revision、変更内容hashで作る。RevisionはRun IDではなくTransactionで確定する順序であり、同じProvider時刻の完了→再開→再完了も区別する。Rollback後は同じRevisionで再計画し、Commit後の再取得は差分なしになる。DBの`activities.dedup_key` Unique Constraintも併用する。

Entity・Activity・Cursor／Baseline・成功／Partial Run・Integration Healthを同じTransactionで確定する。失敗時はRollbackし、Lockが有効なら別Transactionで失敗Runを記録する。Lock喪失時は追加保存せず、次のLock保有Runで残ったrunningをinterrupted_syncとして回復する。

## 削除とReconciliation

Data Source Queryのactive／archivedをそれぞれ全ページ取得する。Normalizerは親Data Source・Page ID・更新時刻を検証した`archived=true`または`in_trash=true`だけを削除シグナルとして渡す。古い更新時刻、同一IDの矛盾、不正な親からのシグナルは使用しない。

一覧から消えただけのEntityは、正常なFullでも削除しない。既知のlive Entityについて`missing_from_full_sync_retained`をWarningへ記録する。403／404、共有権限変更、取得途中の失敗を削除へ変換しない。失敗した取得は全体を破棄し、既存Cacheを保持する。

明示削除は対象Entityの`deleted_at`のみを設定する。Projectの子を連鎖削除せず、Activityを削除しない。Read Layerの既存フィルターで削除済みProjectとその画面リンクを除外する。削除済みEntityの再公開は自動復元せず`existing_soft_deleted_entity`として報告する。復元機能は別判断とする。

Deadline解除は既存Synthetic Milestoneをcancelledへ変更する。GitHub URL解除は既存Resourceを保持してWarningにする。

## 排他と実行

専用の単一接続PoolでProvider全体のSession Advisory Lock `(168398833, 2)`を取得し、API開始から保存終了まで保持する。同じ専用セッションで保存Transactionを開始し、そのTransaction内でも所有を確認する。接続の再生成を検出したら保存を中止する。接続を共有Poolへ返さず、終了時に閉じてLockを解放する。既存の保存Transaction用Lock `(168398833, 1)`も維持する。

API取得中はTransactionを開かない。直接接続またはsession poolingが必要で、transaction poolingの接続先は使用しない。`synchronize`はFixture用にDB／Clock／Guardを注入できる内部処理であり、実接続から直接呼ばず共通Runtimeを通す。

Workerは明示有効化が必要。5分ごとのIncremental、6時間ごとのFullを初期値とし、長時間処理中の重複実行・停止期間分の追いつき実行をしない。成功時のみ取得開始時刻をWatermarkへ保存し、2分重ねて再取得する。Partial／Failed時は進めない。APIはPagination CursorをRun内だけで利用する。

既存の最大3回Retry・Timeout・Request間隔を再利用する。長いRetry-Afterと最終AttemptのRetry-Afterを保存し、次回実行の下限とする。認証・権限・Mapping不一致は同一Run内でRetryしない。次の定期実行で復旧を確認できる。Integrationの`enabled=false`は同期を止める。

## 制約

- Poll間の全中間遷移は取得できない。Activityは観測できた状態変化を示す。
- ID一覧は既存Cursor metadataに保持するv0.1向け方式。大量データで専用の所属テーブルが必要になった場合は別途計測して拡張する。
- Propertyの不正行は保持してPartialとする。BaselineとWatermarkを進めないため、修正されるまで再取得される。
- 自動復元、Notionへの書き戻し、Webhook、本番のサービス登録、DB Migrationの自動適用は行わない。

## 検証

Fixture／PGliteでBaseline、Meaningful Change、Dedup、明示削除、消失Warning、Rollback、RetryとSchedulerを検証する。PostgreSQL 18では専用一時DBで複数セッションの排他・Lock接続切断・Transaction原子性・共通Runtimeを検証する。`POSTGRES_TEST_URL`はlocalの`personal_desk_ci`に限定し、`.env`へFallbackしない。実Notionに接続せず、空DB E2Eにデータを残さない。
