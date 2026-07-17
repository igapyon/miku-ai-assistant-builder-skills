# miku-md2docx連携

## 位置づけ

`miku-text-bundle --mode knowledge-source`が生成した番号付きMarkdownを、Microsoft 365 Copilot Agent Builderへ登録するDOCXへ変換する。変換には本スキルに同梱した`miku-md2docx`を使用する。

Markdownは中間成果物、DOCXは最終登録候補とする。Markdown-to-Office変換は実験的であり、レイアウト忠実性を前提にしない。Knowledge sourceとして本文、見出し、コード、相対パスを読めることを優先する。

## ランタイム

バックエンド指定がなければ、単一ファイルへ依存をバンドルしたNode.js CLI版`miku-md2docx-0.9.2.mjs`を優先する。Node.jsが利用できない場合はJava版`miku-md2docx-java-0.9.1.jar`を使用する。どちらも外部依存のダウンロードやネットワーク接続を要求しない。

実行前に`--help`と`--version`でCLI契約を確認する。通常変換では入力Markdownと主出力`--out`だけを指定し、summaryなどの追加成果物を勝手に生成しない。

```text
node <skill-root>/runtime/miku-md2docx-0.9.2.mjs \
  work/knowledge-markdown/knowledge-001.md \
  --out upload/knowledge-001.docx
```

Java版を使用する場合も、入力と主出力だけを指定する。

```text
java -jar <skill-root>/runtime/miku-md2docx-java-0.9.1.jar \
  work/knowledge-markdown/knowledge-001.md \
  --out upload/knowledge-001.docx
```

番号付きMarkdownを一対一で変換し、basenameを維持する。

## 出力規則

- 最終DOCXを`upload/`直下へフラットに置く。
- `knowledge-index.md`、`agent-builder-input.md`、`items-to-confirm.md`をDOCX化しない。
- `upload/`にはAgent Builderへ登録するDOCX以外を置かない。
- 同名を避けるため、安定した番号と短いテーマ名を使える。例: `knowledge-003-services.docx`。
- 変換前後の対応をbasenameで追跡できるようにする。

## パスと参照

- `miku-text-bundle`が記録した元リポジトリ基準の相対パスを本文へ保持する。
- `/Users/...`や`C:\Users\...`など、マシン固有の絶対パスを含めない。
- DOCX間の相対リンクが解決されることを前提にしない。
- 関連ファイルはクリック用リンクではなく、検索可能な相対パス文字列で示す。
- 外部WebまたはSharePointを参照する場合は、存在を確認した絶対URLを使う。
- 各DOCXを単独で検索しても、テーマ、元相対パス、ファイル境界が分かるようにする。

## ソースコード

ソースコードを扱う場合は、物理的な`upload/`をフラットにし、論理的なディレクトリ構造をDOCX本文の相対パスで保持する。import、関連ファイル、同名ファイルの識別には相対パスを使う。

リポジトリ全体像が必要なら、目的、主要ディレクトリ、モジュール、エントリーポイント、ビルド・テスト方法を説明するOverview文書を登録候補へ含める。ただし、Overviewを先に読むことや、別DOCXを必ず続けて読むことを指示しない。

## 検証

- 入力Markdownごとに対応するDOCXが一つある。
- DOCXが破損しておらず開ける。
- 見出し、本文、コード、元相対パスが読み取れる。
- ファイル境界が失われていない。
- 絶対パス、秘密情報、不要なローカル情報がない。
- DOCX間の相対リンクへ依存していない。
- `upload/`がDOCXだけのフラット構成になっている。
