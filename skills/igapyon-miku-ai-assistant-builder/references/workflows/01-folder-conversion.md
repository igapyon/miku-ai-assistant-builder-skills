# 雑多なフォルダの二段階変換

## 目的

文書、メモ、ソースコード、JSON / JSONL、下書き、旧版などが混在するフォルダから、JSON / JSONLを1入力1XLSX候補、それ以外の`miku-text-bundle`対応テキストをバンドル候補として確定したあと、人間が準備したMarkdownやOffice文書を追加し、主対象のMicrosoft 365 Copilot Agent BuilderまたはGoogle Gemini Gemへ設定しやすい単一の配備用フォルダへ統合する。対象サービスの仕様差に応じて同じ流れを使い分ける。

これは専用インポート形式への変換ではない。Configure画面へコピーする入力値と、Knowledge sourcesとして登録する候補を人が確認できる受け渡し形式とする。

生成物は利用者が管理するAgent BuilderまたはGemへ人が配備する。このワークフローはローカルの配備用フォルダを完成させるところで終了し、ファイルのアップロード、共有設定、外部公開は行わない。

## 実行環境

このワークフローの実行にはNode.js 22以降が必須である。日時付き実行ディレクトリの作成と既定の変換バックエンドでNode.jsを使用する。変換バックエンドとしてJava版を明示的に選択した場合もNode.jsの要件はなくならず、Java 17以降も追加で必要になる。

## 配備先と形式の選択

新規変換では、主対象の`agent-builder`（Microsoft 365 Copilot Agent Builder）または`gem`（Google Gemini Gem Classic）を利用者に確認する。それ以前の会話で明示されていない限り、主対象だからという理由でAgent Builderを既定値にしない。Agent Builderは端末からの埋め込みファイルを利用できる環境、GemはKnowledgeへのファイル追加を利用できる環境だけを対象にする。

Gemでは、Knowledge用Markdownを`markdown`のまま使うか`docx`へ変換するかも確認する。Markdownの添付可否、DOCXとの回答品質差、ファイル上限は環境や製品更新に依存するため、推測で選ばない。選択を`work/preparation-status.md`へ記録し、再開時に変更しない。

## 開始前に人へ確認すること

新規変換では、それ以前の会話で明示されていない項目を、ファイル操作より先に利用者へ確認する。

- 配備先がMicrosoft 365 Copilot Agent BuilderかGoogle Gemini Gem Classicか
- 入力元となる正確なフォルダ
- 入力フォルダ配下で自動処理対象にする範囲。フォルダ全体か一部のサブフォルダか、明示的な除外があるか
- Gem Classicの場合はKnowledge用Markdownを`markdown`のまま使うか`docx`へ変換するか

必須の回答が不足している場合は質問して停止する。質問する前は、現在の作業ディレクトリ、リポジトリルート、開いているファイル、添付ファイル、ファイル名を回答の代わりにしない。確認前は入力フォルダの一覧取得や内容確認を行わず、`Auto include`を決めず、出力フォルダや`work/preparation-status.md`を作らず、同梱CLIを実行しない。

利用者が質問への回答として`特に指定なし`、`おまかせ`、または同等の委任を明示した項目は、その時点で初めて想定で補完してよい。目的に合う最小限の配備先と入力範囲を選び、採用する想定を列挙してから棚卸しへ進む。無回答を委任と解釈しない。利用者が一部だけ指定した場合は、指定済みの値を維持し、委任された項目だけを補完する。

それ以前の会話で項目が明示済みなら再質問せず、採用する値を短く復唱する。曖昧な指示、複数候補、以前の会話との矛盾がある場合は明示済みとみなさない。

## 前回条件を参照する反復実行

利用者が前回と同じ条件または過去実行を参考にした再実行を求めた場合は、指定された過去の実行ディレクトリにある`work/execution-record.md`を読む。指定がない場合は候補を推測して開かず、前回実行ディレクトリまたは記録ファイルを確認する。

前回記録は入力候補であり、現在の実行指示ではない。次を短く復唱し、変更の有無または同条件であることを利用者に確認してから入力を棚卸しする。

- 配備先とGemのKnowledge形式
- 入力元、自動処理範囲、明示的除外
- エージェントの目的、対象利用者、代表的な質問、正式資料
- 出力基準ディレクトリ
- 前回の手動追加資料名と確認事項

