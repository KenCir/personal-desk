# `docs/specifications/resource.md`

## 1. Resourceとは

Projectから参照する外部システム、ドキュメント、Repository、Deployment、監視画面など。

## 2. Type

Resourceそのものの種類。

```text
repository
documentation
deployment
monitoring
service
other
```

## 3. Category

UI上での用途分類。

```text
development
documentation
deployment
monitoring
other
```

## 4. Provider

Resourceを提供しているサービス。

例:

```text
github
notion
grafana
prometheus
custom
```

## 5. TypeとProvider

例:

```text
type = repository
provider = github
```

ProviderとResourceの用途は別概念として扱う。

## 6. Required information

Resourceは最低限以下を持つ。

- ID
- Project relation
- Name
- Type
- Category
- Provider
- URL

Optional:

- Description
- Primary flag

## 7. v0.1

Personal Desk UIからResource編集は行わない。