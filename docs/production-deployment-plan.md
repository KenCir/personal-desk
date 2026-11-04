# KAGOYA VPS Production実装計画

作成日: 2026-11-04（Asia/Tokyo）。基準main: `b4f19c3f82c789c79d35ee852b2e1efbd5381088`。
作成時に`git ls-remote origin refs/heads/main`、`HEAD`、`origin/main`の一致を確認した。

本書は承認済み実装計画の記録であり、以下の「予定」「未実装」は計画策定時点を示す。承認後、Phase 2〜9のDockerfile、Secret Loader、Health Check、管理スクリプト、CI、運用文書を実装した。最新の実装状況と実行証跡・未検証項目は[検証記録](operations/validation.md)、操作手順は[Production運用](operations/production.md)を参照。Production配置完了を意味しない。既存の開発用`compose.yaml`は維持している。

## 確定方針と変更境界

- 同一Compose Project `personal-desk-prod`に`web`、`worker`、`postgres`の3サービスを定義する。通常稼働はWebとDBのみ。MigrationやBackupの常駐サービス、Queue、Schedulerサービスは追加しない。
- PostgreSQLは18系。ProductionのWebとWorkerはサービスDNS名`postgres:5432/personal_desk`へ直接接続する。Raspberry PiのPostgreSQL 18は開発・テスト用のまま維持する。
- 開発Composeとのマージはしない。常に`-f compose.prod.yaml -p personal-desk-prod --env-file /etc/personal-desk/compose.env`を明示し、開発用`.env`の自動読込を避ける。既存VolumeやProject名を流用しない。
- Node.js **26.13.0**、pnpm **12.16.1**（`packageManager`）、既存Lockfile、Next.js 16 / React 19、Drizzle、workspace構成を維持する。新規依存が必要なら理由とLockfile差分を個別レビューする。
- Collector → Normalizer / planSync → Writer → Database Read Layerを維持。Baseline / Cursor、ActivityのDedup、原子的保存、Retry-After、Session Advisory Lock、明示削除のみのSoft Deleteを変更しない。Notion APIへの書き込みやWebhookは追加しない。
- Workerはprofile `worker`、`NOTION_WORKER_ENABLED=false`既定、`restart: 'no'`。定期処理を始めるには明示的に起動し、有効化フラグも与える。既存`NOTION_SYNC_TARGET`照合も維持する。
- この作業ではVPS接続・実デプロイ、既存Caddyや他サービスの変更、ラズパイDBの変更、実データ移行、Commit・Pushを行わない。以下の実行例は将来の手順であり、今回は実行していない。

## Phase 1. 既存Repository・VPS配置前提の確認

### Repositoryで確認済みの事実