利用者が同条件と確認しても、現在の入力ファイル、秘密情報、対象サービスの利用可否と上限、同梱ランタイム、ファイル数、文字数、`maxChars`、最終basename、検証結果は再計算する。前回の自動入力一覧、製品上限、計算値、生成物を現在も有効だとみなさない。

反復実行は同一実行の第2段階再開ではない。前回の実行ディレクトリを変更せず、新しい日時付き実行ディレクトリを作って第1段階から開始する。前回の`manual-input/`、`upload/`、`work/`を自動コピーせず、新しい空の`manual-input/`を作る。新しい`work/preparation-status.md`と`work/execution-record.md`には参照元の記録パスを残す。

ファイルの相対パス集合、個数、最終basename、形式を変えずに内容だけを更新する依頼は、この反復実行ではなく[確定済み構成の再実行可能な変換ジョブ](02-repeatable-conversion-job.md)として扱う。第2段階で生成・初回実行済みの`work/run-conversion.mjs`を同じ実行ディレクトリで再実行する。構成差がある場合はランナーを迂回せず、この反復実行として新しい実行ディレクトリを作る。

## 状態遷移

このワークフローは次の二段階を別のターンで実行する。

```text
new
  -> preparing
  -> awaiting-manual-input
  -> finalizing
  -> finalized
```

- 新規変換では`awaiting-manual-input`まで進めて必ず停止する。
- 利用者が追加資料の準備完了または追加資料なしを明示した後だけ、`finalizing`へ進む。
- 再開時は`work/preparation-status.md`を正本として状態と入出力を復元する。
- 状態ファイルがない、不整合、または`finalized`なら、再開可能と推測せず停止する。
- 反復実行は過去の`work/execution-record.md`を参考にする新規変換であり、この状態遷移とは別の新しい`new`から始める。

## 出力ディレクトリ

利用者が出力先を明示しない場合は、確認済みの入力元を扱う作業リポジトリの次の場所を既定とする。現在位置やスキルのインストール元だけから作業リポジトリを決めない。入力元に対応する書き込み可能な作業リポジトリを確定できない場合は、基準ディレクトリを利用者へ確認する。

```text
workplace/miku-ai-assistant-builder/YYYYMMDD-HHmm/
```

- 開始確認が完了し、基準ディレクトリが確定した後、実行ディレクトリを作る直前に同梱スクリプトを実行する。

```sh
node <skill-directory>/scripts/create-run-directory.mjs --base-directory <output-base-directory>
```

- スクリプトのJSON出力にある`runId`、`outputDirectory`、`createdAt`、`timeZone`をそのまま採用し、`work/preparation-status.md`と`work/execution-record.md`へ記録する。
- `YYYYMMDD-HHmm`はスクリプト実行時のOSローカル時計から生成する。会話の日時、セッション開始時刻、モデルが推測した時分、手入力の時分、UTCへ暗黙変換した値を使わない。
- 同じ分の実行ディレクトリが既にある場合、スクリプトが`YYYYMMDD-HHmm-02`、`YYYYMMDD-HHmm-03`のように未使用の連番ディレクトリを作る。呼び出し側で存在確認と作成を分離しない。
- スクリプトが失敗した場合は実行IDやディレクトリを代替生成せず、エラーを報告して停止する。
- 利用者が`temp1/`など別の基準ディレクトリを指定した場合も、その下に`miku-ai-assistant-builder/<実行ID>/`を作る。
- 第1段階で実行ディレクトリを一度だけ作る。第2段階では新しい実行IDを発行せず、利用者が指定した既存の`work/preparation-status.md`が属する実行ディレクトリを再利用する。
- 反復実行では過去の実行IDを再利用せず、現在のローカル日時から新しい実行IDを発行する。
- 作成した実行ディレクトリは自動処理入力から明示的に除外する。`workplace/`を既定にする場合も、ランタイムの暗黙除外だけに依存せず状態ファイルへ除外を記録する。

## 安全原則

- 入力元と`manual-input/`を読み取り専用として扱う。
- 出力は入力元とは別のフォルダへ作る。
- シンボリックリンク、隠しファイル、巨大ファイル、アーカイブは対象範囲を確認する。
- `.env`と`.env.*`は内容を読み込まず必ず除外する。
- パスワード付き、破損、未対応形式は無理に処理せず`items-to-confirm.md`へ記録する。
- 機密情報、個人情報、資格情報、秘密鍵などを検出した場合は、`upload/`への複製を止めて要確認へ記録する。
- 出力basenameの競合は、変換やコピーより前に検出する。自動改名や上書きで解決しない。
- `upload/`を変更する前に最終出力計画を確定する。途中失敗時に既存の正常な`upload/`を部分更新しない。
- 第2段階の初回変換から、確定済み計画に基づく同じNode.jsランナーを使う。AI AgentがCLIの本実行を別経路で再現しない。

