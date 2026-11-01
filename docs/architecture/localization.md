
# `docs/architecture/localization.md`

## 1. 基本方針

UIは自然な日本語を使用する。

一般的な技術用語は無理に翻訳しない。

## 2. Primary locale

`ja-JP`

## 3. 技術用語

そのまま使用する例:

- GitHub
- PR
- Issue
- CI
- CPU
- RAM
- API
- Docker
- Grafana
- Immich
- Deployment

## 4. Source code

以下は英語:

- Variable
- Function
- Type
- Interface
- Component
- Filename
- Directory
- DB schema

## 5. UI strings

Component内へ表示文字列を無秩序にベタ書きしない。

軽量Dictionaryを使用する。

例:

```text
dashboard.title
dashboard.today
projects.title
projectDetail.activity
```

## 6. v0.1 i18n

対応:

- ja-JP dictionary
- `t()` style lookup
- UI文字列とLogicの分離

対応しない:

- Locale routing
- `/ja`
- `/en`
- Language selector
- Browser language auto-detection
- English UI
- Dynamic locale loading

## 7. 将来

必要になった場合のみ`en`等を追加する。

v0.1の目的は多言語提供ではなく、表示文言とApplication Logicの分離。