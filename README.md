# Personal Desk

プロジェクト、今日の予定、アクティビティ、インフラをまとめて確認する個人向けワークスペースです。v0.1は**閲覧専用**で、MockとPostgreSQLのRead Data Sourceを切り替えられます。開発時の既定はMock、Productionでは明示指定が必要です。

## 起動

CIと同じNode.js 26.13.0、pnpm 12.16.1を使用します。依存関係は既存Lockfileに固定します。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

[http://127.0.0.1:3000](http://127.0.0.1:3000) を開きます。Mockモードの起動にPostgreSQL、外部サービスの認証情報、`.env`は不要です。

Production相当の確認:

先に環境変数またはルート`.env`で`DATA_SOURCE=mock`（サンプル）または`DATA_SOURCE=database`を指定してください。

```sh
pnpm build
pnpm start
```

| Route                        | 内容                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| `/`                          | 今日の予定・タスク・期限、インフラ概要、Project最大5件、Activity最大5件  |
| `/projects`                  | 名前・説明・Area検索、Status/Area Filter、完了グループの折り畳み         |
| `/projects/[slug]`           | 概要、次のMilestone、重要Resource、最近のActivity                        |
| `/projects/[slug]/activity`  | Project内Activity、Category Filter、30件ずつ追加                         |
| `/projects/[slug]/resources` | 用途別の外部リンク                                                       |
| `/activity`                  | 横断検索、Category/Importance/Project Filter、日本時間の日付グループ     |
| `/infrastructure`            | Overall、Systems、Services、Backups、Active Alerts、選択中Sourceの再取得 |
| `/settings`                  | Dark/Light/System、表示状態プレビュー                                    |

Projectの例: `/projects/personal-desk`。外部リンクは公開サービスのトップページ等への**サンプル**であり、実際のProjectや監視対象には接続していません。

## 開発用PostgreSQL

開発・CIの標準はPostgreSQL 18（`postgres:18-alpine`）です。Docker Composeが利用できる環境で実行してください。既存17系のデータが必要な場合は、起動前に下記の移行手順を確認してください。

```sh
# 初回のみ .env.example を .env にコピーし、必要なら接続情報を変更
docker compose up -d postgres
pnpm db:migrate
```

初期値はlocalhost:5432 / database・user・passwordともに`personal_desk`です。ポートはloopbackにのみ公開します。18用の新規`postgres18_data` Volumeを`/var/lib/postgresql`へMountし、公式Imageの既定`PGDATA=/var/lib/postgresql/18/docker`を使用します（[公式仕様](https://hub.docker.com/_/postgres)）。`.env`の`DATABASE_URL`がこのローカルDBを指していることを確認してからMigrationを実行してください。

### 既存PostgreSQL 17 Volumeの保護と移行

旧`postgres_data`（通常は`<Compose Project>_postgres_data`）は削除・初期化・18への接続を行いません。18用Volumeは別名なので、起動しても旧データは自動移行されず、空DBから開始します。`docker compose down -v`やVolumeの削除・pruneを移行手段として使わないでください。

既存データが必要な場合は、以下を別途計画して実施してください。今回の構成変更ではデータ移行を自動実行しません。

1. 旧ContainerのImage・Mount・Compose Project名を確認し、旧Volume名を記録します。Dockerを利用できない環境ではVolumeの存在・内容は未確認です。
2. 旧17サーバーを使用し、書き込みを止めた整合性のある状態で論理バックアップ（`pg_dump`と必要なRoleの`pg_dumpall --globals-only`）を取得し、復元可能性を確認します。18 Imageで旧Volumeを起動しないでください。
3. 別Project・別Volume・別ポートで18を起動し、バックアップを復元します。Roleや所有者の扱いを確認し、復元先に対してのみ未適用Drizzle Migrationを適用します。既存Migrationの履歴は維持します。
4. 件数・制約・Enum・日時・Read Queryを比較してから接続先を切り替えます。旧Volumeとバックアップは保持します。

[PostgreSQL公式のMajor Upgrade手順](https://www.postgresql.org/docs/18/upgrading.html)ではdump/restoreや`pg_upgrade`が必要です。単なるImage交換・ディレクトリ移動では17のデータを18に変換できません。`pg_upgrade`は旧新Binaryと事前検査が必要な別作業として扱い、元Volumeを共有するlink方式による自動Upgradeは行いません。外部Raspberry Piの既存PostgreSQL 18は、このCompose・移行手順の操作対象外です。

Renovateは既存のDocker datasourceルールでComposeとCIのImageを追跡します。`18-alpine`は18系の更新を受け取るTagです。将来のMajor更新PRではVolume・データ移行を再確認し、Tagだけを変更して既存Volumeを流用しないでください。

Schema変更時:

```sh
pnpm db:generate
pnpm db:migrate
```

Migrationは`packages/database/drizzle/`にあります。13テーブル、UUID、外部ID分離、Foreign Key、検索用Index、Soft Delete、`timestamptz`を定義しています。`stale`はDB Enumにも保存値にも含めていません。

### Data Sourceの切替

ルートの`.env`（または起動環境変数）で指定し、Webを再起動します。環境変数が`.env`より優先されます。

```ini
DATA_SOURCE=database
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/personal_desk
```

`DATA_SOURCE=mock`ではMockを使用します。開発・テスト時の未指定はMock、Production時の未指定は設定エラーです。不正な値、DB接続失敗、Query失敗からMockへの自動Fallbackはありません。空DBはEmptyとして表示します。DatabaseモードのNext Eventは「Google Calendarは未接続です。」と表示し、架空の予定は混ぜません。

既存Connection Factoryの接続をServer側で再利用します。Project、Area、Milestone、Task、Resource、Activity、InfrastructureのReadに対応しています。Activity APIは30件ずつ、`occurred_at DESC, id ASC`のCursorで取得します。画面を開いた時刻を上限とし、同時刻の履歴もIDで安定して取得します。

既存の追加Migration `0001_kind_wrecker.sql`はTask Statusに`waiting`を追加します。実DBでwaitingを書き込む前に、未適用Migrationを確認して適用する必要があります。Readのための再適用は不要です。今回の検証では実DBへMigrationを適用せず、データ投入もしていません。

```sh
pnpm db:smoke
```

上記は実PostgreSQLの読み取り専用TransactionでRead Queryを確認します。Notionの手動同期と任意起動のWorkerは下記を参照してください。

## Notionの手動同期

`packages/integrations/src/notion/`がNotionの読み取り、Schema検証、正規化、差分計算、PostgreSQLへの保存を担当します。既存のDatabaseDataSourceは変更しません。Notion REST APIは`2026-03-11`に固定し、Node.jsの`fetch`を使用します（Notion SDKは使用しません）。[APIバージョン](https://developers.notion.com/reference/versioning)と[Data Sourceの取得](https://developers.notion.com/reference/retrieve-a-data-source)に従います。

1. [Notion Developer portal](https://app.notion.com/developers/connections)でInternal connectionを作成します。Read contentのみを有効にし、Update/Insert content、コメント権限は無効、ユーザー情報はNo user informationにします。
2. Content accessからAreas、Projects、Tasksの各Databaseだけを共有します。Tokenをルート`.env`の`NOTION_TOKEN`へ保存します。チャット、Source Code、CLI引数へTokenを貼り付けないでください。
3. `.env.example`を参考に3つの`NOTION_*_DATA_SOURCE_ID`を設定します。Database IDとData Source IDは別物です。DatabaseのURLしか分からない場合、URL中のDatabase IDを使って次のコマンドで候補を確認します。複数候補がある場合は目的のSourceを明示的に選びます。

```sh
pnpm notion:sync --inspect-database DATABASE_ID
pnpm notion:sync --schema-only
```

Schemaは推測で合わせません。出力されたPropertyの型、Relation先、Status Optionを確認します。名前や型が違う場合は`notion.mapping.example.json`をコピーし、`NOTION_MAPPING_FILE`にルートからの相対パスを設定して編集します。`property`には実際の名前またはProperty IDを使用できます。Statusは大文字小文字を含め完全一致です。`status`型と`select`型の変更もConfigurationで明示します。未知StatusはFallbackせず、そのEntityを保存しません。

Description / Deadline / GitHub / Due / Priority / TypeはMappingを`null`にすると管理対象から外せます。必須Title、Status、RelationのMappingは省略できません。Relationの値は空を許可しますが、未知の参照先や複数参照を勝手に1件へ丸めません。Descriptionが未設定の場合、Page本文やNotesを代用しません。

```sh
# APIとMapping、予定件数・Relationを確認。DBはREAD ONLY、Sync Runも保存しません。
pnpm notion:sync --dry-run
# 同じ実Notionスナップショットを、独立したメモリ上のPGliteへ2回取り込み検証。
# 実PostgreSQLには接続せず、Notionへも書き込みません。
pnpm notion:sync --verify
# DB名、Host、Migration履歴・hash、Task Enumを読み取り専用で確認。
pnpm notion:sync --check-db
```

実同期前に`--check-db`の対象が意図した開発DBであることを確認し、表示された`host:port/database`を`.env`の`NOTION_SYNC_TARGET`へ設定します。URLとこの値が一致せず、または接続先が返すDB名が違う場合、同期は中止します。Migration未適用も書き込みを止めます。

`0001_kind_wrecker.sql`が未適用なら、対象DB・SQL内容・バックアップ状況を確認したうえで既存`pnpm db:migrate`を別途実行します。同期CLIがMigrationやDB初期化を自動実行することはありません。

```sh
pnpm notion:sync
pnpm notion:sync --dry-run
pnpm notion:sync
```

初回と再実行でEntity件数・Internal ID・Slugが維持され、変更がなければ再実行の`created`/`updated`は0になります。`synced_at`は確認時刻として更新しますが、業務データの更新件数には含めません。結果は`integrations`/`sync_runs`へ保存されます。部分失敗は`partial`と終了コード1で報告し、不正なEntityは更新しません。API取得途中の失敗はその実行のEntity保存を中止します。保存途中のDBエラーは全Entity変更をロールバックします。

`DATA_SOURCE=database`でWebを再起動すると、既存Dashboard／Projects／Project Detailから同期結果を閲覧できます。`pnpm test:e2e:database`は空DB専用テストのため、同期後の開発DBには使わず独立した空DBを指定してください。

手動CLIとWorkerは同じCollector／Normalizer／WriterとProvider全体のSession Advisory Lockを使用します。API取得中はDB Transactionを保持せず、Lock接続喪失時は保存を中止します。明示的なArchived／TrashだけをSoft Deleteし、正常な全件取得でも一覧からの消失だけでは削除しません。既知の消失EntityはWarningで報告します。Notionへの書き込みとWebhookは実装していません。

明示的にDeadlineが空になった場合は管理対象のSynthetic Milestoneだけをcancelled・期限なしへ変更します。GitHubが空になった場合は既存管理リンクを残してWarningを出します。ProjectのSoft DeleteによってTask／Milestone／Resourceを連鎖削除せず、Activity履歴も保持します。

日付のみはTokyoの午前0時、時刻付きはOffsetまたは明示Timezoneから絶対時刻へ変換します。Date rangeは`start`を期限に使います。曖昧なTimezone／不正日付は拒否します。Task TypeはUIの並べ替えに使わず、正規化済みの値だけをSync Run metadataへ残します。最初からDoneのEntityの完了時刻は、Notionが完了日時を提供しないためLast Edited Timeを初期値とし、以後Doneのままなら維持します。

## Notion Worker

WorkerはWebとは別の明示起動プロセスです。起動コマンドはサービス登録・Migration・DB初期化を行いません。まず設定を確認し、Dry Runを実行します。

```sh
pnpm notion:worker --help
pnpm notion:worker --dry-run
```

書き込みを実行する場合だけ、既存の`NOTION_SYNC_TARGET`に加えて`NOTION_WORKER_ENABLED=true`を設定します。

```sh
# 1回だけ同期して終了
pnpm notion:worker --once
# 明示起動中だけ定期実行。SIGINT/SIGTERMで停止
pnpm notion:worker
```

初期値はIncremental 5分、Full Reconciliation 6時間です。`.env.example`の`NOTION_POLL_INTERVAL_MS`／`NOTION_FULL_INTERVAL_MS`で変更できます。実行をawaitしてから次回を待つため重複実行せず、停止期間分のJobを溜めません。再起動後のFull要否はDBに保存した最終成功時刻から判断します。

ScopeのBaselineがない場合はFullを実行し、すべてのActivity生成を抑制します。正常終了時だけBaselineを登録します。既存同期済みEntityもこの対象です。確立後は新規ProjectのCreated、Projectの状態／期限変更、high／urgent Taskの完了をActivity化します。新たに閲覧可能になっただけの古いProjectのCreatedは生成しません。Mapping変更時はBaselineを再確立します。

Entity・Activity・Baseline／Cursor・成功Runは同じTransactionに保存します。Partial／FailedではCursorを進めません。取得時刻に2分の重なりを持たせ、冪等UpsertとActivityのUnique Dedup Keyで再取得を吸収します。`enabled=false`のIntegrationは同期しません。長いRetry-AfterはDBへ記録して早期再実行を防ぎます。Lock競合は`skipped`で、障害扱いにしません。

既存の`integration_cursors`を使うため追加Migrationはありません。詳細なルールと制約は[Notion自動同期](docs/architecture/notion-sync.md)を参照してください。

## 検証

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm format:check
```

- Vitest: Domain、UI操作、PGliteによるMigrationの実行と制約の検証。
- Playwright: インストール済みGoogle Chromeを使用。Production Buildを事前に作成してください。localhost:3000のMock Serverを明示的に自動起動します。既存Serverは再利用しません。
- `pnpm test:e2e:database`: Migration適用済みの空Databaseを`DATABASE_URL`（またはルート`.env`）に指定した場合のみ実行します。port 43101で空画面、port 43102で接続失敗時のError/503を確認します。既存データの削除、Seed、Migrationは行いません。
- E2Eの画面キャプチャは`test-results/`へ保存します（Git対象外）。
- Dockerの実起動は別の検証です。PGliteの成功はDocker Compose上のPostgreSQL接続成功を保証しません。
- CIでは独立したPostgreSQL 18 Serviceの`personal_desk_ci`へDrizzle Kit Migrationを適用し、`POSTGRES_TEST_URL`を明示した`packages/database/src/postgres.test.ts`でVersion・13テーブル・Foreign Key・Index・Enum・`timestamptz`・Read Queryを検証します。Notionの`postgres.test.ts`は同じServiceに専用の一時DBを作り、Session Lock・接続切断・Transaction整合性を検証後にそのDBだけを削除します。テストRoleには一時DBの作成権限が必要です。既存の空DB E2EへFixtureを残しません。通常の`pnpm test`は実DBテストをSkipし、個人用`.env`には接続しません。

## 表示状態の確認

設定画面のリンク、またはQuery Parameterで各SectionのLoading/Empty/Error/Staleを再現できます。

```text
/?state=error&section=event
/?state=loading&section=tasks
/activity?state=empty
/projects?state=error
/infrastructure?state=cached&section=services
/infrastructure?state=stale&section=systems
```

`state`: `ready` / `loading` / `empty` / `error` / `cached` / `stale`。

`section`: `event` / `tasks` / `milestone` / `projects` / `activity` / `resources` / `infrastructure` / `overall` / `systems` / `services` / `backups` / `alerts`。省略するとそのページの対象Section全部に適用します。

`cached`は取得エラーでも既存データを保持する表示です。`stale`はSectionのFreshness警告プレビューで、保存されている対象Statusを書き換えません。実際のSystem/ServiceのStaleは時刻差から計算します。「再試行」はプレビューを解除して選択中Data Sourceを読み直します。「更新」は画面全体をReloadせず、Server Componentの選択中Data Sourceを再取得します。

## 構成

```text
apps/web/             Next.js App Router、画面、shadcn/ui Button、Data Source境界
apps/worker/          Notion定期同期の明示起動プロセス
packages/core/        Domain型、並べ替え、絞り込み、日時・状態判定
packages/database/    Drizzle Schema、Migration、DB接続Factory、Read Query
packages/i18n/        ja-JP Dictionary、表示Label、相対時刻
packages/integrations/ Notion Collector、Normalizer、差分計画、Writer、手動CLI
tests/e2e/            実ブラウザの受け入れテスト
docs/                 設計書と運用手順
```

UIはWeb以外でまだ共有しないため`packages/ui`は作成していません。

詳細な判断・検証結果・残課題は[IMPLEMENTATION.md](IMPLEMENTATION.md)を参照してください。仕様の責務は[docs/README.md](docs/README.md)に従います。
