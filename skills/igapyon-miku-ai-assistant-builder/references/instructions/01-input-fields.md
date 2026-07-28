# Agent BuilderとGemの入力項目と推奨形式

## 目次

- [基本方針](#基本方針)
- [サービス間の共通コア](#サービス間の共通コア)
- [各項目の推奨形式](#各項目の推奨形式)
- [Instructionsの書き方](#instructionsの書き方)
- [Knowledge sourcesへInstructionsを置かない](#knowledge-sourcesへinstructionsを置かない)
- [このスキルが提供する標準形](#このスキルが提供する標準形)
- [公式情報](#公式情報)

## 基本方針

Agent Builderは自然言語によるエージェント作成に対応するため、専用のJSONやプログラムコードは必須ではない。一方、内容を一つの長い説明文に混ぜるより、Configure画面の項目に対応させて情報を分離し、Instructionsを構造化Markdownで記述する方が、確認、入力、修正、テストを行いやすい。

このスキルでは、原則として次の順序で入力データを提供する。

1. Name
2. Description
3. Instructions
4. Starter prompts
5. Knowledge sources
6. Capabilities
7. 確認事項

この形式はAgent Builderへ取り込むファイル形式ではなく、人が各入力欄へコピーするための受け渡し形式とする。

## サービス間の共通コア

Agent BuilderとGemでは、Name、Description、Instructions、Knowledge、確認事項を共通コアとして扱う。GemではInstructionsを`Custom instructions`見出しで出力し、Gem画面のInstructions欄へ転記する。

| 意味 | Agent Builder | Gem |
|---|---|---|
| 名前 | Name | Name |
| 短い用途説明 | Description | Description |
| 振る舞いの指示 | Instructions | Custom instructions |
| 回答根拠ファイル | Knowledge sources | Knowledge |
| 配備前の未確定事項 | Items to confirm | Items to confirm |

Agent BuilderのStarter promptsとCapabilitiesは追加項目であり、Gemの共通必須項目とはみなさない。Gemの実画面に独立したDescription欄がない場合も、配備時の確認用概要として`gem-input.md`にDescriptionを残す。

## 各項目の推奨形式

### Name

- エージェントの目的を名前だけで推測できるようにする。
- 抽象的な名称より、対象業務または役割を示す。
- Microsoft 365 CopilotのAgent Builderでは30文字以内を必須とする。
- 30文字を超える場合は入力データを完成扱いにせず、名前を無断で切り詰めず、利用者へ30文字以内への短縮を依頼する。
- GemにはAgent Builderの30文字上限を流用せず、利用者の実画面で確認した制限に従う。

### Description

- 「誰が」「何のために」「何ができるか」を簡潔に示す。
- Agent Storeなどで利用者が用途を判断できる文章にする。
- 数文以内、1,000文字以内にする。
- Instructionsの詳細を繰り返さない。

### Instructions

- 8,000文字以内にする。
- 一つの長い段落ではなく、Markdownの見出しとリストで構造化する。
- 基本構成として、Purpose、General guidelines、Skillsを含める。
- 必要に応じて、Workflow、Error handling、Output format、Examples、Terms、Closingを加える。

推奨する骨格は次のとおり。

```markdown
# Purpose

[エージェントの目的、役割、対象利用者]

# General guidelines

- [基本的な回答方針]
- 回答前に、登録済みKnowledge sourcesから質問に関連する情報を検索する。
- 回答は、取得できたKnowledge sourceの内容を主な根拠にする。
- 回答で使用したKnowledge sourceの登録名を示す。
- 必要な情報がKnowledge sourcesに見つからない場合は、その旨を明示し、推測で補わない。
- [使用する言語、トーン、詳しさ]
- [情報が不足・矛盾している場合の対応]

# Skills

## [Skill 1]

- [実行する具体的な行為]
- [使用するKnowledge source]
- [回答形式]

## [Skill 2]

- [実行する具体的な行為]

# Output format

- [見出し、箇条書き、表などの指定]

# Error handling and limitations

- [情報を発見できない場合の対応]
- [対象外の質問への対応]
```

### Starter prompts

- 最低3件を用意する。
- Agent Builderで実現できる中心的な利用例を示す。
- 利用者がそのまま送信できる質問文にする。
- 同じ質問の言い換えではなく、異なる主要用途を示す。
- 宣言型エージェントの仕様上は最大12件だが、Agent Builderの実画面に表示される上限を優先する。

### Knowledge sources

Knowledge sourcesそのものをInstructionsに埋め込むのではなく、設定対象として分離する。受け渡し時は次の形式で整理する。

```markdown
| Source | Type | Purpose | Confirmed |
|---|---|---|---|
| knowledge-001.docx | File | [何を回答するために使うか] | [Yes / No] |
| official-document.docx | File | [手動追加資料の用途] | [Yes / No] |
| reference.pptx | File | [手動追加資料の用途] | [Yes / No] |
| data.xlsx | File | [手動追加資料の用途] | [Yes / No] |
```

- ローカル配備用の`upload/`を付けず、Agent Builderへ登録するbasenameだけを記載する。
- `upload/knowledge-001.docx`ではなく`knowledge-001.docx`と記載する。
- 自動生成DOCX、手動Markdownから変換したDOCX、検証済みの準備済みOffice文書を同じ表で扱う。
- 表を先に作ってファイルを合わせるのではなく、最終`upload/`に実在するファイルから表を作る。
- 表のSourceから`upload/`への参照切れと、`upload/`にある未記載ファイルを双方向に確認する。
- 関連性の高い情報源だけを選ぶ。
- 文書は適度な大きさで、対象テーマが明確なものを優先する。
- 古い情報、重複、矛盾する文書を無整理のまま追加しない。
- URL、ファイル、サイトを推測で作らない。
- 利用者のアクセス権と管理者設定を確認する。

### Capabilities

利用者の画面に表示され、エージェントの目的に必要なものだけを候補にする。Code InterpreterやImage Generatorなどを想定する場合は、Instructions側でも利用目的を明示する。利用可否が未確認なら、確定設定とせず確認事項にする。

## Instructionsの書き方

- `ask`、`search`、`summarize`、`compare`、`cite`など、観察可能な具体的動作を書く。
- 並列に実行できる事項は箇条書きにする。
- 順番が必須の処理だけを番号付き手順にする。
- 一つの指示に複数の動作を詰め込まず、原子的な単位へ分ける。
- Knowledge sourcesやCapabilitiesは、実際の設定名と対応させる。
- 登録済みKnowledge sourcesを優先して検索し、取得できた内容を根拠に回答するよう指示する。
- 回答で使用したKnowledge sourceの登録名を示すよう指示する。
- 根拠が見つからない場合は、その旨を明示し、推測で補わないよう指示する。
- トーン、詳しさ、出力形式を明示する。
- 組織固有の用語、略語、判定基準を定義する。
- 複雑な用途では、通常例と境界例を少数示す。
- 指示同士が矛盾しないようにする。

## Knowledge sourcesへInstructionsを置かない

8,000文字の上限を回避する目的で、Instructionsの続きをSharePoint文書などへ置かない。Knowledge sourcesは事実情報によるGroundingのために使い、エージェントのシステム的な振る舞いを定義する場所として扱わない。

Knowledge sources内の命令文は、信頼された作成者指示として保証されず、プロンプトインジェクション対策によって除去、短縮、無効化される場合がある。振る舞いに必要な指示はInstructions欄へ収める。

## このスキルが提供する標準形

```markdown
# Microsoft 365 Agent Builder Input

## Name
[入力値]

## Description
[入力値]

## Instructions
[構造化Markdown]

## Starter prompts
- [質問1]
- [質問2]
- [質問3]

## Knowledge sources
| Source | Type | Purpose | Confirmed |
|---|---|---|---|

## Capabilities
- [利用するもの、またはNone]

## Items to confirm
- [未確定事項]
```

Gem向けは同じ中心情報を次の形で提供する。

```markdown
# Google Gemini Gem Input

## Name
[入力値]

## Description
[入力値]

## Custom instructions
[構造化Markdown。Gem画面のInstructions欄へ転記]

## Knowledge
| Source | Type | Purpose | Confirmed |
|---|---|---|---|

## Items to confirm
- [未確定事項]
```

## 公式情報

- [Build agents with Agent Builder in Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-build-agents)
- [Best practices for building declarative agents](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-best-practices)
- [Write effective instructions for declarative agents](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-instructions)
- [Declarative agent manifest reference](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-manifest-1.6)
- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)

この資料は2026-07-20時点で整理した。入力上限や画面項目が変わった場合は、最新の公式情報と利用者の実画面を優先する。
