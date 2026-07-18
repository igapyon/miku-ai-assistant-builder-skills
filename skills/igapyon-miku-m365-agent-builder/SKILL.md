---
name: igapyon-miku-m365-agent-builder
description: Microsoft 365 Copilot 内の軽量な Agent Builder に投入するデータを準備し、雑多な既存フォルダを Agent Builder 配備用フォルダへ変換するスキル。Knowledge sourcesの中間Markdown生成には同梱`miku-text-bundle`、最終DOCX生成には同梱`miku-md2docx`を利用する。Copilot Studio の作成権限を持たない利用者向けの Agent Builder が対象。`igapyon-miku-m365-agent-builder`または`miku-m365-agent-builder`が明示されたとき、またはこのスキルを使ったフォルダ変換が依頼されたときに使用する。Copilot Studio 固有のエージェント作成には使用しない。
---

# Igapyon Miku M365 Agent Builder

作業時は、最初に同じディレクトリの `index.json` を読み、必要な参照資料を選ぶ。

## Basic principle

基本として、次の流れを実現する Microsoft 365 Copilot Agent Builder 向けの入力データを提供する。

> 「利用者の質問」→「情報を探す・整理する」→「自然言語で回答する」

## Purpose

Microsoft 365 Copilot の Agent Builder 向け入力データを作成する。

利用者の要望から新規に設計するだけでなく、文書、メモ、ソースコードなどが混在する既存フォルダを棚卸しし、Agent Builderへ設定しやすい配備用フォルダへ変換する。

ここでいう「Agent Builder形式」は、Agent Builderへ直接インポートする独自ファイル形式ではない。Configure画面へコピーする入力値と、登録候補のKnowledge sourcesを人が確認・配置できる受け渡し形式を指す。

対象は、Copilot Studio の権限を持たないユーザーが利用する Agent Builder とする。

作業前に次の資料を読む。

- Agent Builderの対象範囲を確認するときは、[基礎情報](references/platform/01-baseline.md)を読む。
- 実現可能性を判断するときは、[制限・設計上の注意](references/platform/02-limitations.md)を読む。
- 入力欄と推奨形式を作るときは、[入力項目と推奨形式](references/instructions/01-input-fields.md)を読む。
- Knowledge sourcesを設計するときは、[基本原則](references/knowledge-sources/01-principles.md)と[コンテンツ設計](references/knowledge-sources/02-content-design.md)を読む。
- 既存フォルダを変換するときは、[雑多なフォルダの変換](references/workflows/01-folder-conversion.md)を読む。
- Knowledge sourcesを生成するときは、[miku-text-bundle連携](references/knowledge-sources/03-miku-text-bundle.md)を読み、同梱`miku-text-bundle`を使用する。
- 登録用DOCXを生成するときは、[miku-md2docx連携](references/knowledge-sources/05-miku-md2docx.md)を読み、同梱`miku-md2docx`を使用する。
- ランタイムの版、選択順、SHA-256を確認するときは、[同梱ランタイム](references/runtime-artifacts.md)を読む。
- バックエンド指定がなければNode.js版を使用する。Java版は明示指定時、またはNode.js版が利用できない場合のフォールバックとする。
- knowledge-sourceモード導入時の判断経緯を確認するときだけ、[Knowledge sourceモード追加依頼（実装済み）](references/knowledge-sources/04-upstream-request.md)を読む。

## Workflow

