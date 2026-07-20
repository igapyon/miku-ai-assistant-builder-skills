# 雑多なフォルダの二段階変換

## 目的

文書、メモ、ソースコード、下書き、旧版などが混在するフォルダから、`miku-text-bundle`が扱えるテキスト系ファイルを原則すべて自動処理対象として確定したあと、人間が準備したMarkdownやOffice文書を追加し、主対象のMicrosoft 365 Copilot Agent BuilderまたはGoogle Gemini Gemへ設定しやすい単一の配備用フォルダへ統合する。対象サービスの仕様差に応じて同じ流れを使い分ける。

これは専用インポート形式への変換ではない。Configure画面へコピーする入力値と、Knowledge sourcesとして登録する候補を人が確認できる受け渡し形式とする。

生成物は利用者が管理するAgent BuilderまたはGemへ人が配備する。このワークフローはローカルの配備用フォルダを完成させるところで終了し、ファイルのアップロード、共有設定、外部公開は行わない。

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

## 出力ディレクトリ

利用者が出力先を明示しない場合は、確認済みの入力元を扱う作業リポジトリの次の場所を既定とする。現在位置やスキルのインストール元だけから作業リポジトリを決めない。入力元に対応する書き込み可能な作業リポジトリを確定できない場合は、基準ディレクトリを利用者へ確認する。

```text
workplace/miku-ai-assistant-builder/YYYYMMDD-HHmm/
```

- `YYYYMMDD-HHmm`は新規変換を開始したローカル日時とする。
- 同じ分の実行ディレクトリが既にある場合は上書きせず、`YYYYMMDD-HHmm-02`、`YYYYMMDD-HHmm-03`のように連番を付ける。
- 利用者が`temp1/`など別の基準ディレクトリを指定した場合も、その下に`miku-ai-assistant-builder/<実行ID>/`を作る。
- 第1段階で実行ディレクトリを一度だけ作る。第2段階では新しい実行IDを発行せず、利用者が指定した既存の`work/preparation-status.md`が属する実行ディレクトリを再利用する。
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

## 第1段階: 自動テキスト入力の確定と準備待ち

1. 開始前確認を完了し、配備先、入力元、自動処理範囲を復唱する。その後、エージェントの目的、対象利用者、代表的な質問、正式資料、出力先を特定する。出力先の明示指定がなければ、前述の日時付き既定出力先を採用する。GemではMarkdownまたはDOCXも選ぶ。質問前に必須項目を仮定しない。利用者が明示的に委任した項目だけは、想定を列挙して補完する。
2. ファイルの相対パス、形式、サイズ、更新日時、文字コード、読取可否を棚卸しする。
3. `.md`、`.mjs`、`.js`など、同梱`miku-text-bundle`が扱えるテキスト系ファイルを既定で`Auto include`へ分類する。内容の関連性、推定テーマ、旧版、重複候補だけを理由に対象を絞り込まない。
4. `.env`と`.env.*`、秘密情報、出力先、利用者が明示した除外、ランタイムが技術的に扱えないファイルだけを`Exclude`または`Confirm`へ分類し、理由を記録する。
5. DOCX、PPTX、XLSX、PDF、画像などの非テキスト資料を自動変換せず、自動処理対象に含めない。必要なら、人が準備して`manual-input/`へ置く`Manual candidate`として記録する。この段階では分割数を確定せず、`miku-text-bundle`を実行しない。
6. 空の`manual-input/`を作る。既存の`manual-input/`がある場合は内容を削除せず、新規変換として続行しない。
7. `work/preparation-status.md`を作り、状態を`awaiting-manual-input`にする。
8. 利用者へ`manual-input/`の解決済みフルパスと出力先基準の相対パス、追加可能な形式、対象サービスで確認したファイル上限、原本を変更しない規則、再開方法を伝える。Agent Builderでは人力資料は最大19件とする。
9. 追加資料がない場合も利用者の明示的な確認を待ち、ここで停止する。

第1段階では次を行わない。

- `miku-text-bundle`のdry-runと本実行
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
- Text bundle runtime: [版とバックエンド]
- Text bundle mode: knowledge-source
- Filename prefix: [prefix]
- Encoding: [文字コード]
- Max input file bytes: [値]

## Selected automatic inputs

- [入力元基準の相対パス]

## Non-automatic input candidates

- [manual-input/への人手配置候補、またはNone]

## Diagnostics

- [警告またはNone]

## Resume

