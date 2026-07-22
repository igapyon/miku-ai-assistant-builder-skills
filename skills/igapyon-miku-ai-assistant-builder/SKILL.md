---
name: igapyon-miku-ai-assistant-builder
description: ベータ版。Microsoft 365 Copilot内の軽量なAgent BuilderまたはGoogle GeminiのGemに投入するデータを準備し、雑多な既存フォルダを二段階で配備用フォルダへ変換するスキル。Agent Builderを主対象とし、Gemにも対応する。第1段階で同梱`miku-text-bundle`が扱えるテキスト系ファイルを原則すべて自動処理対象として確定し、人間の資料追加を待つ。第2段階では確定条件から再実行可能なNode.js変換ジョブを作り、Agent Builder向けMarkdownをDOCX化し、GemではMarkdownのまま使うか同梱`miku-md2docx`でDOCX化するかを利用者が選ぶ。構成固定の内容更新は同じジョブを再実行し、前回条件を再検討する反復実行では新しい作業フォルダを作る。ファイル添付を利用できるライセンス、アカウント、管理者設定が前提。`igapyon-miku-ai-assistant-builder`または`miku-ai-assistant-builder`が明示されたとき、このスキルを使ったフォルダ変換、その再開、確定済み構成の内容更新、または前回条件を参照した再実行が依頼されたときに使用する。Copilot Studio固有のエージェント作成には使用しない。
---

# Igapyon Miku AI Assistant Builder

> **Beta:** 本スキル全体はベータ版であり、仕様と出力は今後の検証・調整によって変更される可能性がある。Microsoft 365 Copilot Agent Builderを主対象とし、Google Gemini Gemにも対応する。

## 実行環境

本スキルの実行にはNode.js 22以降が必須である。これは開発やビルドだけの要件ではなく、日時付き実行ディレクトリの作成と既定の変換バックエンドを含む、利用時の実行要件である。

同梱CLIの変換バックエンドとしてJava版を明示的に選択した場合も、スキル全体の実行にはNode.js 22以降を必要とする。Java版バックエンドには、これに加えてJava 17以降を必要とする。

## 開始確認ゲート

新規変換を始める前に、それ以前の会話で次の2点が利用者によって明示されているか確認する。

1. 配備先: `Microsoft 365 Copilot Agent Builder`または`Google Gemini Gem Classic`
2. 自動処理の入力範囲: 入力元となる正確なフォルダと、その配下で対象にするサブフォルダまたは除外範囲

どちらか一方でも未確定なら、2点をまとめて利用者へ質問し、その回答を待って停止する。質問する前から、現在の作業ディレクトリ、リポジトリルート、開いているファイル、添付ファイル、ファイル名を使って決め込まない。回答前は入力フォルダの棚卸し、内容の読み取り、対象ファイルの選定、出力フォルダや状態ファイルの作成、同梱CLIの実行を開始しない。

利用者が質問に対して`特に指定なし`、`おまかせ`、または同等の委任を明示した項目だけは、その回答後に合理的な想定で補完してよい。想定は作業目的に合う狭い範囲を優先し、採用する配備先、入力フォルダ、自動処理範囲、除外を作業前に明示する。無回答、曖昧な返答、話題の変更を委任とみなさない。

それ以前の会話で明示済みなら再質問は不要だが、採用する配備先と入力範囲を短く復唱してから進める。Gem Classicの場合は、Knowledge用Markdownを`markdown`のまま使うか`docx`へ変換するかも、未確定なら同じ確認で質問する。

開始確認が完了してから、同じディレクトリの `index.json` を読み、必要な参照資料を選ぶ。

## Basic principle

基本として、次の流れを実現するAgent BuilderまたはGem向けの入力データを提供する。Agent Builderを主対象としつつ、対象サービスの仕様差に応じて同じ流れを使い分ける。

> 「利用者の質問」→「情報を探す・整理する」→「自然言語で回答する」

生成物は、利用者が管理するAgent BuilderまたはGemへの人手による配備を前提にする。このスキル自身はファイルのアップロード、エージェントやGemの共有、外部Web、公開リポジトリ、その他の外部サービスへの公開を行わない。