## 第1段階: 自動入力の確定と準備待ち

1. 開始前確認を完了し、配備先、入力元、自動処理範囲を復唱する。その後、エージェントの目的、対象利用者、代表的な質問、正式資料、出力先を特定する。出力先の明示指定がなければ、前述の日時付き既定出力先を採用する。GemではMarkdownまたはDOCXも選ぶ。質問前に必須項目を仮定しない。利用者が明示的に委任した項目だけは、想定を列挙して補完する。
2. ファイルの相対パス、形式、サイズ、更新日時、文字コード、読取可否を棚卸しする。
3. 適格な`.json`と`.jsonl`を、同梱`miku-json2xlsx`で1入力1XLSXへ変換する`JSON workbook`へ分類する。その他の`.md`、`.mjs`、`.js`など、同梱`miku-text-bundle`が扱えるテキスト系ファイルを既定で`Auto include`へ分類する。同じJSON / JSONLを両方へ重複投入しない。内容の関連性、推定テーマ、旧版、重複候補だけを理由に対象を絞り込まない。
4. `.env`と`.env.*`、秘密情報、出力先、利用者が明示した除外、ランタイムが技術的に扱えないファイルだけを`Exclude`または`Confirm`へ分類し、理由を記録する。
5. DOCX、PPTX、XLSX、PDF、画像などの非テキスト資料を自動変換せず、自動処理対象に含めない。必要なら、人が準備して`manual-input/`へ置く`Manual candidate`として記録する。この段階では分割数を確定せず、`miku-text-bundle`を実行しない。
6. 空の`manual-input/`と`work/json2xlsx-mappings/`を作る。既存の`manual-input/`またはmappingがある場合は内容を削除せず、新規変換として続行しない。
7. `work/preparation-status.md`と`work/execution-record.md`を作り、状態を`awaiting-manual-input`にする。反復実行の場合は、両方に参照した前回記録のパスを記載する。
8. 利用者へ`manual-input/`の解決済みフルパスと出力先基準の相対パス、追加可能な形式、対象サービスで確認したファイル上限、原本を変更しない規則、再開方法を伝える。Agent Builderでは人力資料は最大19件とする。
9. 追加資料がない場合も利用者の明示的な確認を待ち、ここで停止する。

第1段階では次を行わない。

- `miku-text-bundle`のdry-runと本実行
- `miku-json2xlsx`のinspection、mapping作成、XLSX変換
- 番号付きMarkdownの生成
- 番号付きMarkdownのDOCX変換
- `manual-input/`の資料変換またはコピー
- 最終`upload/`の構成
- `agent-builder-input.md`または`gem-input.md`の生成
- 状態の`finalized`への更新

## preparation-status.md

別セッションで推測せず再開できるよう、少なくとも次をMarkdownで記録する。

```markdown
# AI Assistant Builder Preparation Status

- State: awaiting-manual-input
- Target platform: [agent-builder または gem]
- Gem knowledge format: [markdown、docx、またはN/A]
- Source directory: [入力元]
- Output directory: [出力先]
- Output base directory: [workplace、temp1、または利用者指定の基準ディレクトリ]
- Run ID: [YYYYMMDD-HHmmまたは衝突回避連番付きID]
- Created at: [日時とタイムゾーン]
- Time zone: [同梱スクリプトが返したtimeZone]
- Text bundle runtime: [版とバックエンド]
- Text bundle mode: knowledge-source
- JSON workbook runtime: miku-json2xlsx 0.5.0 / Node.js
- Filename prefix: [prefix]
- Encoding: [文字コード]
- Max input file bytes: [値]

## Selected JSON workbook inputs

- [JSON / JSONL相対パス、またはNone]

## Selected automatic text inputs

- [入力元基準の相対パス]

## Non-automatic input candidates

- [manual-input/への人手配置候補、またはNone]

## Diagnostics

- [警告またはNone]

## Resume

Place optional source files in manual-input/, then invoke this skill again with this output directory.
```

状態ファイルには秘密情報を記録しない。入力元と出力先の絶対パスは再開に必要なローカル管理情報として状態ファイルにだけ記録できるが、Knowledgeファイル本文、`agent-builder-input.md`、`gem-input.md`へ複製しない。

## execution-record.md

