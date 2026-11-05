# Personal Desk Production運用

Web、明示起動のNotion Worker、PostgreSQL 18を同一Compose Projectに置く。Production Web/Workerは`postgres:5432/personal_desk`へ接続する。Raspberry Pi PostgreSQLは開発・テスト用のままで、ここから操作しない。

このRunbookは実装済み構成の操作手順であり、KAGOYA VPSへの配置済みを意味しない。実行証跡と未検証項目は[検証記録](validation.md)、Backupは[Backup/Restore](backup-restore.md)を参照。

## 配置前に確認すること

- VPS OS・CPU architecture、Docker Engine/Compose v2、Disk/inode/RAM、既存Project・Volume・ポート、ホスト再起動ポリシーを記録する。
- `provision.mjs` / `operations.mjs`をホストで実行するため、運用端末にはNode.js 26.13.0が必要。これらはNode標準ライブラリのみを使い、ホストへのアプリ依存インストールや常駐Nodeサービスは不要。VPSへのNode導入は今回実施していない。
- Web は `127.0.0.1:3100` に限定する。ホストの 3100/8443 と Docker の専用 Project 名の空きを確認する。
- 配布先は `/home/debian/DockerService/personal-desk/`。検証された SHA から `compose.prod.yaml` を `compose.yaml` として配置し、`scripts/docker/{operations,provision}.mjs` は相対パスを保ってコピーする。合わせて env と Mapping の example を用意する。ホストには Docker CLI と Node.js 26.13.0 が必要。
- 日次バックアップの一時保存先は `/var/backups/personal-desk/`（0700）。専用 Restic 保存先の容量・復元試験を確認する。
- Web/Worker/DB の上限は順に 512/512/768 MiB、0.75/0.5/1 CPU。Fixture に加えて初回同期時の OOM・Swap と既存サービスの余力を確認する。

## ファイルとSecretの準備

Linux shellで配置ディレクトリから実行する例。`/etc/personal-desk`は候補であり、既存サービスと共用しない。

1. Git外へ`compose.prod.env.example`をコピーし、`/etc/personal-desk/compose.env`としてrelease ID・配置パス・Source ID・ポートを設定する。`COMPOSE_PROFILES`や`NOTION_WORKER_ENABLED`を常設しない。
2. 空の新規Secretディレクトリに`node scripts/docker/provision.mjs /etc/personal-desk/secrets`を実行する。DB管理/Web/Worker用に別のランダムpasswordとURLを作る。既存ファイルは上書きしない。既存DBに対して再生成をpassword rotationの代用にしない。
3. `notion_token`を別途Secretファイルとして作成し、NotionはRead contentだけの権限にする。Tokenをshell引数・history・Gitへ入れない。Webのみを使う間はWorker用Tokenを用意する必要はない。
4. `notion.mapping.example.json`をGit外の`/etc/personal-desk/notion.mapping.json`へコピーし、実Schemaに合わせる。Composeはread-only mountし、存在しないファイルをディレクトリとして自動作成しない。
5. SecretファイルはDockerfileへCOPYしない。Compose file Secretはホストファイルのbind mountであり、暗号化保管庫ではない。ホスト管理ディレクトリは管理者のみアクセス可能とし、コンテナの読取UIDに各ファイルを割り当てる。

Node Imageのユーザーは`node`（UID 1000）。admin/web/workerのURLとNotion TokenはUID 1000が読める0400相当、Mappingはread-onlyとする。Postgres passwordは採用したImageの`postgres` UIDを`docker run --rm --entrypoint id postgres:18-alpine postgres`で確認して割り当てる。AlpineのUIDをDebianと同じと仮定しない。Compose Secretのuid/mode指定だけに依存せず実際に読めることを確認する。

Secret Loaderは`*_FILE`必須、空・複数行・通常ENVとの競合を拒否する。URLは認証情報付き、host=`postgres`、port=5432、DB=`personal_desk`、query/hashなしに限定。Web Roleは`desk_web`、Workerは`desk_worker`、maintenanceは`personal_desk`。特殊文字を含むpasswordはURL-encodeする。エラーは値やファイル内容を表示しない。

