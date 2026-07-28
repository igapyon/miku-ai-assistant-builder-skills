# miku-ai-assistant-builder-skills

`miku-ai-assistant-builder-skills` は、Microsoft 365 Copilot の Agent Builder に投入するデータを準備する `igapyon-miku-ai-assistant-builder` Agent Skill を提供します。

> **Beta:** 本スキル全体はベータ版です。対応サービスの仕様差や利用環境ごとの制約、フォルダ変換ワークフローを継続して検証・調整しているため、今後の更新で仕様や出力が変更される可能性があります。

Copilot Studio 固有のエージェント構築ではなく、Microsoft 365 Copilot 内の軽量な Agent Builder を主対象とします。Google Gemini の Gem にも対応します。

生成する配備データは、人が対象サービスへ設定するためのものです。このスキルはファイルのアップロード、共有設定、外部Webや公開リポジトリへの公開を行いません。Agent Builderでは端末からのファイル添付を利用できるライセンスまたは従量課金環境が前提です。GemではKnowledgeへのファイル追加を利用できるアカウントと管理者設定が前提です。

Agent BuilderとGemでは機能、上限、検証条件が異なります。各サービスの最新仕様と利用者の実画面を確認し、同一仕様を前提にしません。

## 実行要件

`igapyon-miku-ai-assistant-builder`スキルの実行には、Node.js 22以降が必須です。これはリポジトリのビルド時だけの要件ではありません。日時付き実行ディレクトリの作成と既定の変換バックエンドでNode.jsを使用するため、スキルを利用する環境にもNode.js 22以降が必要です。

同梱CLIの変換バックエンドとしてJava版を明示的に選択する場合も、スキル全体の実行にはNode.js 22以降が必要です。Java版バックエンドには、これに加えてJava 17以降が必要です。

## Knowledge利用上の注意

本スキルがJSON / JSONLを1入力1XLSX候補とし、それ以外の`miku-text-bundle`対応テキストを原則すべて自動処理対象にすることは、配備用Knowledgeファイルを準備する際の入力範囲を示します。配備後のAIアシスタントが、登録済みKnowledge内の全情報を常に検索・取得・参照できることや、回答へ必ず利用することを保証するものではありません。

ファイルの登録成功やKnowledge一覧への表示だけでは、個々の情報があらゆる質問で取得されるとは限りません。利用者の権限、ライセンス、管理者設定に加え、質問との関連性判定、検索、オーケストレーション、コンテキスト上限などの影響を受けます。

配備後は代表的な質問で回答を確認します。重要な情報が取得されない場合は、資料の構成や分割、質問表現、Instructionsを見直します。

## Repository shape

スキルの正本は次のディレクトリです。

- `skills/igapyon-miku-ai-assistant-builder/`

このスキルは、Knowledge source生成用の`miku-text-bundle`、DOCX生成用の
`miku-md2docx`、JSON / JSONLからXLSXを生成する`miku-json2xlsx`、Markdownから
複数シートXLSXを生成する`miku-md2xlsx`のCLIランタイムを同梱するCLI-backed型です。

同梱ランタイムは次のとおりです。

- `miku-text-bundle` Node.js v1.6.0 / Java v1.6.0
- `miku-md2docx` Node.js v1.1.0 / Java v1.1.0
- `miku-json2xlsx` Node.js v0.5.0（**Beta**）
- `miku-md2xlsx` Node.js v0.10.0 / Java v0.10.0（Excelブック出力: **Experimental**）

`miku-json2xlsx`は、承認済みの明示mappingを固定し、1つのJSONまたはJSONL入力から1つのXLSXを生成する経路として二段階変換へ組み込みます。上流v0.5.0は決定的な自動mappingとXLSX内部エントリのDeflate圧縮を提供しますが、本スキルはmappingを人がレビューする安全境界を維持し、自動mappingを無レビューの変換契約として採用しません。`miku-md2xlsx`によるMarkdownからのExcelブック出力は**Experimental**であり、既定の二段階変換には組み込まれていません。

## Build

ローカルビルドには、上記のNode.js 22以降に加えてJava 17以降と`zip` / `unzip`コマンドが必要です。CIではNode.js 22と24の両方を検証し、Release成果物はNode.js 24で生成します。

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