次回の反復実行で前回条件と実績を参照できるよう、第1段階で`work/execution-record.md`を作り、第2段階の完了時に更新する。少なくとも次をMarkdownで記録する。

```markdown
# AI Assistant Builder Execution Record

- State: awaiting-manual-input または finalized
- Target platform: [agent-builder または gem]
- Gem knowledge format: [markdown、docx、またはN/A]
- Source directory: [入力元]
- Automatic input scope: [対象範囲]
- Explicit exclusions: [除外、またはNone]
- Output base directory: [基準ディレクトリ]
- Output directory: [今回の新規日時付き出力先]
- Run ID: [今回の実行ID]
- Created at: [同梱スクリプトが返したcreatedAt]
- Time zone: [同梱スクリプトが返したtimeZone]
- Previous execution record: [参照元パス、またはNone]
- Purpose: [目的]
- Intended users: [対象利用者]
- Representative questions: [代表的な質問]
- Official sources: [正式資料]
- Text bundle runtime: [版とバックエンド]
- Text bundle mode: knowledge-source
- JSON workbook runtime: miku-json2xlsx 0.5.0 / Node.js
- Filename prefix: [prefix]
- Encoding: [文字コード]
- Max input file bytes: [値]

## Requested and selected inputs

- [自動入力、手動追加資料、除外、確認待ち]

## Execution results

- [M、J、A、N、T、C、maxChars、mapping SHA-256、生成数、最終basename。第1段階ではPending]

## Validation

- [検証結果と警告。第1段階ではPending]

## Repeat

Invoke this skill with this execution record as a reference. Confirm or change the recorded choices, then create a new timestamped run directory. Do not reuse this run directory.
```

入力元や出力先の絶対パスはこのローカル管理用記録に残してよい。秘密情報は記録せず、Knowledgeファイル、入力用Markdown、最終`upload/`へ含めない。前回の手動追加資料は名前と判断結果だけを記録し、原本を次回の`manual-input/`へ自動コピーしない。

## 手動追加資料の配置案内

`manual-input/`を作成した後、利用者へ資料の配置を依頼するときは、ディレクトリが実在することを確認して次の両方を示す。

- フルパス: パスを解決した絶対パス。`~`や環境変数を含めない
- 相対パス: 出力先を基準にした`manual-input/`

「`manual-input/`へ置いてください」だけで終えず、どの出力先のディレクトリかを明確にする。フルパスは人向けのローカル作業案内と`work/preparation-status.md`にだけ使用し、Knowledgeファイル、`agent-builder-input.md`、`gem-input.md`には含めない。

案内例:

```text
手動追加資料の配置先
- フルパス: /resolved/repository/workplace/miku-ai-assistant-builder/20260720-2145/manual-input
- 出力先基準: manual-input/
```

## 人間による追加資料

利用者は、Knowledge sourcesへ加えたい原本を`manual-input/`へ置く。

- Agent BuilderではMarkdownを第2段階で同じbasenameのDOCXへ変換する。
- Gemでは選択に従い、Markdownのまま使うか同じbasenameのDOCXへ変換する。
- 対象サービスが受け付けることを確認した準備済み文書は、検証後にbasenameを維持して最終候補へ含める。
- Agent Builderでは手動資料を最大19件とする。GemではAgent Builderの19件を流用しない。
- 対応可否が不明な形式は自動採用しない。
- サブディレクトリを許可する場合も、最終`upload/`はフラットにするため、全候補のbasename競合を確認する。
- `manual-input/`のファイルをその場で変換、編集、改名しない。

## 第2段階: 再開と最終化