| 対象                      | 現状とDocker化への影響                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/next.config.ts` | workspaceの3 Packageをtranspile。standalone出力は未設定。ルート`.env`を読むためImageへの混入を防ぐ必要がある        |
| `apps/web/package.json`   | `next start --hostname 127.0.0.1`。コンテナでは`0.0.0.0`へbindする別のProduction起動方法が必要                      |
| `apps/worker/src/main.ts` | `tsx src/main.ts`で実行。SIGINT/SIGTERMをAbortControllerへ伝播する。Mappingはworkspace root基準                     |
| workspace exports         | DB・IntegrationはTypeScriptソースをexportする。単にproduction依存だけをコピーしてNodeで直接実行する方式では足りない |
| DB接続                    | 通常Poolはmax 5、connect timeout 5秒、close timeout 5秒。同期には別の専用Session接続がある                          |
| Migration                 | `packages/database/drizzle/`と`drizzle.config.ts`、`pnpm db:migrate`。既存SQL・履歴をそのまま使用                   |
| Health                    | Web専用Health RouteとWorker heartbeatは未実装。画面200やプロセス存在だけでDB／同期正常と判断しない                  |
| CI                        | Checks/E2E、Node 26.13.0、pnpmはpackageManager参照、PostgreSQL 18、一時DB、全外部Actionがcommit SHA固定             |
| 認証                      | アプリ認証は未実装。公開前に既存アクセス制限との接続方針を確定する                                                  |

### VPSで実装前に確定する項目（今回は未確認）

OS・CPU architecture、Docker Engine / Compose v2の版、空きRAM・Disk・inode、既存コンテナの使用量、swap、配置ディレクトリ、Volume格納先、既存Project名、3100番の空き、DNS/TLS・ドメイン、Firewall、Caddyがホストかコンテナか、共有Network名、アクセス制限、Backup保存先と容量・保持期間を確認する。KAGOYA固有のポート開放や既存Networkの存在は推測しない。

ローカルBuildとVPS architectureを合わせる。初期リソース上限は実測後に設定し、Workerの同期ピークとPostgreSQLの接続数に余裕を持たせる。Next Buildの負荷が高ければCIで同一architecture向けにBuildし、同じrelease IDのImageを搬入する。

**完了条件:** 接続図、Project・Volume・ディレクトリ・ポート一覧、Caddy分岐、容量見積り、公開範囲が記録され、既存サービスとの衝突がない。

## Phase 2. Web / Worker用Production Dockerfile

**予定ファイル:** `apps/web/Dockerfile`、`apps/worker/Dockerfile`、`.dockerignore`、`scripts/docker/`、`apps/web/next.config.ts`。

1. Node 26.13.0の公式Imageを検証して固定する。pnpmは`package.json#packageManager`に合わせ、`pnpm install --frozen-lockfile --strict-peer-dependencies`を使用。Build stageと実行stageを分離し、ビルドツールをWeb runtimeに残さない。
2. Webに`output: 'standalone'`とworkspace rootの`outputFileTracingRoot`を追加する。生成された`apps/web/server.js`とworkspace依存、`public`、`.next/static`の配置を実物で確認し、`node apps/web/server.js`をexec形式で起動する。HOSTNAME=0.0.0.0、PORT=3000。開発用start scriptは維持する。
3. Build中は`DATA_SOURCE=mock`を明示し、実DB・Notionへ接続しない。起動時は必ず`DATA_SOURCE=database`。Build時のMockがProduction表示へ焼き込まれないことをDBあり／空／停止ケースで確認する。
4. Workerは既存TS実行方式を維持する方針。`tsx`を実行時依存として整理し、必要なworkspaceソースとproduction依存をコピーする。`node --import tsx apps/worker/src/main.ts`を実証し、pnpmやshellを常駐親プロセスにしない。devDependenciesを除くと現在のtsxが消える点を解決する。
5. 同じWorker Dockerfileに手動操作用`maintenance` targetを用意し、同じreleaseのMigration SQL、Drizzle設定、drizzle-kit、tsx、CLI・smokeの実行依存を含める。これは別Image targetであり、Composeの第4常駐サービスにはしない。PGlite等のCLI静的importも確認し、依存不足をsmokeで検出する。
6. Secret読込Entry PointはPhase 4の契約を実装し、最終プロセスへ`exec`する。非root UID/GID、必要最小限の書込先、`init: true`、Image内からのシェル・資格情報漏えい防止を確認する。
7. `.dockerignore`で`.env*`、実Mapping、`.git`、`.local`、`node_modules`、`.next`、ログ、dump、backup、テスト成果物を除外する。Build ARG/ENVに実Secretを渡さない。

**完了条件:** 実Secretなしで両Imageとmaintenance targetがBuildできる。非rootで起動でき、静的Assetとworkspace importが解決し、Imageに`.env`や実Mappingがない。Dockerfileのbase tag可用性・digestは実装時に確認し、未確認のdigestを書かない。

## Phase 3. PostgreSQL 18を含むProduction Compose

**追加済み構成案:** ルート`compose.prod.yaml`。`name: personal-desk-prod`、3サービス、専用Volume、Network、Secret mount、ログローテーション、Web Health Check、Worker opt-inを記載した。

- DBは`postgres:18-alpine`。18の既定PGDATAに合わせ、Volumeを`/var/lib/postgresql`へmountする。Production Volumeは通常`personal-desk-prod_postgres18_data`となり、開発Volume・旧17 Volumeから分離する。DBに`ports`は設定しない。
- Web/Workerの`depends_on`はDBの`service_healthy`を待つ。これは接続受付の確認であり、Migration適用や継続的復旧を保証しない。通常起動にMigrationを混ぜない。
- Web/DBは`restart: unless-stopped`、Workerは`restart: 'no'`。Web/WorkerのImageは`RELEASE_TAG`必須とし、同一commit由来のImageを使用。配置時に解決済みImage digestも記録する。
- アプリのDB URLはSecretから渡し、Entry Pointがhost=`postgres`、port=5432、DB=`personal_desk`を検証する。外部DB URL、未指定、Secret競合は起動失敗とする。Workerの`NOTION_SYNC_TARGET`は同じ値で固定する。
- Composeの`up`だけではWorker profileを有効化しない。Web/DBからWorkerへの依存を追加しない。`COMPOSE_PROFILES=worker`と有効化フラグを常設のenvファイルへ保存しない。

