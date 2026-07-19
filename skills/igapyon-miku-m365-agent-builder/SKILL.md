---
name: igapyon-miku-m365-agent-builder
description: Microsoft 365 Copilot 内の軽量な Agent Builder に投入するデータを準備し、雑多な既存フォルダを二段階でAgent Builder配備用フォルダへ変換するスキル。第1段階で同梱`miku-text-bundle`が扱えるテキスト系ファイルを原則すべて自動処理対象として確定し、人間の資料追加を待つ。第2段階で手動資料数から残りのファイル枠を求め、自動バンドル、同梱`miku-md2docx`によるMarkdownのDOCX化、準備済みOffice文書の統合を行う。Copilot Studio の作成権限を持たない利用者向けの Agent Builder が対象。`igapyon-miku-m365-agent-builder`または`miku-m365-agent-builder`が明示されたとき、またはこのスキルを使ったフォルダ変換やその再開が依頼されたときに使用する。Copilot Studio 固有のエージェント作成には使用しない。
---

# Igapyon Miku M365 Agent Builder

作業時は、最初に同じディレクトリの `index.json` を読み、必要な参照資料を選ぶ。

## Basic principle

基本として、次の流れを実現する Microsoft 365 Copilot Agent Builder 向けの入力データを提供する。

> 「利用者の質問」→「情報を探す・整理する」→「自然言語で回答する」

生成物は、社内や組織テナント内など、利用者が管理する閉じたAgent Builder環境への人手による配備を前提にする。このスキル自身はAgent Builderへのアップロード、エージェントの共有、外部Web、公開リポジトリ、その他の外部サービスへの公開を行わない。

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
- 既存フォルダを変換するとき、または準備済みの変換を再開するときは、[雑多なフォルダの二段階変換](references/workflows/01-folder-conversion.md)を読む。
- Knowledge sourcesを生成するときは、[miku-text-bundle連携](references/knowledge-sources/03-miku-text-bundle.md)を読み、同梱`miku-text-bundle`を使用する。
- 手動資料数から自動生成枠と`--max-chars`を決めるときは、[Agent Builderのファイル枠配分](references/knowledge-sources/06-upload-file-budget.md)を読む。
- 登録用DOCXを生成するときは、[miku-md2docx連携](references/knowledge-sources/05-miku-md2docx.md)を読み、同梱`miku-md2docx`を使用する。
- ランタイムの版、選択順、SHA-256を確認するときは、[同梱ランタイム](references/runtime-artifacts.md)を読む。
- バックエンド指定がなければNode.js版を使用する。Java版は明示指定時、またはNode.js版が利用できない場合のフォールバックとする。
- knowledge-sourceモード導入時の判断経緯を確認するときだけ、[Knowledge sourceモード追加依頼（実装済み）](references/knowledge-sources/04-upstream-request.md)を読む。

## Workflow

新規変換と再開を混同しない。出力先に`work/preparation-status.md`があり、状態が`awaiting-manual-input`なら第2段階として再開する。新規変換では次の第1段階だけを実行し、同じターンで第2段階へ進まない。

### 第1段階: 自動テキスト入力の確定と準備待ち

1. 利用者の目的、想定利用者、代表的な質問、入力元、出力先を確認する。不明点は推測で確定せず、作業を進められる範囲では仮定として記録する。
2. [制限・設計上の注意](references/platform/02-limitations.md)を使い、Agent Builderへの適合性を判定する。適合度が低い要求は「案内」「情報整理」「判断材料の提示」「下書き作成」へ調整する。
3. 原本を変更せずに棚卸しする。入力元にある`.md`、`.mjs`、`.js`など、同梱`miku-text-bundle`が扱えるテキスト系ファイルは原則すべて自動処理対象とする。内容の関連性、旧版、重複の推定だけを理由に自動除外しない。`.env`と`.env.*`、秘密情報、出力先、明示的に指定された除外、ランタイムが技術的に扱えないファイルだけを理由付きで除外または確認待ちにする。
4. DOCX、PPTX、XLSX、PDF、画像などの非テキスト資料を自動でテキスト化せず、`miku-text-bundle`の自動処理対象に含めない。Knowledge sourceとして必要なら、人が準備して`manual-input/`へ置く候補として記録する。この時点ではバンドルを生成しない。
5. 人間が追加資料の原本を置く空の`manual-input/`と、再開に必要な`work/preparation-status.md`を作る。状態は`awaiting-manual-input`とし、入力元、出力先、自動処理対象、理由付き除外、確認待ち、実行条件、警告、再開方法を記録する。
6. `manual-input/`へ追加可能なMarkdown、DOCX、PPTX、XLSXなど、人力資料は最大19件であること、原本を変更しない規則を利用者へ説明する。追加資料がない場合も明示的な確認を求める。
7. 人間による追加資料の準備待ちとして必ず停止する。`miku-text-bundle`のdry-runと本実行、番号付きMarkdownのDOCX変換、`upload/`の構成、`agent-builder-input.md`の生成はまだ行わない。