1. `work/preparation-status.md`の状態が`awaiting-manual-input`であることを確認する。
2. 記録された入力元、出力先、自動処理対象、実行条件と、現在のファイルを照合する。欠落や差異は推測で補わず停止する。
3. 利用者が追加資料の準備完了、または追加資料なしを明示していることを確認する。
4. `manual-input/`を読み取り専用で棚卸しし、形式、サイズ、読取可否、機密性、パスワード保護を確認する。
5. 各JSON / JSONLについて同梱`miku-json2xlsx inspect --result-format json`を実行する。inspection resultからmapping v1案を作り、sheet、column、型、JSON path、rootとchildの関係、追跡列、未採用path、materialな仮定、出力basenameを人へ示す。承認後に`work/json2xlsx-mappings/`へ保存し、`validate-mapping --result-format json`で検証する。承認前にXLSXへ変換しない。
6. 手動Markdownを選択形式にかかわらず1件として数え、検証済みの準備済み文書と合わせた手動資料数`M`を確定する。承認済みmappingを持つJSON workbook数を`J`とする。Agent Builderで`M`が20以上なら、19件以下への削減を求めて停止する。Gemでは実画面で確認した上限を使う。
7. 対象サービスで確認した総ファイル上限からテキストバンドル枠`A`を求める。Agent Builderでは`A = 20 - M - J`とする。Gemでは20件を流用しない。JSON / JSONLを除いた適格な自動テキスト入力数を`N`とし、`N > 0`なら目標テキスト出力数を`T = min(N, A)`とする。`N = 0`かつ`J > 0`なら`T = 0`として続行し、`N = 0`かつ`J = 0`なら停止する。`N > 0`かつ`A = 0`ならファイル枠の見直しを求めて停止する。
8. `N > 0`なら選択済み自動テキスト入力の合計文字数`C`を求め、`maxChars = max(120000, ceil(C / T))`を初期値とする。120,000文字は運用上の下限であり、Microsoftの制限値ではない。`N = 0`なら`C`と`maxChars`の計算およびテキストバンドルを行わない。
9. `N > 0`なら`.json`と`.jsonl`を追加除外して、同梱`miku-text-bundle`をknowledge-sourceモードでdry-runする。収集件数が`N`と一致し、推定Knowledgeファイル数が`A`以下になるまで、対象条件の修正または`maxChars`の増加とdry-runを繰り返す。推定数が`A`未満でも、空き枠を埋めるための分割は行わない。このdry-runは計画確定用であり、最終成果物を生成しない。
10. 次の最終basenameをすべて列挙し、重複がないことを変換やコピーの前に確認する。
    - JSON / JSONLごとの1つのXLSX basename
    - `work/knowledge-markdown/*.md`を選択形式でコピーまたはDOCX化したbasename
    - `manual-input/`のMarkdownを選択形式でコピーまたはDOCX化したbasename
    - 検証済みの準備済みOffice文書のbasename
11. 競合、未対応形式、確認待ちがあれば`items-to-confirm.md`へ記録し、`upload/`を変更せず停止する。
12. 状態を`finalizing`へ更新し、`M`、`J`、`A`、`N`、`T`、`C`、採用した`maxChars`、mapping SHA-256、dry-run推定数、固定する自動生成数、最終basenameを記録する。
13. [確定済み構成の再実行可能な変換ジョブ](02-repeatable-conversion-job.md)に従い、確認済みの自動テキスト入力、JSON入力とmapping、手動資料、形式、上限、CLI引数を`work/conversion-plan.json`へ作る。同梱`create-conversion-job.mjs`で計画を正規化し、`work/run-conversion.mjs`を生成する。
14. `miku-json2xlsx`、`miku-text-bundle`、`miku-md2docx`をAI Agentが個別に本実行せず、生成した`work/run-conversion.mjs`を実行する。ランナーは一時出力でJSON / JSONLを1入力1XLSXへ変換し、必要なテキストバンドル本実行、MarkdownのコピーまたはDOCX変換、準備済みOffice文書の一時コピーとハッシュ確認を行う。構成検証に成功した場合だけ`work/knowledge-markdown/`、`work/knowledge-index.md`、`upload/`を一括更新する。
15. ランナーのJSON workbook数、warning code、テキスト本実行生成数、Source Mapping、最終basename、成功履歴が計画と一致することを確認する。ランナーが入力集合、mapping SHA-256、構成、生成数の差を報告した場合は、既存`upload/`を維持して停止する。
16. XLSXの開封可否、READMEデータ辞書、sheet、column、追跡列、元JSON / JSONLとの対応を確認する。MarkdownまたはDOCXの開封可否、元相対パス、ファイル境界、リンク、秘密情報と、準備済み文書の読取可否も検証する。
17. 自動生成物と手動資料を合わせた最終候補総数が、対象サービスで確認した上限以下であることを確認する。
18. `upload/`の実在ファイルからKnowledge一覧を作る。Agent BuilderではNameが30文字以内であることを検証して`agent-builder-input.md`へ記載する。30文字を超える場合は完成扱いにせず、無断で切り詰めずに利用者へ短縮を求める。Gemにはこの固定上限を流用せず、実画面で確認した制限を使い、Name、Description、Custom instructions、Knowledge、Items to confirmを持つ`gem-input.md`へbasenameだけを記載する。
19. `upload/`の未参照ファイルと入力用Markdownの参照切れがないことを双方向に確認する。
20. `items-to-confirm.md`を確定し、`preparation-status.md`と`execution-record.md`へ実行パラメータ、変換ジョブのパス、入力と出力の実績、検証結果を記録して状態を`finalized`へ更新する。
21. 利用者へ`upload/`の登録候補、手動資料数、JSON workbook数、テキストバンドル数、合計数、確認事項、内容更新時の`node work/run-conversion.mjs`を示す。

