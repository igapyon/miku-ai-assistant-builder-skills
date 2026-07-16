# miku-m365-agent-builder-skills

`miku-m365-agent-builder-skills` は、Microsoft 365 Copilot の Agent Builder に投入するデータを準備する `igapyon-miku-m365-agent-builder` Agent Skill を提供します。

Copilot Studio 固有のエージェント構築ではなく、Microsoft 365 Copilot 内の軽量な Agent Builder を対象とします。

## Repository shape

スキルの正本は次のディレクトリです。

- `skills/igapyon-miku-m365-agent-builder/`

このスキルは CLI ランタイムを持たない content-only 型です。

## Build

ローカルビルドには Node.js 24 と `zip` / `unzip` コマンドが必要です。

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

## GitHub Actions

- pull request と push では CI がテスト、ビルド、再現性を検証します。
- `v<package.json version>` タグでは検証済み ZIP と SHA-256 を draft release に添付します。
- release の公開操作は人が行います。

## Repository operation rules

- `workplace/` は参照用 checkout や検証成果物のローカル作業領域です。`workplace/.gitkeep` だけを追跡します。
- `bundle/`、`release-assets/`、`node_modules/`、ログ、ローカルの `.codex/skills/` は Git 管理外です。
- `skills/igapyon-miku-m365-agent-builder/index.json` は miku-indexgen の生成物です。スキル内容を変更したら再生成し、手編集しません。
