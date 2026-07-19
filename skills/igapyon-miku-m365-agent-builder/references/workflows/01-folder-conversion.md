# 雑多なフォルダの二段階変換

## 目的

文書、メモ、ソースコード、下書き、旧版などが混在するフォルダを自動処理したあと、人間が準備したMarkdownやOffice文書を追加し、Microsoft 365 Copilot Agent Builderへ設定しやすい単一の配備用フォルダへ統合する。

これは専用インポート形式への変換ではない。Configure画面へコピーする入力値と、Knowledge sourcesとして登録する候補を人が確認できる受け渡し形式とする。

生成物は、社内や組織テナント内などの閉じたAgent Builder環境へ人が配備する。このワークフローはローカルの配備用フォルダを完成させるところで終了し、Agent Builderへのアップロード、共有設定、外部公開は行わない。

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

## 安全原則

- 入力元と`manual-input/`を読み取り専用として扱う。
- 出力は入力元とは別のフォルダへ作る。
- シンボリックリンク、隠しファイル、巨大ファイル、アーカイブは対象範囲を確認する。
- `.env`と`.env.*`は内容を読み込まず必ず除外する。
- パスワード付き、破損、未対応形式は無理に処理せず`items-to-confirm.md`へ記録する。
- 機密情報、個人情報、資格情報、秘密鍵などを検出した場合は、`upload/`への複製を止めて要確認へ記録する。
- 出力basenameの競合は、変換やコピーより前に検出する。自動改名や上書きで解決しない。
- `upload/`を変更する前に最終出力計画を確定する。途中失敗時に既存の正常な`upload/`を部分更新しない。

## 第1段階: 自動処理と準備待ち

1. エージェントの目的、対象利用者、代表的な質問、正式資料、入力元、出力先を特定する。
2. ファイルの相対パス、形式、サイズ、更新日時、推定テーマ、版、重複候補、読取可否を棚卸しする。
3. `Include`、`Exclude`、`Convert first`、`Confirm`へ分類する。`.env`と`.env.*`は必ず`Exclude`へ分類する。
4. Office文書、PDF、画像など、`miku-text-bundle`が既定で除外する必要資料は、検証可能な方法でテキスト化して中間入力へ置く。
5. 同梱`miku-text-bundle`を`--mode knowledge-source`と`--dry-run`で実行し、対象範囲と診断を確認する。
6. dry-runに問題がなければ本実行し、番号付きMarkdownを`work/knowledge-markdown/`へ、管理用indexを`work/knowledge-index.md`へ配置する。
7. 空の`manual-input/`を作る。既存の`manual-input/`がある場合は内容を削除せず、新規変換として続行しない。
8. `work/preparation-status.md`を作り、状態を`awaiting-manual-input`にする。
9. 利用者へ`manual-input/`の場所、追加可能な形式、原本を変更しない規則、再開方法を伝える。
10. 追加資料がない場合も利用者の明示的な確認を待ち、ここで停止する。

第1段階では次を行わない。

- 番号付きMarkdownのDOCX変換
- `manual-input/`の資料変換またはコピー
- 最終`upload/`の構成
- `agent-builder-input.md`の生成
- 状態の`finalized`への更新

## preparation-status.md

別セッションで推測せず再開できるよう、少なくとも次をMarkdownで記録する。

```markdown
# Agent Builder Preparation Status

- State: awaiting-manual-input
- Source directory: [入力元]
- Output directory: [出力先]
- Created at: [日時とタイムゾーン]
- Text bundle runtime: [版とバックエンド]
- Text bundle mode: knowledge-source
- Filename prefix: [prefix]
- Encoding: [文字コード]
- Max chars: [値]
- Max input file bytes: [値]

## Generated intermediate files

- work/knowledge-markdown/knowledge-001.md

## Diagnostics

- [警告またはNone]

## Resume

Place optional source files in manual-input/, then invoke this skill again with this output directory.
```

状態ファイルには秘密情報を記録しない。入力元と出力先の絶対パスは再開に必要なローカル管理情報として状態ファイルにだけ記録できるが、Knowledge sources、DOCX本文、`agent-builder-input.md`へ複製しない。

## 人間による追加資料

利用者は、Knowledge sourcesへ加えたい原本を`manual-input/`へ置く。