## 分類

| Classification | Meaning |
|---|---|
| JSON workbook | 適格なJSON / JSONL。レビュー済みmappingで1入力1XLSXへ変換し、`miku-text-bundle`へ重複投入しない |
| Auto include | JSON / JSONLを除く`miku-text-bundle`対応テキスト系ファイル。原則すべてknowledge-sourceモードの入力に含める |
| Manual candidate | 自動処理しない非テキスト資料。必要なら人が準備して`manual-input/`へ置く |
| Exclude | `.env`、`.env.*`、秘密情報、出力先、明示的除外、技術的に処理不能なファイルなど、理由を記録して除外する |
| Confirm | 機密性、権限、読取可否、手動資料としての採否など、人の判断を待つ |

## 衝突の扱い

- 旧版と新版、または複数資料の記述が矛盾する場合は、推測で統合しない。正式性と更新日を根拠に採用候補を示し、判断できないものは`items-to-confirm.md`へ記録する。
- 自動生成`knowledge-001.md`と手動`knowledge-001.docx`のように最終basenameが一致する場合は衝突とする。
- `manual-input/a/guide.md`と`manual-input/b/guide.docx`のようにフラット化後のbasenameが一致する場合も衝突とする。
- 大文字小文字だけが異なるbasenameは、環境間の互換性を考慮して衝突として扱う。

## 完成条件

- 第1段階が`awaiting-manual-input`で停止し、同じターンで第2段階へ進んでいない。
- 第1段階では自動処理対象だけが確定し、`miku-text-bundle`がまだ実行されていない。
- 第1段階では`miku-json2xlsx`のinspection、mapping作成、XLSX変換もまだ実行されていない。
- `preparation-status.md`から別セッションで再開できる。
- `execution-record.md`に今回の指定内容と実績が残り、次回はそれを参考に新しい日時付き実行ディレクトリで開始できる。
- 第2段階で`work/conversion-plan.json`と`work/run-conversion.mjs`が生成され、初回変換もそのランナーで成功している。
- 構成固定の内容更新では同じランナーを再実行でき、入力パス集合、個数、basename、形式の差異を検出した場合は既存`upload/`を維持して停止する。
- `manual-input/`の原本が変更されていない。
- `agent-builder-input.md`または`gem-input.md`が対象サービスの入力項目順になっている。
- Agent BuilderのNameが30文字以内である。超過時は完成扱いにせず、無断で切り詰めていない。Gemにはこの固定上限を流用していない。
- `gem-input.md`にName、Description、Custom instructions、Knowledge、Items to confirmがこの順で存在する。
- 第2段階が第1段階と同じ日時付き実行ディレクトリを再利用している。
- Knowledge sources欄が`upload/`に実在するbasenameだけを使う。
- `upload/`が登録候補だけのフラット構成になっている。
- 自動生成Markdownと手動Markdownが選択どおりMarkdownのまま配置されるか、対応するDOCXへ変換されている。
- JSON / JSONLごとに承認済みmappingとSHA-256が固定され、1入力1XLSXが生成されている。
- 検証済みの準備済みOffice文書がbasenameを維持している。
- Agent Builderでは手動資料が19件以下で、自動生成Knowledge sourceが最低1件ある。
- Agent Builderではテキストバンドル数が`A = 20 - M - J`以下で、JSON workbook、テキストバンドル、手動資料を合わせた最終登録候補総数が20以下である。Gemでは実画面で確認した上限以下である。
- `N`が自動生成枠より少ない場合、空き枠を埋めるための不要な分割をしていない。
- 中間Markdown、管理用index、状態ファイルが`work/`へ分離されている。
- InstructionsとKnowledge sourcesが混在していない。
- スキップ、旧版、重複、矛盾、読取不能、未対応形式、機密情報が無整理で残っていない。
- 入力元と`manual-input/`が変更されていない。
- 対象テナントまたはアカウント、共有範囲、Knowledgeファイルの閲覧権限が`items-to-confirm.md`に明示されている。
- 外部サービス、公開Web、公開リポジトリへ生成物をアップロードしていない。
