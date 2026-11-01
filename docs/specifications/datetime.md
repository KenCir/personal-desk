
# `docs/specifications/datetime.md`

## 1. 方針

「日時がどの瞬間を示しているか」と「どう表示するか」を分離する。

## 2. Timestamp

実際の瞬間を示す日時にはTimezone情報を保持する。

例:

- createdAt
- updatedAt
- occurredAt
- lastCheckedAt
- lastSuccessAt

## 3. Storage

PostgreSQLでは原則:

`timestamptz`

## 4. Display timezone

`Asia/Tokyo`

## 5. Locale

`ja-JP`

## 6. Date

```text
YYYY/MM/DD
```

例:

`2026/09/17`

## 7. Time

24時間表記。

```text
HH:mm
```

## 8. Relative Time

例:

- たった今
- 5分前
- 2時間前
- 昨日
- 3日前

必要に応じてhover等で絶対日時を表示する。

## 9. Database timezone

PostgreSQLのsession/server timezone自体は`Asia/Tokyo`でもよい。

正確性は`timestamptz`と明示的な時刻処理によって保証する。