## Release の取得と初回起動

成功した Publish GHCR release の artifact から `release.env` を取得し、SHA と3つの digest を照合して配置ディレクトリに保存する。これは workflow が生成する4行の非機密ファイルで、読み込む前に内容を確認する。`docker buildx imagetools inspect ghcr.io/kencir/personal-desk-web:sha-<full SHA>` で manifest と両 architecture を確認できる。Private Package は pull 用アカウントで `docker login ghcr.io --username USER --password-stdin` に read:packages 資格情報を安全に入力する。

```sh
cd /home/debian/DockerService/personal-desk
export DESK_COMPOSE_FILE="$PWD/compose.yaml"
export DESK_ENV_FILE=/etc/personal-desk/compose.env
export DESK_PROJECT=personal-desk-prod
export PROD_SECRET_DIR=/etc/personal-desk/secrets
set -a
. ./release.env
set +a
dc() {
  docker compose --env-file "$DESK_ENV_FILE" -p "$DESK_PROJECT" -f "$DESK_COMPOSE_FILE" "$@"
}

dc config -q
dc --profile worker pull
docker pull "ghcr.io/kencir/personal-desk-maintenance:$RELEASE_TAG@$MAINTENANCE_DIGEST"
dc up -d --wait postgres
node scripts/docker/operations.mjs migrate
node scripts/docker/operations.mjs roles
dc up -d --wait web
dc ps -a
curl --fail http://127.0.0.1:3100/api/health/ready
```

Tailnet の HTTPS と 8443 への grants/ACL を確認した上で、配置作業時に `tailscale serve --bg --https=8443 http://127.0.0.1:3100` を設定する。許可端末の HTTPS 接続と非許可端末からの拒否を検証する。Funnel は無効のまま運用する。

Production Composeは**単独**で使う。開発用`compose.yaml`とマージしない。通常の`up`はDB/Webだけで、Workerは作られない。Migrationは上記の管理コマンドからだけ実行し、Entry Point、DB初期化SQL、Worker起動に組み込まない。

maintenance Imageはdrizzle-kit等の管理ツールを含む一時操作用。常駐サービスは追加しない。管理スクリプトは指定ProjectのPostgresが18系か、DB名とRoleが一致するか確認してから一時コンテナを起動する。`admin_database_url`はWeb/Workerに渡さない。

Standalone出力はDockerのBuild stageで`DESK_STANDALONE=1`を指定して有効にする。従来のローカル`pnpm build`/`pnpm start`は通常のNext出力を維持する。Standaloneをローカル検証する場合だけ`DESK_STANDALONE=1 DATA_SOURCE=mock pnpm build`を実行し、生成した`apps/web/.next/standalone/apps/web/server.js`を直接起動する（static/publicのコピーはDockerfileと同じ配置が必要）。

`roles`は専用DBのPUBLIC権限を取り除き、Web/WorkerにSELECT、Workerだけに同期対象テーブルのINSERT/UPDATEを付与する。WorkerにDELETE/DDL、Webに書込、両者にsuperuser権限を与えない。既存Roleに他Roleのmembershipがある場合は失敗させる。Migration後も`roles`を再実行し、新テーブルに書込が必要なら明示的な権限変更をレビューする。

## Workerの明示操作

まずDBの対象・MigrationとMappingを確認する。下記CLIも本番Worker ImageのSecret Loaderを使用する。

```sh
dc run --rm --no-deps --entrypoint node worker \
  --import /app/scripts/docker/preload.mjs --import tsx \
  /app/packages/integrations/src/notion/cli.ts --check-db
dc run --rm --no-deps worker --dry-run
# 書込を許可する操作だけ有効化する。
dc run --rm --no-deps -e NOTION_WORKER_ENABLED=true worker --once
# 成功Run、件数、Baseline、差分を確認してから定期実行を開始する。
NOTION_WORKER_ENABLED=true dc --profile worker up -d worker
dc --profile worker logs --tail=100 worker
dc --profile worker stop worker
```