`miku-text-bundle`対応テキストを原則すべて自動処理対象にすることは、配備用Knowledgeファイルを準備する際の入力範囲を示す。登録成功やKnowledge一覧への表示は、配備後のAIアシスタントが全情報を常に検索・取得・参照できることや、回答へ必ず利用することを保証しない。利用者へこの違いを説明し、配備後は代表的な質問で確認するよう案内する。

## Purpose

Microsoft 365 CopilotのAgent BuilderまたはGoogle GeminiのGem向け入力データを作成する。Agent Builderを主対象とする。

利用者の要望から新規に設計するだけでなく、文書、メモ、ソースコードなどが混在する既存フォルダを棚卸しし、選択したサービスへ設定しやすい配備用フォルダへ変換する。

ここでいう配備用フォルダは、対象サービスへ直接インポートする独自ファイル形式ではない。設定画面へコピーする入力値と、登録候補のKnowledgeファイルを人が確認・配置できる受け渡し形式を指す。

Agent Builder向けは、端末からの埋め込みファイルを利用できるMicrosoft 365 Copilotライセンスまたは従量課金環境を対象とする。Gem向けは、Knowledgeへのファイル追加を利用できるアカウント、プラン、管理者設定を対象とする。対象サービスごとに機能、上限、検証条件が異なるため、Agent BuilderとGemを同一仕様とはみなさない。

作業前に次の資料を読む。

- Agent Builderの対象範囲を確認するときは、[基礎情報](references/platform/01-baseline.md)を読む。
- 実現可能性を判断するときは、[制限・設計上の注意](references/platform/02-limitations.md)を読む。
- Gemの入力項目、MarkdownとDOCXの選択、アカウント条件を確認するときは、[Google Gemini Gemの基本事項](references/platform/03-gemini-gems.md)を読む。
- 入力欄と推奨形式を作るときは、[入力項目と推奨形式](references/instructions/01-input-fields.md)を読む。
- Knowledge sourcesを設計するときは、[基本原則](references/knowledge-sources/01-principles.md)と[コンテンツ設計](references/knowledge-sources/02-content-design.md)を読む。
- 既存フォルダを変換するとき、または準備済みの変換を再開するときは、[雑多なフォルダの二段階変換](references/workflows/01-folder-conversion.md)を読む。
- 第2段階で再実行可能な変換ジョブを作るとき、または構成を固定したまま内容だけを更新するときは、[確定済み構成の再実行可能な変換ジョブ](references/workflows/02-repeatable-conversion-job.md)を読む。
- Knowledge sourcesを生成するときは、[miku-text-bundle連携](references/knowledge-sources/03-miku-text-bundle.md)を読み、同梱`miku-text-bundle`を使用する。
- 手動資料数から自動生成枠と`--max-chars`を決めるときは、[Agent Builderのファイル枠配分](references/knowledge-sources/06-upload-file-budget.md)を読む。
- 登録用DOCXを生成するときは、[miku-md2docx連携](references/knowledge-sources/05-miku-md2docx.md)を読み、同梱`miku-md2docx`を使用する。
- **Experimental:** 1つのMarkdownテキストを見出し単位の複数シートXLSXへ変換して検証するときは、[miku-md2xlsx連携](references/knowledge-sources/07-miku-md2xlsx.md)を読み、同梱`miku-md2xlsx`を使用する。Excelブック出力を既定の二段階変換へ自動適用しない。
- ランタイムの版、選択順、SHA-256を確認するときは、[同梱ランタイム](references/runtime-artifacts.md)を読む。
- 本スキルの実行にはNode.js 22以降を必要とする。変換バックエンドの指定がなければNode.js版を使用し、Java版は利用者が明示した場合に選択する。
- 新規実行ディレクトリを作るときは、開始確認後に同梱[scripts/create-run-directory.mjs](scripts/create-run-directory.mjs)を使う。会話中の時刻、モデルの推測、手入力した時分から実行IDを作らない。
- knowledge-sourceモード導入時の判断経緯を確認するときだけ、[Knowledge sourceモード追加依頼（実装済み）](references/knowledge-sources/04-upstream-request.md)を読む。

## Workflow

