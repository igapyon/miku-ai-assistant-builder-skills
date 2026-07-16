# miku-text-bundle連携案

## 現行版の位置づけ

`miku-text-bundle` v1.3.0は、ディレクトリ内のテキスト系ファイルを収集し、生成AIへの受け渡し用Markdownへ分割する。パス順の収集、最大文字数による分割、スキップ診断、索引生成に対応する。

現行のhandoff出力には、次の付加情報が含まれる。

- 先頭パート：Text Bundle Promptと読み込み指示
- 最終パート：terminal index、警告、スキップ情報

これらは生成AIとの会話へ順番に渡す用途には適するが、Agent BuilderのKnowledge sourcesへ直接登録する事実資料としては、命令文と診断情報が混ざる。

## 目標

上流製品へKnowledge source生成モードを追加し、後処理で現行出力を改変せず、目的に合った成果物を正式に生成できるようにする。

CLIの基本案を次とする。

```text
miku-text-bundle --input <dir> --output <dir> --mode knowledge-source
```

`--mode`を指定しない場合は、既存互換のため現在のhandoff動作を維持する。

## モードの責務

```text
handoff
  生成AIとの会話へ順番に投入する
  Promptとterminal indexをbundleへ含める

knowledge-source
  検索とGroundingに使う事実資料を生成する
  命令文を含めず、出典と文書構造を保持する
```

## Knowledge sourceモードの要求候補

- Text Bundle Promptを出力本文へ挿入しない。
- Agent Skill Handoff指示を挿入しない。
- 読み込み順や応答待機を命じる文章を挿入しない。
- 元ファイルの内容を要約・改変せず保持する。
- 元ファイル名と相対パスを出典情報として保持する。
- 出力ファイルを番号順で決定的に生成する。
- 文書境界を可能な限り維持する。
- 大きな文書だけを設定値に従って分割する。
- 分割部分へ元ファイルとチャンクを識別できる情報を付ける。
- 警告、スキップ情報、TODOマーカーをKnowledge source本文へ混ぜない。
- 診断情報と索引を、登録対象外の管理用ファイルへ分離する。
- 最大文字数と単一入力ファイル上限を設定可能にする。
- 同じ入力と設定から同じ出力を生成する。

## 出力案

```text
output/
├── knowledge-001.md
├── knowledge-002.md
├── knowledge-003.md
└── knowledge-bundle-index.md
```

`knowledge-001.md`からの番号付きファイルをAgent Builderへの登録候補とする。`knowledge-bundle-index.md`は人間と処理系のための管理用ファイルとし、原則としてKnowledge sourcesへ登録しない。

## 上流依頼前に決めること

- モード名とCLIオプション名
- 対応する入力形式と出力形式
- Agent Builder向けの推奨分割サイズ
- 一つの元文書を複数出力へ分ける規則
- 文書境界を優先する場合の上限超過処理
- Front matterの有無とメタデータ項目
- 元ファイル名とパスの表現
- 管理用indexの形式
- 古い生成物の更新・削除方針
- Node.js版とJava版の互換要件

これらを確定してから、上流の`miku-text-bundle`へ変更要求として渡す。