### 第2段階: 再開と最終化

1. 利用者が指定した出力先の`work/preparation-status.md`を読み、状態が`awaiting-manual-input`であること、記録された自動処理対象と実行条件が現在の入力に一致することを確認する。状態ファイルがない、完了済み、または内容が不整合なら新規変換として推測せず停止する。
2. `manual-input/`を読み取り専用として棚卸しする。対応形式、サイズ、読取可否、機密性、パスワード保護、同名衝突を確認し、未確認事項は`items-to-confirm.md`へ記録する。Markdownは変換後のDOCX 1件として数え、検証済みOffice文書と合わせた手動資料数`M`が19以下であることを確認する。
3. [Agent Builderのファイル枠配分](references/knowledge-sources/06-upload-file-budget.md)に従い、自動生成枠`A = 20 - M`、適格な自動入力ファイル数`N`、目標自動出力数`T = min(N, A)`、合計文字数`C`、`maxChars = max(120000, ceil(C / T))`を求める。`M`が20以上または`N`が0なら停止する。
4. 同梱`miku-text-bundle`ランタイムが`--mode knowledge-source`をサポートすることを確認する。計算した`--max-chars`でdry-runし、推定Knowledgeファイル数が`A`を超える間は値を増やして再実行する。条件を満たしてから本実行し、番号付きMarkdownを`work/knowledge-markdown/`へ、管理用indexを`work/knowledge-index.md`へ置く。
5. `work/knowledge-markdown/`の番号付きMarkdownと`manual-input/`のMarkdownを一対一で`miku-md2docx`へ渡し、同じbasenameのDOCXを一時的な出力場所へ生成する。原本Markdownは変更しない。
6. 検証済みのDOCX、PPTX、XLSXなど、Agent Builderが現時点で埋め込みファイルとして受け付ける手動資料をbasenameを維持して一時的な出力場所へコピーする。未対応または未確認の形式はコピーしない。全候補の検証に成功した場合だけ、フラットな`upload/`を最終候補で置き換える。
7. 自動生成物と手動追加物の出力basenameが衝突する場合は、自動改名や上書きをせず、`upload/`を変更する前に停止する。
8. 元リポジトリ基準の相対パスとファイル境界が自動生成DOCX本文に残ることを確認する。Knowledge sources間の相対リンクには依存せず、外部参照には確認済みの絶対URLを使う。
9. InstructionsとKnowledge sourcesを分離する。振る舞い、処理順、口調、禁止事項、出力形式はInstructionsへ置き、回答根拠となる事実だけをKnowledge sourcesへ置く。
10. [入力項目と推奨形式](references/instructions/01-input-fields.md)に従い、Name、Description、Instructions、Starter prompts、Knowledge sources、Capabilities、Items to confirmを`agent-builder-input.md`へ作る。Instructionsには登録済みKnowledge sourcesを優先して検索し、取得内容を根拠にし、資料名を示し、見つからない情報を推測しない方針を含める。Knowledge sources欄では`upload/`を付けず、`upload/`に実在するbasenameだけを記載する。
11. 最終登録候補が20件以下であることを含め、対応、開封可否、サイズ、リンク、重複、矛盾、機密情報、スキップ、参照切れ、未参照ファイルを確認する。問題がなければ`preparation-status.md`へ枠配分と実績を記録し、状態を`finalized`へ更新して利用者へ最終確認を求める。