Place optional source files in manual-input/, then invoke this skill again with this output directory.
```

状態ファイルには秘密情報を記録しない。入力元と出力先の絶対パスは再開に必要なローカル管理情報として状態ファイルにだけ記録できるが、Knowledgeファイル本文、`agent-builder-input.md`、`gem-input.md`へ複製しない。

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
5. 手動Markdownを選択形式にかかわらず1件として数え、検証済みの準備済み文書と合わせた手動資料数`M`を確定する。Agent Builderで`M`が20以上なら、19件以下への削減を求めて停止する。Gemでは実画面で確認した上限を使う。
6. 対象サービスで確認した総ファイル上限から自動生成枠`A`を求める。Agent Builderでは`A = 20 - M`とする。Gemでは20件を流用しない。選択済みの適格な自動入力ファイル数`N`が0なら停止し、目標自動出力数を`T = min(N, A)`とする。
7. 選択済み自動入力の合計文字数`C`を求め、`maxChars = max(120000, ceil(C / T))`を初期値とする。120,000文字は運用上の下限であり、Microsoftの制限値ではない。
8. 同梱`miku-text-bundle`をknowledge-sourceモードでdry-runする。収集件数が`N`と一致し、推定Knowledgeファイル数が`A`以下になるまで、対象条件の修正または`maxChars`の増加とdry-runを繰り返す。推定数が`A`未満でも、空き枠を埋めるための分割は行わない。
9. 条件を満たした値で本実行し、番号付きMarkdownを`work/knowledge-markdown/`へ、管理用indexを`work/knowledge-index.md`へ配置する。本実行の番号付きMarkdownが`A`を超えた場合は最終化せず、より大きい`maxChars`で再生成する。
10. 次の最終basenameをすべて列挙し、重複がないことを変換やコピーの前に確認する。
    - `work/knowledge-markdown/*.md`を選択形式でコピーまたはDOCX化したbasename
    - `manual-input/`のMarkdownを選択形式でコピーまたはDOCX化したbasename
    - 検証済みの準備済みOffice文書のbasename
11. 競合、未対応形式、確認待ちがあれば`items-to-confirm.md`へ記録し、`upload/`を変更せず停止する。
12. 状態を`finalizing`へ更新し、`M`、`A`、`N`、`T`、`C`、採用した`maxChars`、dry-run推定数、本実行生成数を記録する。
13. Agent BuilderまたはGemのDOCX選択では、番号付きMarkdownと手動Markdownを`miku-md2docx`で一対一変換する。GemのMarkdown選択では`miku-md2docx`を実行せず、Markdownをそのままコピーする。出力先は既存の正常な`upload/`とは別の一時的な場所とする。
14. 準備済みOffice文書を一時的な出力場所へコピーし、原本とのサイズまたはハッシュ一致を確認する。
15. MarkdownまたはDOCXの開封可否、元相対パス、ファイル境界、リンク、秘密情報と、準備済み文書の読取可否を検証する。
16. 自動生成物と手動資料を合わせた最終候補総数が、対象サービスで確認した上限以下であることを確認する。
17. すべての検証に成功した場合だけ、最終`upload/`を登録候補のフラット構成へ置き換える。
18. `upload/`の実在ファイルからKnowledge一覧を作り、Agent Builderでは`agent-builder-input.md`、GemではName、Description、Custom instructions、Knowledge、Items to confirmを持つ`gem-input.md`へbasenameだけを記載する。
19. `upload/`の未参照ファイルと入力用Markdownの参照切れがないことを双方向に確認する。
20. `items-to-confirm.md`を確定し、状態を`finalized`へ更新する。
21. 利用者へ`upload/`の登録候補、手動資料数、自動生成数、合計数と確認事項を示す。

## 分類

| Classification | Meaning |
|---|---|
| Auto include | `miku-text-bundle`が扱えるテキスト系ファイル。原則すべてknowledge-sourceモードの入力に含める |
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
- `preparation-status.md`から別セッションで再開できる。
- `manual-input/`の原本が変更されていない。
- `agent-builder-input.md`または`gem-input.md`が対象サービスの入力項目順になっている。
- `gem-input.md`にName、Description、Custom instructions、Knowledge、Items to confirmがこの順で存在する。
- 第2段階が第1段階と同じ日時付き実行ディレクトリを再利用している。
- Knowledge sources欄が`upload/`に実在するbasenameだけを使う。
- `upload/`が登録候補だけのフラット構成になっている。
- 自動生成Markdownと手動Markdownが選択どおりMarkdownのまま配置されるか、対応するDOCXへ変換されている。
- 検証済みの準備済みOffice文書がbasenameを維持している。
- Agent Builderでは手動資料が19件以下で、自動生成Knowledge sourceが最低1件ある。
- Agent Builderでは自動生成数が`A = 20 - M`以下で、最終登録候補総数が20以下である。Gemでは実画面で確認した上限以下である。
- `N`が自動生成枠より少ない場合、空き枠を埋めるための不要な分割をしていない。
- 中間Markdown、管理用index、状態ファイルが`work/`へ分離されている。
- InstructionsとKnowledge sourcesが混在していない。
- スキップ、旧版、重複、矛盾、読取不能、未対応形式、機密情報が無整理で残っていない。
- 入力元と`manual-input/`が変更されていない。
- 対象テナントまたはアカウント、共有範囲、Knowledgeファイルの閲覧権限が`items-to-confirm.md`に明示されている。
- 外部サービス、公開Web、公開リポジトリへ生成物をアップロードしていない。
