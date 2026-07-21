# miku-text-bundle連携

## 位置づけ

雑多な入力フォルダからKnowledge sourcesの中間Markdownを生成するときは、本スキルに同梱した`miku-text-bundle`を使用する。上流`miku-text-bundle` v1.5.0以降の`knowledge-source`モードを前提にする。

`miku-text-bundle`はテキスト系ファイルの収集、決定的な分割、出典追跡、診断を担当する。本スキルはAgent Builderへの適合性判断、安全上・技術上必要な除外、Instructions作成、登録候補の確認、配備用フォルダの構成を担当する。入力元にあるbundle対応テキストを内容の関連性、旧版、重複の推定だけで選別せず、原則すべて収集対象にする。

## 必須条件

- Node.js版v1.6.0を既定とし、利用者がJavaバックエンドを明示した場合はJava版v1.6.0を使用する。本スキル全体にはNode.js 22以降が必要である。
- 実行前にランタイムの`--help`または`--version`を確認する。
- `--mode knowledge-source`が利用できるv1.5.0以降を使用する。
- 同梱ランタイムが未対応なら、handoffモードで代用せず更新が必要と報告する。
- 入力ディレクトリ、出力ディレクトリ、文字コード、除外、サイズ上限を確認する。
- `.env`と`.env.*`は必ず除外し、dry-runと本実行の収集対象に入れない。

## 標準実行

二段階フォルダ変換では、第1段階で実行しない。人間の追加資料が確定した第2段階で、[Agent Builderのファイル枠配分](06-upload-file-budget.md)に従って手動資料数から自動生成枠と`maxChars`を求める。

最初にdry-runで収集件数、スキップ件数、無視件数、推定Part数を確認する。`<calculatedMaxChars>`には、`max(120000, ceil(C / T))`で求め、必要に応じてdry-runで増加調整した値を指定する。

```text
node <skill-root>/runtime/miku-text-bundle-1.6.0.mjs \
  --input <inputDir> \
  --output <outputDir> \
  --mode knowledge-source \
  --max-chars <calculatedMaxChars> \
  --max-input-file-bytes 200000000 \
  --dry-run
```

Javaバックエンドが明示された場合は、Java版を同じオプションで実行する。

```text
java -jar <skill-root>/runtime/miku-text-bundle-java-1.6.0.jar \
  --input <inputDir> \
  --output <outputDir> \
  --mode knowledge-source \
  --max-chars <calculatedMaxChars> \
  --max-input-file-bytes 200000000 \
  --dry-run
```

問題がなければ`--dry-run`を外して実行する。必要に応じて次を指定する。

- `--filename-prefix <prefix>`
- `--max-chars <number>`
- `--max-input-file-bytes <number>`
- `--encoding utf-8|shift_jis`
- `--encoding-extension ".ext=shift_jis"`
- `--add-exclude-extension ".ext"`
- `--add-exclude-directory "dir"`
- `--verbose`

`--max-input-file-bytes 200000000`は単一入力ファイルの運用上限を200 MBにする指定である。`--max-chars`はファイルサイズ上限から固定換算せず、20件の登録枠、人力資料数、自動入力数、合計文字数から実行ごとに求める。120,000文字は同梱ランタイムの既定値に基づく運用上の下限であり、Microsoftの制限値ではない。

生成Markdownには見出しや出典情報も付加されるため、dry-run推定数と本実行の番号付きMarkdown数を確認する。本実行結果が自動生成枠を超えた場合は最終化せず、`--max-chars`を増やして再生成する。Agent Builder側の制限が変更された場合は、ファイル枠配分を最新仕様に合わせて見直す。

## 成果物の役割

デフォルトprefixでは次が生成される。

```text
knowledge-001.md
knowledge-002.md
knowledge-index.md
```

- `knowledge-NNN.md`: DOCX変換へ渡す中間成果物。元相対パス、必要に応じたチャンク番号、元行範囲、元本文を含む。
- `knowledge-index.md`: 管理用。実行設定、生成ファイル、元ファイル対応、スキップ理由、警告、`TODO` / `FIXME` / `XXX` marker、旧生成物候補を含む。

番号付きMarkdownだけを`miku-md2docx`へ渡す。管理用indexはDOCX化せず、Agent Builderへ登録しない。最終登録候補は変換後の番号付きDOCXとする。

## 非テキスト資料

`miku-text-bundle`は`.docx`、`.xlsx`、`.pptx`、`.pdf`、画像などを既定で除外する。これらを自動でテキスト化したり、拡張子除外を解除して無理に読み込ませたりしない。Knowledge sourceとして必要なら、人が準備する資料として`manual-input/`への配置候補を示す。

## 実行後の確認

- 番号付きMarkdownの件数と実サイズ
- indexに記録された収集、スキップ、警告、ignoredの概要
- 元ファイルと生成チャンクの対応
- 古い生成物候補の残存
- 機密情報、個人情報、秘密情報の混入
- 旧版、重複、矛盾する資料の混在
- DOCXへ変換する番号付きMarkdownと管理用indexの分離
- 元相対パスとファイル境界の保持

## 上流仕様

- [miku-text-bundle v1.6.0](https://github.com/igapyon/miku-text-bundle/releases/tag/v1.6.0)
- [v1.5.0 release notes](https://github.com/igapyon/miku-text-bundle/blob/v1.6.0/docs/release-notes-v1.5.0.md)
- [README](https://github.com/igapyon/miku-text-bundle/blob/v1.6.0/README.md)

この資料は2026-07-18時点の上流v1.6.0を基準にする。実行時は同梱ランタイムの`--help`をCLI契約として優先する。