**完了条件:** productionファイル単独の`config -q`成功、通常`up`でWorker未作成、DBポート非公開、開発Compose差分なし、Production接続先がVPS内DBに限定される。

## Phase 4. Docker Network・Caddy接続・Secret管理

### NetworkとCaddy

`database`はProject内の`internal: true` Networkとし、DB/Web/Workerだけ接続する。Workerは別の`egress` NetworkからNotion HTTPSへ出る。DBはegressやCaddy共有Networkへ参加しない。Session Advisory Lockを維持するため、transaction pooling Proxyは導入しない。

構成案は**ホストCaddyの場合**を仮置きし、Webを`127.0.0.1:3100:3000`で公開する。既存Caddy側の将来のupstream候補は`127.0.0.1:3100`。Caddyfileの編集・reloadは今回行わない。

**コンテナCaddyの場合**はPhase 1で実Network名を確認後、Webの`frontend`を既存external Networkに接続し、固有alias（例`personal-desk-web`）を設定する。upstreamは`personal-desk-web:3000`とし、host portsは削除する。Caddyコンテナ内の127.0.0.1をWeb接続先にしない。新規Networkの作成やCaddyの移動を無断で行わず、変更案のみ作る。

公開経路に既存のVPN・認証Proxyなどの制限があるか確認する。個人データを無認証でInternet公開する設計にはしない。Health Routeは汎用的なstatusのみを返す。

### Secret契約

| Secretファイル        | 渡すサービス | 内容                           |
| --------------------- | ------------ | ------------------------------ |
| `postgres_password`   | postgres     | DB初期化管理Role用password     |
| `web_database_url`    | web          | VPS内DBのread専用Role URL      |
| `worker_database_url` | worker       | VPS内DBの同期write Role URL    |
| `notion_token`        | worker       | Notion Read contentのみのToken |

配置先候補は`/etc/personal-desk/secrets/`。Git外の`compose.env`にはRELEASE_TAG、パス、ポート、Data Source ID等の非Secret設定のみを置く。Mappingは`/etc/personal-desk/notion.mapping.json`をread-onlyでmountする。Repositoryの実MappingをImageへコピーしない。

Postgresは公式の`POSTGRES_PASSWORD_FILE`を利用する。現アプリは`DATABASE_URL_FILE`/`NOTION_TOKEN_FILE`に未対応なのでEntry Pointで追加実装する。読めない／空／通常ENVとの競合を拒否し、末尾改行の扱いを定義し、URL passwordはpercent-encodeする。値をログや引数へ出さない。maintenanceにも同じ検証を適用する。

Compose Secretはホスト上ファイルのmountであり暗号化保管庫ではない。管理ディレクトリとファイルの所有者・権限を制限しつつ、コンテナの非root UIDから読めることを実機検証する。file-backed Secretのuid/gid/mode指定だけに依存しない。Backupにも暗号化・アクセス制御を適用する。

DB初期化RoleはWeb/Workerに配布しない。Phase 6の管理操作で専用Roleを作成する。既存Volumeでは`POSTGRES_PASSWORD_FILE`を替えるだけでRole passwordは更新されないため、RotationはDB側のRole更新→Secret更新→該当アプリ再作成→検証の別手順にする。

**完了条件:** WebはNotion Tokenを読めず、DBは外部公開されず、ラズパイURLを設定した起動は失敗する。Caddy経路を独立した検証環境で確認し、実Caddyの変更案は未適用のまま保管する。

## Phase 5. Health Check・Logging・Graceful Shutdown

**予定ファイル:** `apps/web/src/app/api/health/{live,ready}/route.ts`、Worker heartbeatとprobe、必要な終了処理・テスト。