新規変換、同一実行の再開、確定済み変換ジョブによる内容更新、過去実行を参考にする反復実行を混同しない。新規変換では開始確認ゲートを最初に通し、対象を`agent-builder`または`gem`から確認する。Gemの場合はKnowledge用Markdownを`markdown`のまま使うか`docx`へ変換するかも確認し、推測で選ばない。選択結果は`work/preparation-status.md`へ記録する。状態が`awaiting-manual-input`なら記録済みの選択で第2段階として同じ実行ディレクトリを再開する。

利用者が前回と同じ条件での再実行を求めた場合は、指定された過去の`work/execution-record.md`を読む。前回値を現在の指定とみなさず、配備先、入力元、自動処理範囲、除外、目的、対象利用者、代表的な質問、出力基準を候補として復唱し、利用者の確認後に現在の入力と製品上限を再検証する。反復実行は必ず新規変換として新しい日時付き実行ディレクトリを作り、過去の`manual-input/`、`upload/`、`work/`を自動コピーまたは再利用しない。新規変換と反復実行では次の第1段階だけを実行し、同じターンで第2段階へ進まない。

利用者がファイル構成、個数、basename、形式を変えず、確定済み原本と手動資料の内容だけを更新すると明示した場合は、同じ実行ディレクトリの`work/conversion-plan.json`と`work/run-conversion.mjs`を確認する。構成が計画と一致する場合だけランナーを再実行し、新しい実行ディレクトリを作らない。構成差がある場合は計画を手編集して迂回せず、新規変換を案内する。

### 第1段階: 自動テキスト入力の確定と準備待ち

1. 開始確認ゲートで確定した対象サービスと自動処理の入力範囲を復唱する。その後、利用者の目的、想定利用者、代表的な質問、出力先を確認する。出力先の明示指定がなければ、確認済みの入力元を扱う作業リポジトリの`workplace/miku-ai-assistant-builder/YYYYMMDD-HHmm/`を新規変換の既定出力先にする。スキルのインストール元を、現在位置だけを理由に出力先として使わない。GemではMarkdownとDOCXのどちらを使うかも確認する。必須項目は質問前に仮定で記録しない。利用者が明示的に指定を委任した項目だけは、回答後に想定を明示して補完する。
2. Agent Builderでは[制限・設計上の注意](references/platform/02-limitations.md)、Gemでは[Google Gemini Gemの基本事項](references/platform/03-gemini-gems.md)を使い、ファイル追加機能を利用できる環境であることと適合性を確認する。
3. 原本を変更せずに棚卸しする。入力元にある`.md`、`.mjs`、`.js`など、同梱`miku-text-bundle`が扱えるテキスト系ファイルは原則すべて自動処理対象とする。内容の関連性、旧版、重複の推定だけを理由に自動除外しない。`.env`と`.env.*`、秘密情報、出力先、明示的に指定された除外、ランタイムが技術的に扱えないファイルだけを理由付きで除外または確認待ちにする。
4. DOCX、PPTX、XLSX、PDF、画像などの非テキスト資料を自動でテキスト化せず、`miku-text-bundle`の自動処理対象に含めない。Knowledge sourceとして必要なら、人が準備して`manual-input/`へ置く候補として記録する。この時点ではバンドルを生成しない。
5. 人間が追加資料の原本を置く空の`manual-input/`、再開に必要な`work/preparation-status.md`、次回の反復実行で参照する`work/execution-record.md`を作る。状態は`awaiting-manual-input`とし、入力元、出力先、自動処理対象、理由付き除外、確認待ち、実行条件、警告、再開方法を記録する。反復実行の場合は参照した前回記録のパスも記録する。
6. 作成済み`manual-input/`の解決済みフルパスと出力先基準の相対パスを利用者へ示し、そこへ手動追加資料を置くよう案内する。`~`、未展開の環境変数、現在位置に依存する相対パスだけで案内しない。追加可能な形式、原本を変更しない規則、利用者の実画面で確認したファイル上限も説明する。Agent Builderでは人力資料は最大19件とする。追加資料がない場合も明示的な確認を求める。
7. 人間による追加資料の準備待ちとして必ず停止する。`miku-text-bundle`のdry-runと本実行、番号付きMarkdownのコピーまたはDOCX変換、`upload/`の構成、`agent-builder-input.md`または`gem-input.md`の生成はまだ行わない。

