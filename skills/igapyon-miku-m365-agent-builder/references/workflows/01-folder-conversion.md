# 雑多なフォルダの変換

## 目的

文書、メモ、ソースコード、下書き、旧版などが混在するフォルダを、Microsoft 365 Copilot Agent Builderへ設定しやすい配備用フォルダへ変換する。

これは専用インポート形式への変換ではない。Configure画面へコピーする入力値と、Knowledge sourcesとして登録する候補を整理する処理である。

## 安全原則

- 入力元を読み取り専用として扱う。
- 出力は入力元とは別の新しいフォルダへ作る。
- シンボリックリンク、隠しファイル、巨大ファイル、アーカイブは対象範囲を確認する。
- パスワード付き、破損、未対応形式は無理に処理せず、要確認へ記録する。
- 機密情報、個人情報、資格情報、秘密鍵などを検出した場合は、出力への複製を止めて要確認へ記録する。

## 変換手順

1. エージェントの目的、対象利用者、代表的な質問、正式資料、入力元、出力先を特定する。
2. ファイルの相対パス、形式、サイズ、更新日時、推定テーマ、版、重複候補、読取可否を棚卸しする。
3. `Include`、`Exclude`、`Convert first`、`Confirm`へ分類する。
4. Office文書、PDF、画像など、`miku-text-bundle`が既定で除外する必要資料は、適切な変換手段でテキスト化して中間入力へ置く。
5. `igapyon-miku-text-bundle`を`--mode knowledge-source`と`--dry-run`で実行し、対象範囲と診断を確認する。
6. dry-runに問題がなければ本実行し、番号付きMarkdownを`work/knowledge-markdown/`へ、管理用indexを`work/`へ生成する。
7. 番号付きMarkdownだけを`miku-md2docx`で一対一変換し、最終DOCXを`upload/`直下へフラットに置く。
8. DOCX本文に元相対パスとファイル境界が保持され、マシン固有の絶対パスやDOCX間の相対リンクへ依存していないことを確認する。
9. 管理用indexからスキップ、警告、marker、旧生成物候補を確認する。
10. Agent Builderの入力値と、人の判断が必要な事項を作る。

目的が不明な場合は棚卸しまで進め、Knowledge sourcesの採否を確定しない。

## 分類

| Classification | Meaning |
|---|---|
| Include | knowledge-sourceモードの入力に含める |
| Exclude | 一時ファイル、明白な重複、無関係資料など、理由を記録して除外する |
| Convert first | 必要な非テキスト資料を検証可能な方法でテキスト化してから含める |
| Confirm | 版、正確性、機密性、権限、読取可否など、人の判断を待つ |

## 衝突の扱い

旧版と新版、または複数資料の記述が矛盾する場合は、推測で統合しない。正式性と更新日を根拠に採用候補を示し、判断できないものは`items-to-confirm.md`へ記録する。

## 完成条件

- `agent-builder-input.md`がConfigure画面の項目順になっている。
- `upload/`がDOCXだけのフラット構成になっている。
- `upload/knowledge-NNN.docx`だけがKnowledge sources登録候補として示されている。
- 中間Markdownと`knowledge-index.md`が`work/`へ分離されている。
- 各DOCXに元リポジトリ基準の相対パスとファイル境界が保持されている。
- DOCX間の相対リンクや処理順に依存していない。
- InstructionsとKnowledge sourcesが混在していない。
- 入力元と生成物を追跡できる。
- スキップ、旧版、重複、矛盾、読取不能、機密情報が無整理で残っていない。
- 未確認事項が明示されている。
- 入力元が変更されていない。