- Web livenessはプロセスの応答を確認。readinessは短いtimeoutのDB queryと必要Schemaの確認を行い、200/503だけで状態を示す。毎回新しいPoolを作らず、例外・接続文字列を応答に含めない。Mock fallbackを行わない。
- PostgreSQLは`pg_isready`を使用。Role権限・Schema・Migrationの検証は別途行う。
- WorkerはHTTPポートを開けず、ローカルheartbeatファイルを定期更新する方式を追加する。外部API呼出をHealth Checkに使わない。待機中／実行中／停止中、最終進捗、次回実行予定を表現し、長いRetry-Afterや正常な長時間待機を死亡扱いしない。現構成案には未実装のWorker probeを入れていない。
- Workerプロセスの生存と同期の成功は分けて監視する。DB内のIntegration Health、sync_runs、最終Full成功時刻・失敗継続を使用し、heartbeat正常でも同期失敗を通知できる運用にする。Composeのunhealthyだけではコンテナは再起動しない。
- stdout/stderrを使用し、json-fileの10MB×3を初期上限とする。既存Workerのredact/safeIssueを維持。Token、DB URL、Provider payload全文をログ・CI成果物へ出さない。release ID、run ID、statusを追跡できるようにする。
- SIGTERM→Worker既存AbortController→取得中断／Transaction rollbackまたは確定→接続close／Lock解放を検証。stop graceは60秒を初期値とし、実測して調整する。強制終了時は次回のinterrupted_sync回復と冪等性で整合性を確認する。
- Webはstandalone serverのSIGTERM処理とin-flight request、DB pool終了を確認する。独自signal handlerでNextの終了処理を妨げず、必要な補完だけを追加する。Web 30秒、DB 60秒の停止猶予を実測する。

**完了条件:** DB停止でWeb readinessが503、復旧後200。待機・取得・保存中のWorker停止に対し、Lock解放、部分書込なし、二重Activityなし、Secret漏えいなし。

## Phase 6. Migration・Backup・Restore・データ移行手順

### 新規Production DB

1. Phase 1の対象Project・Volumeを照合し、postgresだけ起動する。空DBであることとPostgreSQL 18、接続先名を確認する。
2. 同じreleaseのmaintenance Imageを一時コンテナとして同じProjectのdatabase Networkへ接続する。管理URLをSecret mountし、既存`pnpm db:migrate`を**明示実行**する。Entry Pointは引数指定のコマンドだけを実行し、Workerを暗黙起動しない。
3. 管理RoleでWeb読取RoleとWorker書込Roleを作成・付与する。WebはRead Layerに必要なSELECT、Workerは同期対象・履歴・Cursorへの必要権限を与える。schema usage、sequence権限、将来Migration後のdefault privilegesも検証し、アプリへDDL/superuser権限を与えない。
4. `--check-db`でMigration履歴/hash・Enum・host/dbを確認し、`pnpm db:smoke`をWeb Roleで確認する。空DBの画面を検証してWebを起動する。
5. Worker起動前にMapping、Source ID、Token権限、`NOTION_SYNC_TARGET`を確認し、CLI dry-run→明示once→結果照合→必要時に定期実行の順で進める。Migrationは同期CLI・通常起動から自動適用しない。

maintenance操作はComposeの`run worker`に管理資格情報を常設する方式にしない。Phase 2で専用target、Phase 6で一時コンテナ実行用ラッパーを作り、Project名・Network・接続先を表示して照合する。管理URLをコマンド引数・shell historyへ直接書かない。

### Backup / Restore

- 定期BackupはPostgreSQL 18 clientの`pg_dump -Fc`。Role等のglobalsは必要に応じて`pg_dumpall --globals-only`で別管理し、認証情報を含む機密物として扱う。DBの物理Volumeを稼働中に単純コピーする手順にはしない。
- 実行時刻、release、server/client version、Migration履歴、checksum、サイズ、終了コードを記録。成功扱いはdump終了成功とarchive読取検査後。仮の運用目標は日次・直近7日＋週次4世代、VPS外に暗号化コピー、RPO 24時間、RTO 4時間とし、容量・復元実測後に確定する。
- Backup自動化は将来ホストのtimer等で行い、Compose常駐サービスは3つを維持する。今回はtimer登録を行わない。容量不足・失敗・最終成功期限超過の通知先を運用設計で決める。
- Restoreは**別Project・別Volumeの空DB**へ`pg_restore --exit-on-error`で実施。所有者／Roleを事前確認し、環境間では`--no-owner --no-acl`と権限再設定を検討する。既存DBへの`--clean`や上書き復元を標準手順にしない。
- Migration履歴、件数、FK、Unique、Enum、UUID、Slug、timestamptz、soft delete、Activity dedup_key、Cursor/BaselineとRead Queryを照合する。Backup取得だけで完了とせず、定期Restoreリハーサルを行う。

### ラズパイからのデータ移行（将来の別作業、今回は未実施）

初期データ方式を「新規DBにNotionから初回同期」または「既存DBの論理dump/restore」から明示選択する。初回同期は履歴・内部ID等を移せないため同等のデータ移行とは扱わない。

