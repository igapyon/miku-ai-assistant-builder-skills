---
name: igapyon-miku-m365-agent-builder
description: Microsoft 365 Copilot 内の軽量な Agent Builder に投入するデータを準備するスキル。Copilot Studio の作成権限を持たない利用者向けの Agent Builder が対象。`igapyon-miku-m365-agent-builder` または `miku-m365-agent-builder` が明示されたときに使用する。Copilot Studio 固有のエージェント作成には使用しない。
---

# Igapyon Miku M365 Agent Builder

## Basic principle

基本として、次の流れを実現する Microsoft 365 Copilot Agent Builder 向けの入力データを提供する。

> 「利用者の質問」→「情報を探す・整理する」→「自然言語で回答する」

## Purpose

Microsoft 365 Copilot の Agent Builder 向け入力データを作成する。

対象は、Copilot Studio の権限を持たないユーザーが利用する Agent Builder とする。

作業前に次の資料を読む。

- Agent Builderの対象範囲を確認するときは、[基礎情報](references/platform/01-baseline.md)を読む。
- 実現可能性を判断するときは、[制限・設計上の注意](references/platform/02-limitations.md)を読む。
- 入力欄と推奨形式を作るときは、[入力項目と推奨形式](references/instructions/01-input-fields.md)を読む。
- Knowledge sourcesを設計するときは、[基本原則](references/knowledge-sources/01-principles.md)と[コンテンツ設計](references/knowledge-sources/02-content-design.md)を読む。
- `miku-text-bundle`との連携を検討するときは、[miku-text-bundle連携案](references/knowledge-sources/03-miku-text-bundle.md)を読む。
- `miku-text-bundle`上流へ依頼するときは、[Knowledge sourceモード追加依頼](references/knowledge-sources/04-upstream-request.md)を使う。

## Workflow

TODO

## Output

TODO

## Constraints

- Microsoft 365 Copilot 内の Agent Builder を対象にする。
- Copilot Studio 固有の機能を前提にしない。
- 製品仕様や制限値が重要な場合は、最新の Microsoft 公式情報を確認する。
- 詳細は今後検討する。
