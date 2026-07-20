# miku-ai-assistant-builder-skills

`miku-ai-assistant-builder-skills` は、Microsoft 365 Copilot の Agent Builder に投入するデータを準備する `igapyon-miku-ai-assistant-builder` Agent Skill を提供します。

> **Beta:** 本スキル全体はベータ版です。対応サービスの仕様差や利用環境ごとの制約、フォルダ変換ワークフローを継続して検証・調整しているため、今後の更新で仕様や出力が変更される可能性があります。

Copilot Studio 固有のエージェント構築ではなく、Microsoft 365 Copilot 内の軽量な Agent Builder を主対象とします。Google Gemini の Gem には早期アクセス機能として軽量対応します。

生成する配備データは、人が対象サービスへ設定するためのものです。このスキルはファイルのアップロード、共有設定、外部Webや公開リポジトリへの公開を行いません。Agent Builderでは端末からのファイル添付を利用できるライセンスまたは従量課金環境が前提です。Gem早期アクセスではKnowledgeへのファイル追加を利用できるアカウントと管理者設定が前提です。

Gem早期アクセスは、Agent Builder向けワークフローの成果物をGemでもおおむね利用できるようにする付加機能です。Agent Builderと同等の機能、検証範囲、動作保証は提供しません。

## Knowledge利用上の注意

本スキルが`miku-text-bundle`対応テキストを原則すべて自動処理対象にすることは、配備用Knowledgeファイルを準備する際の入力範囲を示します。配備後のAIアシスタントが、登録済みKnowledge内の全情報を常に検索・取得・参照できることや、回答へ必ず利用することを保証するものではありません。

ファイルの登録成功やKnowledge一覧への表示だけでは、個々の情報があらゆる質問で取得されるとは限りません。利用者の権限、ライセンス、管理者設定に加え、質問との関連性判定、検索、オーケストレーション、コンテキスト上限などの影響を受けます。

配備後は代表的な質問で回答を確認します。重要な情報が取得されない場合は、資料の構成や分割、質問表現、Instructionsを見直します。

## Repository shape

スキルの正本は次のディレクトリです。

- `skills/igapyon-miku-ai-assistant-builder/`

このスキルは、Knowledge source生成用の`miku-text-bundle`とDOCX生成用の
`miku-md2docx`について、Node.js版とJava版のCLIランタイムを同梱する
CLI-backed型です。

同梱ランタイムは次のとおりです。

- `miku-text-bundle` Node.js v1.6.0 / Java v1.6.0
- `miku-md2docx` Node.js v1.0.1 / Java v1.0.1

## Build

ローカルビルドには Node.js 24、Java 17以降、`zip` / `unzip` コマンドが必要です。

```bash
npm test
npm run build
npm run verify:reproducible
```

ビルドにより次の成果物を生成します。

- `bundle/miku-ai-assistant-builder-skills/`
- `bundle/igapyon-miku-ai-assistant-builder-skills-<version>.zip`
- `bundle/igapyon-miku-ai-assistant-builder-skills-<version>.zip.sha256`

ZIP は Agent home 直下へ展開する形式で、内部のスキルは `skills/igapyon-miku-ai-assistant-builder/` に配置されます。

## 二段階のフォルダ変換

既存フォルダの変換は、人間が追加資料を準備できるよう二段階で行います。

新規変換の開始時には、それ以前の会話で明示されていない限り、配備先がMicrosoft 365 Copilot Agent BuilderかGoogle Gemini Gem Classicか、入力元となる正確なフォルダと自動処理対象範囲はどこかを人に確認します。確認できるまで、入力フォルダの棚卸しや対象ファイルの選定、出力フォルダの作成を開始しません。人が質問に対して「特に指定なし」「おまかせ」と明示した項目だけは、その回答後に初めて、作業目的に合う狭い範囲の想定で補完します。