既存データを移す場合は、別途承認したcutover時間に書込元を整理し、最終Snapshotを取得してVPSの新規DBへ復元する。これは将来の手順であり、この計画作成でラズパイのWorkerやDBを停止・変更しない。18→18でもextension・collation・minor/client version・Role・Schema差を確認する。ラズパイVolumeをVPSへ直接mountしない。

復元ではEntityだけでなくIntegration、sync_runs、Cursor/Baseline、Activity・Dedupも保持する。Mapping fingerprintとSource組を照合し、保持したBaselineを不必要に初期化しない。Notion dry-runと件数・差分を確認してからProduction Workerを明示有効化する。ラズパイDBは開発・テスト用途として残し、以後VPSの変更が自動反映されるとは扱わない。

切戻しはWorker停止→直前の既知ImageでWeb確認の順。Schema非互換なら、直前Backupを別Volumeへ復元し、失われる更新の範囲を確認してから切替を判断する。旧Imageだけに戻せばDBも戻るとは扱わない。ProductionをラズパイURLへ戻すことを通常の切戻し手段にしない。

**完了条件:** 一時DBでMigrationの再実行が安全、アプリRole権限が妥当、Backupから復元でき、履歴と同期冪等性が保たれる。実データ作業は未実施と区別する。

## Phase 7. Docker Build・起動・永続性テスト

**実行先:** 開発DBと隔離したローカル／CIのDocker。専用Project名・専用Volume・非Secret fixtureを使い、実Notionへ通信しない。

| 検証            | 合格条件                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------- |
| Compose静的確認 | production単独でconfig成功、3サービス、DB portsなし、Worker profile/restart/flag保持     |
| Image Build     | frozen install、Node/pnpm一致、Web/Worker/maintenanceがBuild、Secret非混入               |
| 既定起動        | Web/DBのみ。WorkerのContainer・同期Runが作られない                                       |
| Worker opt-in   | フラグなしの明示起動は失敗して書込なし。fixture利用のonce/定期実行のみ成功               |
| 再起動          | Docker daemon／ホスト再起動相当でWorkerは戻らない。手動再開が必要                        |
| 接続先guard     | ラズパイ／localhost／別DB名URLを拒否、target不一致を拒否                                 |
| Web             | DB empty/data/error表示、Asset、ページ遷移、Mock非混入、Health応答                       |
| 同期            | fixture APIまたは注入可能な既存Runtimeで初回Baseline、差分、Dedup、Retry、Lock競合を検証 |
| Shutdown        | SIGTERM/強制終了後の原子性・Lock解放・再実行を確認                                       |
| 永続性          | テストデータ投入→再起動→down（Volume保持）→upで件数/ID/Cursor一致                        |
| Restore         | 別Volumeへの復元、Migration履歴・権限・Read一致                                          |
| Network/Log     | DB外部非公開、Workerの必要なegress、ログ上限とSecret除去                                 |

既存Notion PostgreSQLテストにはlocalhost・`personal_desk_ci`の接続guardがある。Production URLを渡してguardを緩めない。既存suiteは既存CIサービスで維持し、新規Container smokeは専用fixture環境を作る。必要ならtest-only overrideで一時DBをloopbackへ公開するが、productionファイルにDB portsを追加しない。

CI fixtureの削除は、そのrunで作成したProject・VolumeのIDとラベルを照合してから行う。一般的な`docker volume prune`やProductionへの`down -v`を手順に含めない。

**完了条件:** 上記結果とログを記録し、不足した検証は未確認として残す。本計画作成環境にはDockerコマンドがなく、Docker config/build/up/永続性/Restore検証は未実施。

## Phase 8. GitHub Actions CIへのDocker検証追加

**予定変更:** `.github/workflows/ci.yml`、`scripts/ci/`、`docs/ci.md`。