profile、既定false、`restart: 'no'`の3段階で制御する。Docker/ホスト再起動後、クラッシュ後、手動停止後は自動再開しない。Docker管理者がサービス名で`start`/`restart`する操作は明示起動に含まれる。profileはアクセス制御ではない。既に稼働中のWorkerは`up web`で止まらないので、更新・Restoreの前に停止確認する。

停止期間のJobは蓄積せず、既存Cursor/BaselineからFull/Incrementalを判断する。Notionへの書き戻しはしない。手動CLIとWorkerは同一のSession Advisory Lockを使うので、transaction pooling Proxyは接続先にしない。

## Health・ログ・停止

- `/api/health/live`: HTTPプロセスの応答。`/api/health/ready`: DBと必要Schema/Enumの読取確認。失敗は503、詳細やSecretを返さない。Mockではreadyにならない。
- Workerは`/tmp/worker-heartbeat.json`を更新し、probeで更新時刻・状態・PIDを検査する。長いpoll/Retry-After待ちでも生存を示す。同期成功の保証ではない。
- 同期状態は`integrations`、`sync_runs`、Cursor metadataの最終Full成功・Retry情報を別に監視する。失敗Run継続や最終成功期限超過の通知先を配置時に設定する。heartbeatだけでNotion障害を見逃さない。
- ログはstdout/stderr、json-file 10MB×3。`dc logs --tail=100 web postgres`、Workerはprofile付きで確認する。完全なenv/config・dump・Provider payloadをチケットやCI成果物へ貼らない。
- SIGTERMでWorkerはAbortControllerを通して停止し、DB TransactionとLockを解放する。猶予60秒。WebはNext standalone既存のSIGTERM処理で接続受付を止めてリクエスト完了を待つ（30秒）。DBは60秒。Webの終了時にOSが残りのDBセッションを切断する。独自signal handlerでNextのdrain処理を置き換えない。
- `unhealthy`だけでComposeは再起動しない。Worker異常時は原因・失敗Run・Lockを確認し、人が明示的に再開する。

## 更新・Rotation・切戻し

1. Workerを停止し、現在のrelease、Image digest、Migration履歴、Volume名を記録する。
2. Backupを取得し、復元可能性を確認する。必要な停止時間を確保する。
3. 次releaseのdigestを確認してpullし、隔離環境の検証を通す。Migration互換性を確認し、管理操作としてmigrate→rolesを実行する。
4. Webを再作成し、Health・画面・読取を確認する。Workerはdry-run/onceを経て必要な場合だけ明示起動する。
5. Schema互換なら前ImageへWebを戻せる。非互換なら旧Backupを別Project/Volumeへ復元し、失われる更新を確認して切替を判断する。ラズパイへの接続変更を切戻し手段にしない。

Password rotationは既存Volumeに対して環境変数を替えるだけでは成立しない。Worker/Webを停止し、管理RoleでDB側のpasswordを更新、対応するSecretを更新、コンテナ再作成後に確認する。Web/Worker passwordを変更する場合はURL Secret更新後に既存管理Secretで`roles`を明示実行できる。管理Role passwordの更新は既存管理接続で行い、`postgres_password`と`admin_database_url`を同時に一致させる。実Secretをコマンド引数へ置かない。

## 障害時

DB接続不可: postgres Health・Disk・Mount・Role権限を確認。Webは503となりMockへ切り替わらない。Volumeを削除して直そうとしない。

Worker disabled: 有効化を忘れたか確認し、必要な場合だけ明示操作する。Token/Mapping/Source ID不一致は正しい設定へ修正し、dry-runで確認する。

Lock競合: 同じProviderのCLI/Worker実行を確認。正常実行中のLockを強制解除しない。強制終了後は次Runのinterrupted_sync回復と履歴を確認する。

Disk不足: ログ・Backup保持を確認し、対象を特定する。`docker volume prune`、Productionの`down -v`、既存Volumeへの別major Image起動は禁止する。
