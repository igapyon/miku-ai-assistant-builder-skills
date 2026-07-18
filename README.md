# miku-m365-agent-builder-skills

`miku-m365-agent-builder-skills` は、Microsoft 365 Copilot の Agent Builder に投入するデータを準備する `igapyon-miku-m365-agent-builder` Agent Skill を提供します。

Copilot Studio 固有のエージェント構築ではなく、Microsoft 365 Copilot 内の軽量な Agent Builder を対象とします。

## Repository shape

スキルの正本は次のディレクトリです。

- `skills/igapyon-miku-m365-agent-builder/`

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

- `bundle/miku-m365-agent-builder-skills/`
- `bundle/igapyon-miku-m365-agent-builder-skills-<version>.zip`
- `bundle/igapyon-miku-m365-agent-builder-skills-<version>.zip.sha256`

ZIP は Agent home 直下へ展開する形式で、内部のスキルは `skills/igapyon-miku-m365-agent-builder/` に配置されます。

## Agent Builderへの配備データの役割

Agent Builderを動作させるための「起動用DOCX」は不要です。エージェントの目的、振る舞い、処理手順、禁止事項、回答形式は、`agent-builder-input.md`からConfigure画面のInstructionsなどの対応する入力欄へ転記します。利用者の質問が実際の動作のきっかけとなり、Starter promptsは会話を始めるための入力例です。

Knowledge sourceとして登録するDOCXは、エージェントを起動したり振る舞いを定義したりするものではなく、回答時に検索・参照する事実資料です。

- `agent-builder-input.md`: Configure画面への転記用。DOCX化せず、Knowledge sourceへ登録しません。
- `items-to-confirm.md`: 配備前に人が判断する確認事項。DOCX化せず、Knowledge sourceへ登録しません。
- `upload/knowledge-NNN.docx`: 回答根拠となる事実資料。Knowledge sourceへの登録候補です。

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
- `skills/igapyon-miku-m365-agent-builder/index.json` は miku-indexgen の生成物です。スキル内容を変更したら再生成し、手編集しません。