### 第2段階: 再開と最終化

1. 利用者が指定した出力先の`work/preparation-status.md`を読み、状態が`awaiting-manual-input`であること、対象サービス、Gemの出力形式、自動処理対象、実行条件が現在の入力に一致することを確認する。状態ファイルがない、完了済み、または内容が不整合なら新規変換として推測せず停止する。
2. `manual-input/`を読み取り専用として棚卸しする。対象サービスでの対応形式、サイズ、読取可否、機密性、パスワード保護、同名衝突を確認し、未確認事項は`items-to-confirm.md`へ記録する。Markdownは選択形式にかかわらず1件として数える。
3. Agent Builderでは[Agent Builderのファイル枠配分](references/knowledge-sources/06-upload-file-budget.md)に従い、自動生成枠`A = 20 - M`、適格な自動入力ファイル数`N`、目標自動出力数`T = min(N, A)`、合計文字数`C`、`maxChars = max(120000, ceil(C / T))`を求める。GemではAgent Builderの20件を流用せず、実画面で確認した上限から自動生成枠を求める。上限を確認できない場合は停止する。
4. 同梱`miku-text-bundle`ランタイムが`--mode knowledge-source`をサポートすることを確認する。計算した`--max-chars`でdry-runし、推定Knowledgeファイル数が`A`を超える間は値を増やす。条件、入力パス集合、手動資料、固定出力basenameを[確定済み構成の再実行可能な変換ジョブ](references/workflows/02-repeatable-conversion-job.md)に従って`work/conversion-plan.json`へ保存し、同梱ヘルパーで`work/run-conversion.mjs`を生成する。
5. CLIを個別に本実行せず、生成した`work/run-conversion.mjs`を実行する。ランナーは`miku-text-bundle`のdry-runと本実行を行い、Agent BuilderまたはGemの`docx`選択では`work/knowledge-markdown/`と`manual-input/`のMarkdownを一対一で`miku-md2docx`へ渡す。Gemの`markdown`選択では`miku-md2docx`を実行せずMarkdownをコピーする。さらに準備済み資料のコピー、構成検証、成功後の`upload/`一括更新を行う。初回と将来の内容更新で同じランナーを使う。
6. ランナーが出力した`work/knowledge-markdown/`、`work/knowledge-index.md`、`upload/`、`work/conversion-history.jsonl`を確認する。未対応または未確認の形式は計画へ含めず、ランナー失敗時は既存の正常な`upload/`を維持して停止する。
7. 自動生成物と手動追加物の出力basenameが衝突する場合は、自動改名や上書きをせず、`upload/`を変更する前に停止する。
8. 元リポジトリ基準の相対パスとファイル境界が自動生成MarkdownまたはDOCX本文に残ることを確認する。Knowledgeファイル間の相対リンクには依存せず、外部参照には確認済みの絶対URLを使う。
9. InstructionsとKnowledge sourcesを分離する。振る舞い、処理順、口調、禁止事項、出力形式はInstructionsへ置き、回答根拠となる事実だけをKnowledge sourcesへ置く。
10. [入力項目と推奨形式](references/instructions/01-input-fields.md)に従い、Agent Builderでは`agent-builder-input.md`、Gemでは`gem-input.md`を作る。GemにはName、Description、Custom instructions、Knowledge、Items to confirmをこの順で含める。Custom instructionsはGem画面のInstructions欄へ転記する内容とする。Instructionsには登録済みKnowledge sourcesを優先して検索し、見つからない情報を推測しない方針を含める。いずれもKnowledge一覧では`upload/`を付けず、`upload/`に実在するbasenameだけを記載する。
11. 対象サービスで確認した上限以内であることを含め、対応、開封可否、サイズ、リンク、重複、矛盾、機密情報、スキップ、参照切れ、未参照ファイルを確認する。問題がなければ`preparation-status.md`と`execution-record.md`へ対象サービス、形式、枠配分、実行パラメータ、入力と出力の実績、検証結果を記録し、状態を`finalized`へ更新して利用者へ最終確認を求める。

## Output

通常は、Agent BuilderまたはGemの各入力欄へコピーできる単一のMarkdownを返す。

