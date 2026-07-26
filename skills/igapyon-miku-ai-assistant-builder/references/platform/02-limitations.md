# Microsoft 365 Copilot Agent Builderの制限・設計上の注意

この資料は、Copilot Studioではなく、Microsoft 365 Copilot内のAgent Builderを対象にする。制限を「画面上の制限」「利用環境への依存」「方式上の限界」「生成AIとしての限界」に分けて判断する。本スキルのAgent Builder向けフォルダ変換は、端末からの埋め込みファイルを利用できるライセンスまたは従量課金環境だけを対象とする。

## 基本的な判断

Agent Builderは、基本として次の流れに適する。

> 「利用者の質問」→「情報を探す・整理する」→「自然言語で回答する」

この流れから外れ、複雑な分岐、複数処理の連鎖、厳密な状態管理、確実なトランザクションを必要とするほど適合度は下がる。

## Agent Builder画面で確認されている制限

### 公開Webサイト

- 指定できる公開WebサイトURLは最大4件。
- URLは深さ2階層までとされる。
- クエリパラメーターを含むURLは指定できない。
- 組織の管理者がWeb検索を無効にしている場合、エージェント側で有効に見えても検索されないことがある。

### SharePoint、OneDrive、Teams

- SharePointは、現行公式情報ではエージェントごとに最大100ファイルを選択できる。
- OneDriveは、現行公式情報ではエージェントごとに最大50ファイルを選択できる。
- Teamsのチャットなどを個別指定する場合は、最大5件のリンクにスコープできる。
- 会議シリーズを参照する場合、対象範囲が直近4回に限られることがある。
- UI、テナント、ライセンスによって、選択可能な情報源とスコープ機能が異なる。

これらの件数は変更されやすい。入力データを作る時点で件数が重要なら、利用者の実画面または最新のMicrosoft公式情報を確認する。

### 端末からアップロードする埋め込みファイル

- 現行公式情報では、Agent Builderへ端末から直接アップロードできる埋め込みファイルは最大20件。
- 対応形式は`.doc`、`.docx`、`.pdf`、`.ppt`、`.pptx`、`.txt`、`.xls`、`.xlsx`。`.html`はSharePointでのみ対応する。
- 埋め込みファイルの上限は、`.doc`、`.docx`、`.pdf`、`.ppt`、`.pptx`、`.txt`が512 MB、`.xls`と`.xlsx`が30 MB。
- Excelは一つのワークシートに情報をまとめる方が回答品質を得やすいと案内されている。
- パスワード保護、特定の暗号化、抽出権限のない秘密度ラベルなどは利用できない場合がある。
- 埋め込みファイルの利用にはMicrosoft 365 Copilotライセンスまたは従量課金が必要で、GCC環境では対応しない。

このスキルでは、手動追加Markdownを直接登録せずDOCXへ変換する。DOCX、PPTX、XLSXなどの準備済み資料は、実行時点の公式情報と利用者の実画面で対応を確認してから登録候補にする。

二段階フォルダ変換では、自動生成Knowledge sourceを最低1件確保するため、人力資料を最大19件とする。人力資料数を`M`、1入力1XLSXのJSON workbook数を`J`、残るテキストバンドル枠を`A = 20 - M - J`として、最終登録候補を20件以内に収める。これは本スキルの配分規則であり、Agent Builderが人力資料だけを19件に制限しているという意味ではない。

## ライセンス、権限、管理者設定への依存

- 利用者が閲覧権限を持つ情報だけが検索対象になる。
- Microsoft 365 Copilotライセンスまたは従量課金の有無により、利用できるKnowledge sourcesやCapabilitiesが異なる。
- Teams、メール、SharePointなどの情報源は、ライセンス条件を満たさないと取得に失敗することがある。
- Copilot connectorsは、組織の管理者による有効化と構成に依存する。
- Web検索、共有、公開範囲などは、組織の管理ポリシーで制限されることがある。
- Agent Builderで表示される項目は、地域、言語、ロールアウト状況、ホストアプリによって異なることがある。

したがって「Agent Builderで一般に可能」と「その利用者の環境で利用可能」を分けて扱う。

## 宣言型エージェント方式の限界

Agent Builderで作成するエージェントは、Microsoftが管理するモデルとオーケストレーターを利用する。作成者が制御できるのは、主にInstructions、Knowledge sources、公開されたCapabilitiesなどに限られる。

- モデルやオーケストレーションを自由に選択・実装できない。
- 反復ループや複雑な条件分岐を含む処理を細かく制御できない。
- Groundingと外部処理を何段階にも連鎖させる複雑なワークフローに向かない。
- 多数のレコード、ページングされた結果、大規模データ、文書全体を常に処理する用途に向かない。
- 長時間実行する処理や、複数処理が互いの結果に依存する用途に向かない。
- Microsoft 365外のクライアントや独自のセキュリティ構成を必要とする用途に向かない。
- 利用者からの操作なしに開始するプロアクティブな処理を基本前提にできない。

Microsoftの宣言型エージェント資料には、Grounding 50項目、プラグイン応答25項目、コンテキストと応答を含む4,096トークン、45秒のタイムアウトという技術的目安が記載されている。ただし、これらは宣言型エージェント基盤の制限であり、Agent Builder画面の入力上限とは区別する。

## 生成AIとして保証できないこと

- 同じ質問に常に同じ文章で回答すること。
- 指定形式へ常に完全一致すること。
- Knowledge sourcesに存在する情報を必ず発見すること。
- 誤解、取り違え、根拠のない補完を完全に排除すること。
- 指定情報源以外の一般知識を完全に遮断すること。
- 最新性、完全性、正確性を自動的に保証すること。
- 法務、人事、医療、財務などの最終判断を安全に代替すること。

Instructionsで望ましい動作を指示することと、その動作をシステム的に強制できることを区別する。

## 適合度が低い代表例

- 厳密な承認フローや申請処理
- 基幹システムへの確実な登録、更新、削除
- 複雑な意思決定規則を使う自動判定
- 長期間保持される確実な状態管理
- 完全な監査証跡が必要な自動処理
- 大量データの一括処理や完全な全件検索
- 外部利用者向けの本格的な公開サービス

このような要望は、可能なら「実行」から「案内」「情報整理」「判断材料の提示」「下書き作成」へ変換する。それでも要件を満たさない場合は、Agent Builderの適用外として扱う。

## 公式情報

- [Add knowledge sources in Microsoft 365 Copilot Agent Builder](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-add-knowledge)
- [Knowledge sources for declarative agents](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/knowledge-sources)
- [Declarative agent architecture](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/declarative-agent-architecture)
- [Agents for Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agents-overview)
- [Agent Builder regional availability and language support](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-regional-availability)

この資料は2026-07-19時点で整理した。製品更新やテナント差異があるため、変更されやすい制限値は最新の公式情報と実画面を優先する。
