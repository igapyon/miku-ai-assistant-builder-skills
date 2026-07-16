# TODO

## 現在の位置づけ

このリポジトリは、Microsoft 365 Copilot 内の軽量な Agent Builder に投入するデータを準備する Agent Skill の作業中リポジトリである。

- Copilot Studio 固有のエージェント構築は対象外とする。
- Node.js／Java CLI ランタイムには依存しない、内容中心の Agent Skill とする。
- `miku-prompt-lint-skills` を同レイヤーの姉妹ソフトとして参照する。
- `miku-text-bundle` 連携は将来構想であり、現在の必須ランタイムとはしない。

## 現時点で確認できる基本仕様

- 利用者の要望から、Agent Builder の各入力欄へコピーできるデータを作成する。
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

- [ ] `SKILL.md` の `Workflow` を具体化する。
- [ ] 利用者から最初に聞き取る情報を定義する。
- [ ] 情報不足時に確認する項目と質問順序を定義する。
- [ ] Agent Builder への適合性を判定するタイミングと判断基準を定義する。
- [ ] 適合度が低い要望を、Agent Builder 向けの実現可能な用途へ調整する手順を定義する。
- [ ] 既存エージェントの新規作成だけでなく、修正・改善も対象に含めるか決める。
- [ ] `SKILL.md` の `Output` を具体化する。
- [ ] 最終成果物を単一のコピー用 Markdown として返すか決める。
- [ ] 未確定事項、前提、制約、適合性上の注意を出力へどう表現するか決める。
- [ ] Knowledge sources 候補の評価方法を定義する。
- [ ] Capabilities の候補提示と利用可否確認の扱いを定義する。
- [ ] 完成条件とセルフチェック項目を定義する。
- [ ] 通常例、情報不足例、適用外に近い境界例を用意する。

## リポジトリ整備 TODO

- [ ] 正本のスキルをリポジトリ直下に置くか、`skills/igapyon-miku-m365-agent-builder/` 配下へ整理するか決める。
- [ ] 姉妹ソフト `miku-prompt-lint-skills` の構成から採用する要素と採用しない要素を整理する。
- [ ] `README.md` を作成し、目的、利用方法、正本の配置、開発方法を記載する。
- [ ] `docs/miku-soft-reference.md` を作成するか検討する。
- [ ] `.gitignore` と `workplace/.gitkeep` を整備する。
- [ ] 配布用バンドルの構成と生成方法を決める。
- [ ] `index.json` を生成・同梱する方針を決める。
- [ ] スキル構造、参照リンク、配布内容を検証するテストを用意する。

## 将来連携 TODO

- [ ] `miku-text-bundle` の Knowledge source モードに関する未決事項を整理する。
- [ ] 上流へ依頼する変更内容と受け入れ条件を確定する。
- [ ] 上流機能が利用可能になった後、このスキルからの案内・連携方法を設計する。