既存フォルダを変換する場合は、元フォルダとは別の出力先に次の配備用フォルダを作る。利用者が出力先を明示しなければ、作業リポジトリの`workplace/`を基準にする。

```text
workplace/
└── miku-ai-assistant-builder/
    └── YYYYMMDD-HHmm/
        ├── manual-input/
        │   ├── additional-guide.md
        │   ├── official-document.docx
        │   ├── reference.pptx
        │   └── data.xlsx
        ├── upload/
        │   ├── knowledge-001.md または knowledge-001.docx
        │   ├── knowledge-002.md または knowledge-002.docx
        │   ├── additional-guide.md または additional-guide.docx
        │   ├── official-document.docx
        │   ├── reference.pptx
        │   └── data.xlsx
        ├── work/
        │   ├── knowledge-markdown/
        │   │   ├── knowledge-001.md
        │   │   └── knowledge-002.md
        │   ├── knowledge-index.md
        │   ├── conversion-plan.json
        │   ├── run-conversion.mjs
        │   ├── conversion-history.jsonl
        │   ├── preparation-status.md
        │   └── execution-record.md
        ├── agent-builder-input.md または gem-input.md
        └── items-to-confirm.md
```

- 新規変換の実行IDは、ディレクトリ作成直前に`node <skill-directory>/scripts/create-run-directory.mjs --base-directory <基準ディレクトリ>`を実行し、そのJSON出力の`runId`と`outputDirectory`をそのまま使う。`<skill-directory>`は実際に読み込んだこのスキルの絶対パスへ置き換える。スクリプトはOSのローカル時刻から`YYYYMMDD-HHmm`を作り、同じ分のディレクトリが既に存在する場合は上書きせず、`-02`、`-03`の連番を付ける。実行に失敗した場合は時刻を推測せず停止する。
- 第1段階で実行ディレクトリを一度だけ作る。第2段階では新しい日時ディレクトリを作らず、指定された既存の`work/preparation-status.md`と同じ実行ディレクトリを再利用する。
- 前回記録を参照する反復実行では、前回の実行ディレクトリを再利用せず、新しい実行IDのディレクトリを作る。
- `temp1/`など別の基準ディレクトリが利用者から指定された場合も、その下を`miku-ai-assistant-builder/YYYYMMDD-HHmm/`の形にする。

- `manual-input/`: 人間が追加する原本を置く。第2段階でも変更、上書き、削除しない。
- `upload/`: 選択形式の自動生成資料、手動Markdown、検証済みの準備済み資料を、最終登録候補としてフラットに置く。
- `work/knowledge-markdown/knowledge-NNN.md`: `miku-text-bundle --mode knowledge-source`が生成した中間成果物。GemのMarkdown選択では最終候補へコピーし、それ以外ではDOCXの変換元にする。
- `work/knowledge-index.md`: 実行設定、元ファイル対応、スキップ、警告、marker、旧生成物候補を記録する。DOCX化・登録ともに行わない。
- `work/preparation-status.md`: `awaiting-manual-input`または`finalized`の状態と、別セッションで再開するための情報を記録する。登録しない。
- `work/execution-record.md`: 今回の指定内容、実行条件、実績、検証結果を記録し、次回の反復実行で参照する。登録しない。
- `work/conversion-plan.json`: 第2段階で確定した入力パス集合、個数、形式、basename、CLI引数を記録する機械可読な変換契約。登録しない。
- `work/run-conversion.mjs`: 第2段階の初回変換と、構成固定の内容更新に使うNode.jsランナー。登録しない。
- `work/conversion-history.jsonl`: ランナーの成功履歴。登録しない。
- `agent-builder-input.md`: Agent BuilderのConfigure画面への転記用。Knowledge sourceへ登録しない。
- `gem-input.md`: Gem画面への転記用。Name、Description、Custom instructions、Knowledge、Items to confirmを含める。Knowledgeへ登録しない。
- `items-to-confirm.md`: 版の衝突、正確性、機密性、権限、未対応形式など、人の判断が必要な事項を記載する。

## Constraints