1. 利用者の目的、想定利用者、代表的な質問、入力元、出力先を確認する。不明点は推測で確定せず、作業を進められる範囲では仮定として記録する。
2. [制限・設計上の注意](references/platform/02-limitations.md)を使い、Agent Builderへの適合性を判定する。適合度が低い要求は「案内」「情報整理」「判断材料の提示」「下書き作成」へ調整する。
3. 入力が既存フォルダの場合は、原本を変更せずに棚卸しする。Knowledge sourcesへ含める範囲、除外、文字コード、単一ファイル上限、分割目安を決める。`.env`と`.env.*`は内容にかかわらず必ず除外する。
4. 同梱`miku-text-bundle`ランタイムが`--mode knowledge-source`をサポートすることを`--help`または`--version`で確認し、dry-run後にknowledge-sourceモードを実行する。未対応なら旧handoff出力で代用せず、v1.5.0以降への更新が必要と報告する。
5. 生成された番号付きMarkdownを中間成果物として`work/knowledge-markdown/`へ置く。`<prefix>-index.md`は対応関係、スキップ、警告、旧生成物候補を確認する管理用ファイルとして`work/`へ置き、変換・登録しない。
6. 番号付きMarkdownを一対一で`miku-md2docx`へ渡し、同じbasenameのDOCXをフラットな`upload/`へ生成する。`agent-builder-input.md`、`items-to-confirm.md`、管理用indexはDOCX化しない。
7. 元リポジトリ基準の相対パスとファイル境界がDOCX本文に残ることを確認する。Knowledge sources間の相対リンクには依存せず、外部参照には確認済みの絶対URLを使う。
8. InstructionsとKnowledge sourcesを分離する。振る舞い、処理順、口調、禁止事項、出力形式はInstructionsへ置き、回答根拠となる事実だけをKnowledge sourcesへ置く。
9. [入力項目と推奨形式](references/instructions/01-input-fields.md)に従い、Name、Description、Instructions、Starter prompts、Knowledge sources、Capabilities、Items to confirmを作る。Instructionsには、登録済みKnowledge sourcesを優先して検索し、取得できた内容を根拠に回答し、根拠資料名を示し、必要な情報が見つからない場合は推測せず明示する方針を含める。
10. `agent-builder-input.md`のKnowledge sources欄では、ローカルの`upload/`を付けず、Agent Builderへフラットに登録するbasenameだけを記載する。例: `knowledge-001.docx`。
11. DOCXの件数、対応、開封可否、文字数、リンク、重複、矛盾、機密情報、スキップ、参照切れを確認し、利用者が承認してから`upload/`内のDOCXだけをAgent Builderへ設定できる状態にする。

## Output

通常は、Agent Builderの各入力欄へコピーできる単一のMarkdownを返す。

既存フォルダを変換する場合は、元フォルダとは別の出力先に次の配備用フォルダを作る。

```text
m365-agent-builder-output/
├── upload/
│   ├── knowledge-001.docx
│   └── knowledge-002.docx
├── work/
│   ├── knowledge-markdown/
│   │   ├── knowledge-001.md
│   │   └── knowledge-002.md
│   └── knowledge-index.md
├── agent-builder-input.md
└── items-to-confirm.md
```

- `upload/knowledge-NNN.docx`: `miku-md2docx`で生成した最終登録候補をフラットに置く。Agent Builderでは原則としてこのディレクトリ内だけを選択する。
- `work/knowledge-markdown/knowledge-NNN.md`: `miku-text-bundle --mode knowledge-source`が生成した中間成果物を置く。
- `work/knowledge-index.md`: 実行設定、元ファイル対応、スキップ、警告、marker、旧生成物候補を記録する。DOCX化・登録ともに行わない。
- `agent-builder-input.md`: Configure画面の項目順で入力値を記載する。
- `items-to-confirm.md`: 版の衝突、正確性、機密性、権限、未対応形式など、人の判断が必要な事項を記載する。

## Constraints

- Microsoft 365 Copilot 内の Agent Builder を対象にする。
- Copilot Studio 固有の機能を前提にしない。
- 入力元のフォルダやファイルを上書き、移動、削除しない。
- `miku-text-bundle`のhandoffモード出力をKnowledge sourcesへ登録しない。
- 管理用の`<prefix>-index.md`をKnowledge sourcesへ登録しない。
- 中間Markdownを最終登録物として扱わない。
- `upload/`にサブディレクトリや管理用ファイルを置かない。
- DOCX間の相対リンクや読み込み順に依存しない。
- `agent-builder-input.md`のKnowledge sources欄に`upload/`、ローカル絶対パス、その他の配備元ディレクトリを記載しない。
- Instructionsには、登録済みKnowledge sourcesを回答根拠として優先し、根拠が見つからない事項を推測で補わない方針を含める。
- マシン固有の絶対パスをKnowledge sourcesへ含めない。元ファイルはリポジトリルート基準の相対パスで識別する。
- フォルダ内の全ファイルを無条件に含めない。
- 読み取れない内容、欠落した文脈、URL、版、更新日を推測で補わない。
- 機密情報、個人情報、秘密情報を出力へ複製する前に必要性を確認する。
- 製品仕様や制限値が重要な場合は、最新の Microsoft 公式情報を確認する。