- Markdownは第2段階で同じbasenameのDOCXへ変換する。
- DOCX、PPTX、XLSXなど、現行Agent Builderが埋め込みファイルとして受け付ける準備済みOffice文書は、検証後にbasenameを維持して最終候補へ含める。
- 対応可否が不明な形式は自動採用しない。
- サブディレクトリを許可する場合も、最終`upload/`はフラットにするため、全候補のbasename競合を確認する。
- `manual-input/`のファイルをその場で変換、編集、改名しない。

## 第2段階: 再開と最終化

1. `work/preparation-status.md`の状態が`awaiting-manual-input`であることを確認する。
2. 記録された入力元、出力先、中間生成物、実行条件と、現在のファイルを照合する。欠落や差異は推測で補わず停止する。
3. 利用者が追加資料の準備完了、または追加資料なしを明示していることを確認する。
4. `manual-input/`を読み取り専用で棚卸しし、形式、サイズ、読取可否、機密性、パスワード保護を確認する。
5. 次の最終basenameをすべて列挙し、重複がないことを変換やコピーの前に確認する。
   - `work/knowledge-markdown/*.md`をDOCX化したbasename
   - `manual-input/`のMarkdownをDOCX化したbasename
   - 検証済みの準備済みOffice文書のbasename
6. 競合、未対応形式、確認待ちがあれば`items-to-confirm.md`へ記録し、`upload/`を変更せず停止する。
7. 状態を`finalizing`へ更新する。
8. 番号付きMarkdownと手動Markdownを`miku-md2docx`で一対一変換する。変換先は既存の正常な`upload/`とは別の一時的な出力場所とする。
9. 準備済みOffice文書を一時的な出力場所へコピーし、原本とのサイズまたはハッシュ一致を確認する。
10. DOCXの開封可否、元相対パス、ファイル境界、リンク、秘密情報と、Office文書の読取可否を検証する。
11. すべての検証に成功した場合だけ、最終`upload/`を登録候補のフラット構成へ置き換える。
12. `upload/`の実在ファイルからKnowledge sources一覧を作り、`agent-builder-input.md`へbasenameだけを記載する。
13. `upload/`の未参照ファイルと`agent-builder-input.md`の参照切れがないことを双方向に確認する。
14. `items-to-confirm.md`を確定し、状態を`finalized`へ更新する。
15. 利用者へ`upload/`の登録候補と確認事項を示す。

## 分類

| Classification | Meaning |
|---|---|
| Include | knowledge-sourceモードの入力に含める |
| Exclude | `.env`、`.env.*`、一時ファイル、明白な重複、無関係資料など、理由を記録して除外する |
| Convert first | 必要な非テキスト資料を検証可能な方法でテキスト化してから含める |
| Confirm | 版、正確性、機密性、権限、読取可否など、人の判断を待つ |

## 衝突の扱い

- 旧版と新版、または複数資料の記述が矛盾する場合は、推測で統合しない。正式性と更新日を根拠に採用候補を示し、判断できないものは`items-to-confirm.md`へ記録する。
- 自動生成`knowledge-001.md`と手動`knowledge-001.docx`のように最終basenameが一致する場合は衝突とする。
- `manual-input/a/guide.md`と`manual-input/b/guide.docx`のようにフラット化後のbasenameが一致する場合も衝突とする。
- 大文字小文字だけが異なるbasenameは、環境間の互換性を考慮して衝突として扱う。

## 完成条件

- 第1段階が`awaiting-manual-input`で停止し、同じターンで第2段階へ進んでいない。
- `preparation-status.md`から別セッションで再開できる。
- `manual-input/`の原本が変更されていない。
- `agent-builder-input.md`がConfigure画面の項目順になっている。
- Knowledge sources欄が`upload/`に実在するbasenameだけを使う。
- `upload/`が登録候補だけのフラット構成になっている。
- 自動生成Markdownと手動Markdownが対応するDOCXへ変換されている。
- 検証済みの準備済みOffice文書がbasenameを維持している。
- 中間Markdown、管理用index、状態ファイルが`work/`へ分離されている。
- InstructionsとKnowledge sourcesが混在していない。
- スキップ、旧版、重複、矛盾、読取不能、未対応形式、機密情報が無整理で残っていない。
- 入力元と`manual-input/`が変更されていない。
- 対象テナント、Agent Builderの共有範囲、Knowledge sourcesの閲覧権限が`items-to-confirm.md`に明示されている。
- 外部サービス、公開Web、公開リポジトリへ生成物をアップロードしていない。