## Output

通常は、Agent Builderの各入力欄へコピーできる単一のMarkdownを返す。

既存フォルダを変換する場合は、元フォルダとは別の出力先に次の配備用フォルダを作る。

```text
m365-agent-builder-output/
├── manual-input/
│   ├── additional-guide.md
│   ├── official-document.docx
│   ├── reference.pptx
│   └── data.xlsx
├── upload/
│   ├── knowledge-001.docx
│   ├── knowledge-002.docx
│   ├── additional-guide.docx
│   ├── official-document.docx
│   ├── reference.pptx
│   └── data.xlsx
├── work/
│   ├── knowledge-markdown/
│   │   ├── knowledge-001.md
│   │   └── knowledge-002.md
│   ├── knowledge-index.md
│   └── preparation-status.md
├── agent-builder-input.md
└── items-to-confirm.md
```

- `manual-input/`: 人間が追加する原本を置く。第2段階でも変更、上書き、削除しない。
- `upload/`: 自動生成DOCX、手動Markdownから変換したDOCX、検証済みの準備済みOffice文書を、最終登録候補としてフラットに置く。Agent Builderでは原則としてこのディレクトリ内だけを選択する。
- `work/knowledge-markdown/knowledge-NNN.md`: `miku-text-bundle --mode knowledge-source`が生成した中間成果物を置く。
- `work/knowledge-index.md`: 実行設定、元ファイル対応、スキップ、警告、marker、旧生成物候補を記録する。DOCX化・登録ともに行わない。
- `work/preparation-status.md`: `awaiting-manual-input`または`finalized`の状態と、別セッションで再開するための情報を記録する。登録しない。
- `agent-builder-input.md`: Configure画面の項目順で入力値を記載する。
- `items-to-confirm.md`: 版の衝突、正確性、機密性、権限、未対応形式など、人の判断が必要な事項を記載する。

## Constraints

- Microsoft 365 Copilot 内の Agent Builder を対象にする。
- Copilot Studio 固有の機能を前提にしない。
- 生成物を社内または組織テナント内の閉じたAgent Builderへ人が配備する前提とする。
- Agent Builderへのアップロード、共有設定、外部Webや公開リポジトリへの公開を行わない。
- 利用者がAgent Builderへ設定する前に、対象テナント、共有範囲、閲覧権限を確認事項として示す。
- 入力元のフォルダやファイルを上書き、移動、削除しない。
- `manual-input/`内の人間管理原本を上書き、移動、削除しない。
- 第1段階と第2段階を同じターンで続けて実行しない。
- 第1段階では`miku-text-bundle`を実行せず、手動資料数が確定した第2段階で自動生成枠を計算してから実行する。
- 人力資料は最大19件とし、自動生成Knowledge sourceを最低1件確保する。
- 最終`upload/`の登録候補を20件以内にする。
- `preparation-status.md`が再開可能な状態であることを確認せず第2段階を実行しない。
- `miku-text-bundle`のhandoffモード出力をKnowledge sourcesへ登録しない。
- 管理用の`<prefix>-index.md`をKnowledge sourcesへ登録しない。
- 中間Markdownを最終登録物として扱わない。
- `upload/`にサブディレクトリ、管理用ファイル、未対応または未確認の形式を置かない。
- 同じ出力basenameを黙って上書きまたは自動改名しない。
- DOCX間の相対リンクや読み込み順に依存しない。
- `agent-builder-input.md`のKnowledge sources欄に`upload/`、ローカル絶対パス、その他の配備元ディレクトリを記載しない。
- Instructionsには、登録済みKnowledge sourcesを回答根拠として優先し、根拠が見つからない事項を推測で補わない方針を含める。
- マシン固有の絶対パスをKnowledge sourcesへ含めない。元ファイルはリポジトリルート基準の相対パスで識別する。
- フォルダ内の全ファイルを無条件に含めない。
- 読み取れない内容、欠落した文脈、URL、版、更新日を推測で補わない。
- 機密情報、個人情報、秘密情報を出力へ複製する前に必要性を確認する。
- 製品仕様や制限値が重要な場合は、最新の Microsoft 公式情報を確認する。