- 既存Checks/E2Eを維持し、独立した`Docker` jobを追加。既存runner設定、contents: read、persist-credentials: false、timeout、PR concurrencyを踏襲する。Fork PRでも実行可能にする。
- Nodeは26.13.0、pnpmはpackageManager、PostgreSQLは18。新規Actionが不要ならDocker CLIを直接使う。必要な公式Actionはrelease commitの完全SHAとversion commentを確認して固定し、既存SHAをタグへ戻さない。
- config検証→両Image・maintenance Build→一時Secret/Mapping生成→DB起動→Migration/Role→Web readiness/DB smoke→Worker未起動確認→fixture Worker試験→永続性/Restoreを実行する。ジョブ全体DATA_SOURCE=mockの影響を受けず、コンテナruntimeではdatabaseを明示する。
- Secretは公開可能な一時値のみ。実Notion/VPS/ラズパイ、Repository Secrets、SSH、Registry push、deployは使用しない。fixture APIのためにProductionのAPI URLや同期guardを緩めない。
- `always()`で診断取得と当該Projectのcleanupを行い、必要なログのみ既存のSHA固定upload-artifactで短期保存する。完全なenv/configやdumpを無条件に成果物へ含めない。
- compose.prod.yamlとDocker関連スクリプト・文書をformat対象へ追加する。DockerfileのRenovate追跡とNode/pnpmの更新整合性を確認する。
- Docker checkの必須化は初回成功後のRepository設定の別作業とし、今回branch protectionを変更しない。

**完了条件:** 実SecretなしのPR CIでDocker jobと既存Checks/E2Eが通り、全Action SHA固定・監査Baseline方針が維持される。

## Phase 9. 運用ドキュメント整備

**予定ファイル:** `docs/operations/production.md`、`docs/operations/backup-restore.md`、非SecretのProduction設定example、README・docs/README・docs/ciへのリンク。

初回配置、更新前Backup、Migration、Web起動、Workerのdry-run/once/定期起動/停止、ログ、Health、Secret rotation、Image rollback、Restore、Disk不足・DB停止・Notion権限エラー・Lock競合の切分けを記載する。各コマンドに対象Projectとenv-fileを明示する。

Phase 2〜8完了後に使用する操作例（Linux shell、今回未実行）:

```sh
# compose.envにはWorker有効化フラグやCOMPOSE_PROFILESを保存しない。
dc() {
  docker compose --env-file /etc/personal-desk/compose.env \
    -p personal-desk-prod -f compose.prod.yaml "$@"
}

# Migration・Role設定を完了してからWebを起動する。
dc up -d postgres
# ここでPhase 6のmaintenance手順を明示実行。
dc up -d web

# Worker用Secret/Mapping準備と接続先確認後、書き込まない事前確認。
dc run --rm --no-deps worker --dry-run

# 1回だけ書込。ImageのENTRYPOINTは追加引数をWorkerへ渡す契約とする。
dc run --rm --no-deps -e NOTION_WORKER_ENABLED=true worker --once

# 定期実行は明示操作。通常envには保存しない。
NOTION_WORKER_ENABLED=true dc --profile worker up -d worker

# 停止後は明示的に有効化・起動するまで再開しない。
dc --profile worker stop worker
dc ps -a
dc logs --tail=100 web
```

profileは認可機構ではない。サービス名を指定した`up worker`/`run worker`も明示起動に相当し、profileを自動有効化し得る。Docker管理者の`start`/`restart`を禁止する機構でもない。既に起動したWorkerは通常の`up web`で停止しないため、停止操作を別途明示する。Worker停止状態を確認してから更新やRestoreを行う。

**完了条件:** 新しい運用者が対象を取り違えずに一時環境で初回起動・Worker停止・更新・復元を再現でき、未確認のVPS情報と本番未実施が明記されている。

## 実装順序とレビュー単位

Phase 1で配置前提を確定→Phase 2〜4でImage/Compose/Secret契約を実装→Phase 5で監視と停止保証→Phase 6で手動運用→Phase 7で一時環境検証→Phase 8でCI化→Phase 9で再現可能なRunbookを完成させる。各Phaseの完了条件を満たしてから進める。実デプロイはこの計画の完了条件に含めない。

計画作成時の成果物は本計画書とCompose構成案だった。承認後の実装差分・検証結果は[検証記録](operations/validation.md)へ分離して管理する。既存Architecture・Notion Pipelineの変更をProduction化の前提にしない。

## 参照した一次資料

- [Docker Compose profiles](https://docs.docker.com/compose/how-tos/profiles/): profile既定非起動とサービス名指定による起動。
- [Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/): `/run/secrets`へのサービス単位mount。
- [Next.js output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output): standalone、monorepo tracing、static/publicの取扱い。
- [PostgreSQL Official Image](https://hub.docker.com/_/postgres): PostgreSQL 18のVolume配置と初期化Secret。

Repository根拠: `README.md`、`docs/architecture/overview.md`、`docs/architecture/notion-sync.md`、`docs/ci.md`、各package.json、`apps/worker/src/{main,config,scheduler}.ts`、`packages/database/src/index.ts`、`.github/workflows/ci.yml`。