1. 主対象のAgent Builder、またはGemを選び、Gemの場合はMarkdownのまま使うかDOCX化するかを選ぶ。
2. 対象フォルダを棚卸しし、JSON / JSONLは1入力1XLSXの候補、それ以外の`miku-text-bundle`対応テキストはバンドル候補として確定して、`manual-input/`への追加資料の準備待ちで停止する。
3. スキルを再度起動し、JSON / JSONLを`inspect`してmapping案を人がレビューし、対象サービスのファイル枠からJSON workbook数と手動資料数を差し引いた残りへ`miku-text-bundle --mode knowledge-source`の自動バンドル数を収める。
4. 確定した入力パス、mappingとSHA-256、手動資料、生成数、形式、basenameから、その実行専用の`work/conversion-plan.json`と`work/run-conversion.mjs`を作る。
5. 初回からNode.jsランナーを実行し、各JSON / JSONLから1つのXLSXを生成して、他の自動資料と手動資料を合わせた最終`upload/`を構成する。Agent Builderでは`agent-builder-input.md`、Gemでは`gem-input.md`を生成する。

Agent Builder向けの`agent-builder-input.md`を生成するときは、Nameが30文字以内であることを検証します。30文字を超える場合は完成扱いにせず、名前を無断で切り詰めず、利用者へ短縮を依頼します。Gemにはこの固定上限を流用せず、利用者の実画面で確認した制限に従います。

出力先の明示指定がなければ、新規変換ごとに次の日時付きディレクトリを作ります。

```text
workplace/miku-ai-assistant-builder/YYYYMMDD-HHmm/
```

同じ分に既存ディレクトリがある場合は`-02`、`-03`を付け、上書きしません。第2段階では新しい日時ディレクトリを作らず、第1段階の`work/preparation-status.md`がある同じディレクトリを再利用します。利用者が`temp1/`など別の基準ディレクトリを指定した場合も、その下に同じ`miku-ai-assistant-builder/<実行ID>/`構造を作ります。

日時付き実行IDは、ディレクトリ作成直前に同梱`create-run-directory.mjs`がOSのローカル時計から生成します。AIが会話中の時刻を推測したりUTCへ暗黙変換したりせず、スクリプトが返した`runId`と作成済みディレクトリをそのまま使います。

`work/preparation-status.md`が同じ実行の第2段階を別セッションから再開する状態を保持します。`work/execution-record.md`には今回の指定内容、実行条件、入力と出力の実績、検証結果を残します。

前回と同じ条件で新たに作り直す場合は、前回の`work/execution-record.md`を参考にします。前回値を復唱して人が確認した後、入力内容と製品上限を再検証し、新しい日時付き実行ディレクトリを作って第1段階から始めます。前回の作業フォルダや`manual-input/`、`upload/`は再利用・自動コピーしません。

一方、入力ファイルと手動資料の相対パス、個数、最終basename、形式を固定したまま内容だけを更新する場合は、同じ実行ディレクトリで次を実行できます。

```bash
node work/run-conversion.mjs
```

ランナーは初回の第二段階でも使用したものです。原本と`manual-input/`の内容変更は許可しますが、JSON mapping、ファイル構成、出力basename、自動生成数が変わった場合は既存の正常な`upload/`を変更せず停止します。mappingや構成を変える場合は新しい日時付き実行ディレクトリで第1段階から実行します。内容更新後の正確性、機密性、権限、対象サービスの最新仕様、配備後の検索品質は、人またはAI Agentが改めて確認します。

手動追加資料の準備を依頼するときは、作成済み`manual-input/`の解決済みフルパスと出力先基準の相対パスを利用者へ示します。フルパスは人向けのローカル作業案内だけに使い、Knowledgeファイルには含めません。

Agent Builderでは人力資料を最大19件とし、自動生成Knowledge sourceを最低1件確保します。Gemでは固定値を流用せず、利用者の実画面で確認できる上限を使います。自動入力ファイルが残り枠より少ない場合は、空き枠を埋めるための不要な分割を行いません。

## 対応先とMarkdownの扱い

- Agent Builder: 自動生成Markdownと手動MarkdownをDOCX化し、`upload/`へ置きます。
- GemのMarkdown選択: 自動生成Markdownと手動MarkdownをMarkdownのまま`upload/`へ置きます。
- GemのDOCX選択: Agent Builderと同様に`miku-md2docx`でDOCX化します。

`work/knowledge-markdown/`は自動生成されたKnowledge資料の中間置き場です。`work/knowledge-index.md`と`work/preparation-status.md`は管理用であり、添付しません。`agent-builder-input.md`と`gem-input.md`は設定画面への転記用、`items-to-confirm.md`は人の確認用であり、いずれもKnowledgeファイルとして添付しません。

`gem-input.md`は、Agent Builder向けと同じ中心情報をName、Description、Custom instructions、Knowledge、Items to confirmの順で整理します。Custom instructionsはGem画面のInstructions欄へ転記する内容です。Agent Builder固有のStarter promptsとCapabilitiesだけはGemへ自動的に追加しません。

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