- Microsoft 365 Copilot内のAgent Builderを主対象にし、Google GeminiのGemにも対応する。本スキル全体をベータ版として扱う。
- Agent Builder向けは端末からの埋め込みファイルを利用できるライセンスまたは従量課金環境だけを対象にする。
- GemはKnowledgeへのファイル追加を利用できるアカウント、プラン、管理者設定だけを対象にする。対象サービスごとに機能、上限、検証条件が異なるため、Agent BuilderとGemを同一仕様とはみなさない。
- Copilot Studio 固有の機能を前提にしない。
- 生成物を利用者が管理するAgent BuilderまたはGemへ人が配備する前提とする。
- ファイルのアップロード、共有設定、外部Webや公開リポジトリへの公開を行わない。
- 利用者がAgent BuilderまたはGemへ設定する前に、対象テナントまたはアカウント、共有範囲、閲覧権限を確認事項として示す。
- 入力元のフォルダやファイルを上書き、移動、削除しない。
- 新規変換では日時付き実行ディレクトリを新規作成し、既存ディレクトリを黙って再利用または上書きしない。
- 実行IDの年月日時分を会話コンテキスト、現在日付だけの情報、UTCへの暗黙変換、またはモデルの推測から生成しない。同梱スクリプトが返した値だけを使う。
- 過去の`execution-record.md`を参照する反復実行でも新しい日時付き実行ディレクトリを作り、前回の成果物や手動原本を自動コピーしない。
- 第2段階の再開時は、状態ファイルが属する既存の日時付き実行ディレクトリを使い、新しい日時付き実行ディレクトリへ分岐しない。
- 開始確認ゲートが完了するまで入力フォルダを棚卸しせず、自動処理対象を選定しない。
- `manual-input/`内の人間管理原本を上書き、移動、削除しない。
- 第1段階と第2段階を同じターンで続けて実行しない。
- 第1段階では`miku-text-bundle`を実行せず、手動資料数が確定した第2段階で自動生成枠を計算してから実行する。
- Agent Builderでは人力資料を最大19件とし、自動生成Knowledge sourceを最低1件確保する。
- Agent Builderでは最終`upload/`の登録候補を20件以内にする。Gemでは実画面で確認した上限を使う。
- `preparation-status.md`が再開可能な状態であることを確認せず第2段階を実行しない。
- 第2段階の初回変換では、確定条件から`work/conversion-plan.json`と`work/run-conversion.mjs`を作り、CLIを個別に本実行せず同じランナーを実行する。
- 状態が`finalized`の実行ディレクトリは、構成固定の内容更新として`work/run-conversion.mjs`を再実行できる。ランナーが構成差を報告した場合は計画を手編集して続行しない。
- `miku-text-bundle`のhandoffモード出力をKnowledge sourcesへ登録しない。
- 管理用の`<prefix>-index.md`をKnowledge sourcesへ登録しない。
- Agent BuilderとGemのDOCX選択では中間Markdownを最終登録物として扱わない。GemのMarkdown選択では検証後のコピーだけを最終登録候補にする。
- `upload/`にサブディレクトリ、管理用ファイル、未対応または未確認の形式を置かない。
- 同じ出力basenameを黙って上書きまたは自動改名しない。
- DOCX間の相対リンクや読み込み順に依存しない。
- `agent-builder-input.md`または`gem-input.md`のKnowledge一覧に`upload/`、ローカル絶対パス、その他の配備元ディレクトリを記載しない。
- Instructionsには、登録済みKnowledge sourcesを回答根拠として優先し、根拠が見つからない事項を推測で補わない方針を含める。
- 配備用Knowledgeファイルの準備・登録と、配備後の検索・取得・回答を区別する。登録済みKnowledge内の全情報が常に参照されるとは保証しない。
- マシン固有の絶対パスをKnowledge sourcesへ含めない。元ファイルはリポジトリルート基準の相対パスで識別する。
- 人が手動追加資料を置く場所の案内には、Knowledge sourcesへ含めないローカル作業情報として、存在を確認した`manual-input/`の解決済みフルパスを示す。
- フォルダ内の全ファイルを無条件に含めない。
- 読み取れない内容、欠落した文脈、URL、版、更新日を推測で補わない。
- 機密情報、個人情報、秘密情報を出力へ複製する前に必要性を確認する。
- 製品仕様や制限値が重要な場合は、対象サービスの最新の公式情報と利用者の実画面を確認する。
