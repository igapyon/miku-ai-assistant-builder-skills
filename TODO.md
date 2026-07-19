# TODO

## 現在の位置づけ

このリポジトリは、Microsoft 365 Copilot 内の軽量な Agent Builder に投入するデータを準備する Agent Skill の作業中リポジトリである。

- Copilot Studio 固有のエージェント構築は対象外とする。
- 将来は、Microsoft 365 Copilot の Agent Builder に加えて、Google Gemini の Gem にも対応する予定とする。
- 実行時は`miku-text-bundle`と`miku-md2docx`のCLIランタイムを利用するワークフロー型Agent Skillとする。
- `miku-prompt-lint-skills` を同レイヤーの姉妹ソフトとして参照する。
- `miku-text-bundle`と`miku-md2docx`は、Knowledge sources生成時に利用する上流ランタイムとする。

## 現時点で確認できる基本仕様

- 利用者の要望から、Agent Builder の各入力欄へコピーできるデータを作成する。
- 雑多な既存フォルダを棚卸しし、`miku-text-bundle --mode knowledge-source`でKnowledge sources候補を生成する。
- 番号付き中間Markdownを`miku-md2docx`でDOCX化し、フラットな`upload/`を最終登録対象にする。
- 元リポジトリ基準の相対パスをDOCX本文に保持し、DOCX間の相対リンクには依存しない。
- 基本の出力順は次のとおりとする。
  1. Name
  2. Description
  3. Instructions
  4. Starter prompts
  5. Knowledge sources
  6. Capabilities
  7. Items to confirm
- Instructions はエージェントの振る舞いを定義する。
- Knowledge sources は回答の根拠となる事実情報を提供する。
- Instructions と Knowledge sources を混同しない。
- Agent Builder に不向きな要求は、可能であれば「案内」「情報整理」「判断材料の提示」「下書き作成」へ変換する。
- URL、ファイル、Capabilities、利用権限などの未確認事項を推測で確定しない。
- 変更されやすい製品仕様や制限値は、Microsoft の最新公式情報または利用者の実画面で確認する。

## 設計 TODO

- [x] `SKILL.md` の基本 `Workflow` を具体化する。
- [ ] 利用者から最初に聞き取る情報を定義する。
- [ ] 情報不足時に確認する項目と質問順序を定義する。
- [ ] Agent Builder への適合性を判定するタイミングと判断基準を定義する。
- [ ] 適合度が低い要望を、Agent Builder 向けの実現可能な用途へ調整する手順を定義する。
- [ ] 既存エージェントの新規作成だけでなく、修正・改善も対象に含めるか決める。
- [x] `SKILL.md` の基本 `Output` を具体化する。
- [x] 新規設計では単一のコピー用Markdown、フォルダ変換では配備用フォルダを返す方針を決める。
- [x] フォルダ変換時は未確定事項を`items-to-confirm.md`へ記録する方針を決める。
- [x] 雑多なフォルダの棚卸しと`miku-text-bundle` knowledge-sourceモードの連携を定義する。
- [x] `miku-md2docx`による番号付きMarkdownから最終DOCXへの変換を定義する。
- [x] 登録用`upload/`を検証済みKnowledge source候補だけのフラット構成にする。
- [x] ソースコードの相対パスとファイル境界をDOCX本文に保持する方針を定義する。
- [x] フォルダ変換を、自動処理、手動資料追加、再開後の最終化からなる二段階方式にする。
- [x] `preparation-status.md`で別セッションから再開する方針を定義する。
- [x] 手動追加MarkdownのDOCX変換と、準備済みDOCX、PPTX、XLSXの統合を定義する。
- [x] 人力資料を最大19件とし、残りの20件枠へ自動バンドルを収める配分規則を定義する。
- [ ] Knowledge sources 候補の評価方法を定義する。
- [ ] Capabilities の候補提示と利用可否確認の扱いを定義する。
- [ ] 完成条件とセルフチェック項目を定義する。
- [ ] 通常例、情報不足例、適用外に近い境界例を用意する。

## リポジトリ整備 TODO

- [x] 正本のスキルを `skills/igapyon-miku-ai-assistant-builder/` 配下へ整理する。
- [x] 姉妹ソフト `miku-prompt-lint-skills` を参照し、content-only 型の正本配置、決定的 ZIP、SHA-256、CI、draft release、配布テストを採用する。
- [x] `README.md` を作成し、目的、正本の配置、ビルド、GitHub Actions を記載する。
- [ ] `docs/miku-soft-reference.md` を作成するか検討する。
- [x] `.gitignore` と `workplace/.gitkeep` を整備する。
- [x] 配布用バンドル、決定的 ZIP、SHA-256 の生成方法を整備する。
- [x] `index.json` を生成し、配布 ZIP に同梱する。
- [x] スキル構造、インストール形状、配布内容を検証するテストを用意する。

## 将来連携 TODO

- [x] `miku-text-bundle` v1.5.0で追加されたKnowledge sourceモードの契約を整理する。
- [x] 上流へ依頼した変更内容と受け入れ条件が実装済みであることを確認する。
- [x] `miku-text-bundle` v1.5.0以降を利用する案内・連携方法を設計する。