1. 主対象のAgent Builder、または早期アクセスのGemを選び、Gemの場合はMarkdownのまま使うかDOCX化するかを選ぶ。
2. 対象フォルダを棚卸しし、`miku-text-bundle`が扱えるテキスト系ファイルを原則すべて自動処理対象として確定して、`manual-input/`への追加資料の準備待ちで停止する。
3. スキルを再度起動し、対象サービスで利用可能なファイル枠に収まるよう、`miku-text-bundle --mode knowledge-source`の自動バンドル数を調整する。
4. 選択した形式で最終`upload/`を構成し、Agent Builderでは`agent-builder-input.md`、Gemでは`gem-input.md`を生成する。

`work/preparation-status.md`が別セッションからの再開状態を保持します。`manual-input/`の人間管理原本は変更しません。

手動追加資料の準備を依頼するときは、作成済み`manual-input/`の解決済みフルパスと出力先基準の相対パスを利用者へ示します。フルパスは人向けのローカル作業案内だけに使い、Knowledgeファイルには含めません。

Agent Builderでは人力資料を最大19件とし、自動生成Knowledge sourceを最低1件確保します。Gemでは固定値を流用せず、利用者の実画面で確認できる上限を使います。自動入力ファイルが残り枠より少ない場合は、空き枠を埋めるための不要な分割を行いません。

## 対応先とMarkdownの扱い

- Agent Builder: 自動生成Markdownと手動MarkdownをDOCX化し、`upload/`へ置きます。
- Gem早期アクセスのMarkdown選択: 自動生成Markdownと手動MarkdownをMarkdownのまま`upload/`へ置きます。
- Gem早期アクセスのDOCX選択: Agent Builderと同様に`miku-md2docx`でDOCX化します。

`work/knowledge-markdown/`は自動生成されたKnowledge資料の中間置き場です。`work/knowledge-index.md`と`work/preparation-status.md`は管理用であり、添付しません。`agent-builder-input.md`と`gem-input.md`は設定画面への転記用、`items-to-confirm.md`は人の確認用であり、いずれもKnowledgeファイルとして添付しません。

## Agent Builderへの配備データの役割

Agent Builderを動作させるための「起動用DOCX」は不要です。エージェントの目的、振る舞い、処理手順、禁止事項、回答形式は、`agent-builder-input.md`からConfigure画面のInstructionsなどの対応する入力欄へ転記します。利用者の質問が実際の動作のきっかけとなり、Starter promptsは会話を始めるための入力例です。

Knowledge sourceとして登録するDOCXは、エージェントを起動したり振る舞いを定義したりするものではなく、回答時に検索・参照する事実資料です。

- `agent-builder-input.md`: Configure画面への転記用。DOCX化せず、Knowledge sourceへ登録しません。
- `items-to-confirm.md`: 配備前に人が判断する確認事項。DOCX化せず、Knowledge sourceへ登録しません。
- `manual-input/`: 人間が追加するMarkdown、DOCX、PPTX、XLSXなどの原本。配備先ではありません。
- `upload/`: 自動生成DOCX、手動Markdownから変換したDOCX、検証済みの準備済みOffice文書。Knowledge sourceへの最終登録候補です。

`agent-builder-input.md`のKnowledge sources欄には、Agent Builder上で見えるフラットな登録名だけを記載します。ローカル配備フォルダの`upload/`は運搬・作業用であり、Agent Builderへ登録した後の参照名には含まれません。

```text
正: knowledge-001.docx
誤: upload/knowledge-001.docx
```

InstructionsをKnowledge sourceへ移しても、作成者による信頼された指示として扱われる保証はありません。動作に必要な指示はConfigure画面のInstructions欄へ設定します。

## GitHub Actions

- pull request と push では CI がテスト、ビルド、再現性を検証します。
- `v<package.json version>` タグでは検証済み ZIP と SHA-256 を draft release に添付します。
- release の公開操作は人が行います。

## Repository operation rules

- `workplace/` は参照用 checkout や検証成果物のローカル作業領域です。`workplace/.gitkeep` だけを追跡します。
- `bundle/`、`release-assets/`、`node_modules/`、ログ、ローカルの `.codex/skills/` は Git 管理外です。
- `skills/igapyon-miku-ai-assistant-builder/index.json` は miku-indexgen の生成物です。スキル内容を変更したら再生成し、手編集しません。
