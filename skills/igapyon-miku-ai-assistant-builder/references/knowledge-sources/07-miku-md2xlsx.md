# miku-md2xlsx連携

> **Status: Experimental**

Excelブック出力はExperimentalである。1つのUTF-8 Markdownテキストを、見出し単位の複数ワークシートを持つXLSXへ変換する。XLSXの生成処理を独自実装せず、本スキルに同梱した`miku-md2xlsx`を使用する。

## 入力規約

- 1つのMarkdownファイルを入力する。
- `#`は文書全体の題名に使い、各ワークシートの開始位置を`##`で記述する。
- ソースコードは各`##`節のコードブロックへ格納する。
- Excelのシート名制約により名前が調整され得るため、生成後に実際のシート名と順序を確認する。

## Node.js版

バックエンド指定がなければNode.js版を使用する。

```bash
node <skill-root>/runtime/miku-md2xlsx-0.9.5.mjs input.md \
  --out output.xlsx \
  --sheet-mode heading \
  --sheet-heading-depth 2
```

## Java版

Javaバックエンドが明示された場合はJava版を使用する。

```bash
java -jar <skill-root>/runtime/miku-md2xlsx-java-0.9.5.jar input.md \
  --out output.xlsx \
  --sheet-mode heading \
  --sheet-heading-depth 2
```

両版とも外部依存のダウンロードやネットワーク接続を要求しない。変換後は、XLSXが開けること、期待した`##`ごとにシートが1つ生成されたこと、シート名、順序、コードや表の内容を確認する。

この経路は現在、1入力から複数シートを生成できることを検証するExperimental対応である。既定の二段階変換や`work/run-conversion.mjs`の出力形式を自動的にXLSXへ変更しない。
