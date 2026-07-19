# miku-text-bundleへのKnowledge sourceモード追加依頼（実装済み）

> Status: `miku-text-bundle` v1.5.0で実装済み。これは導入時の要求と受け入れ条件を残す履歴資料であり、新規依頼として送付しない。現在の利用方法は[連携資料](03-miku-text-bundle.md)を参照する。

この文書は、Microsoft 365 Copilot Agent BuilderのKnowledge sourcesへ登録するMarkdown生成モードについて、上流へ提示した要求を記録する。

## 目次

- [背景](#背景)
- [依頼したい変更](#依頼したい変更)
- [knowledge-sourceモードに期待する動作](#knowledge-sourceモードに期待する動作)
- [出力案](#出力案)
- [管理用indexに期待する情報](#管理用indexに期待する情報)
- [互換性](#互換性)
- [受け入れ条件案](#受け入れ条件案)
- [相談したい未決事項](#相談したい未決事項)

## 背景

Microsoft 365 Copilot Agent Builderでは、役割を次のように分けて設計します。

> Instructions：エージェントがどう振る舞うか

> Knowledge sources：何を根拠に回答するか

現行の`miku-text-bundle` v1.3.0は、ローカルのテキスト系ファイルを収集し、生成AIへ順番に受け渡すMarkdown bundleを作れるため、Knowledge source資料の準備とも親和性があります。

一方、現行出力の先頭パートにはText Bundle Promptと読み込み指示が入り、最終パートにはterminal index、警告、スキップ情報などが入ります。これらは生成AIへのhandoffには有用ですが、Agent BuilderのKnowledge sourcesへ登録する事実資料としては、振る舞いの指示と診断情報が混ざることになります。

## 依頼したい変更

既存のhandoff用途を維持したまま、Knowledge source向け成果物を生成するモードを追加してください。

CLI案は次のとおりです。

```text
miku-text-bundle \
  --input <inputDir> \
  --output <outputDir> \
  --mode knowledge-source
```

`--mode`を指定しない場合は、後方互換性のため現行のhandoff動作を維持してください。明示する場合は、次のような値を想定しています。

```text
--mode handoff
--mode knowledge-source
```

## knowledge-sourceモードに期待する動作

- Text Bundle PromptをKnowledge source本文へ挿入しない。
- Agent Skill Handoff指示を挿入しない。
- 「順番に読み込む」「最後まで待つ」などの命令文を挿入しない。
- 元ファイルの本文を要約・言い換え・省略せず保持する。
- 元ファイル名と相対パスを出典情報として保持する。
- 出力ファイルを安定した番号順で決定的に生成する。
- 可能な限り元文書の境界を維持する。
- 上限を超える大きな文書だけを、識別可能なチャンクへ分割する。
- `--max-chars`と`--max-input-file-bytes`を引き続き利用可能にする。
- 警告、スキップ情報、TODO／FIXME／XXXマーカーをKnowledge source本文へ混ぜない。
- 診断情報と索引は、Agent Builderへ登録しない管理用ファイルへ分離する。
- 同じ入力と同じ設定から、同じファイル名と内容を生成する。

## 出力案

```text
output/
├── knowledge-001.md
├── knowledge-002.md
├── knowledge-003.md
└── knowledge-bundle-index.md
```

- `knowledge-001.md`以降をKnowledge sourcesへの登録候補とします。
- `knowledge-bundle-index.md`は管理・診断用とし、登録対象には含めません。
- 出力prefixは、既存の`--filename-prefix`で変更可能にしてください。

## 管理用indexに期待する情報

- 実行時の主要オプション
- 収集した元ファイルの一覧
- 元ファイルと生成ファイル／チャンクの対応
- スキップしたファイルと理由
- 警告
- 生成ファイル一覧

管理用indexには処理系向けの命令を入れず、中立的なメタデータと診断情報だけを記録してください。

## 互換性

- 現行のhandoff出力と既定動作を変更しない。
- `--mode knowledge-source`を指定した場合だけ新しい出力規則を適用する。
- Node.js版とJava版で、オプション名、主要動作、出力構造をそろえる。
- 両実装の`--help`へ同じ説明を追加する。
- `--dry-run`でもknowledge-sourceモードの予定ファイル数と診断を確認できるようにする。

## 受け入れ条件案

1. `--mode`未指定時に、v1.3.0互換のhandoff成果物が生成される。
2. `--mode knowledge-source`時に、生成Markdown本文へ読み込み指示が入らない。
3. 元ファイル名、相対パス、分割位置を追跡できる。
4. 警告とスキップ情報が管理用indexに記録され、登録対象本文へ混ざらない。
5. 同じ入力と設定で再実行した場合、決定的な成果物が得られる。
6. Node.js版とJava版の代表的なfixtureで同等の成果物が得られる。
7. `--help`、README、テストに新モードの説明と例が追加される。

## 相談したい未決事項

次の事項は、上流側の既存設計と実装上の都合も踏まえて相談したいです。

- `--mode`というオプション名と`knowledge-source`という値が適切か。
- モード専用の既定`--max-chars`を設けるか。
- 文書境界と最大文字数のどちらを優先するか。
- Front matterを付けるか。付ける場合、どのメタデータを含めるか。
- 管理用indexを常に生成するか、オプションで無効化できるようにするか。
- 出力先に残る旧生成物をどのように検出・整理するか。
- 将来、Microsoft 365以外のKnowledge source用途にも使える汎用名称にするか。

まずは、現行のhandoff用途を壊さず、Knowledge source本文から命令文と診断情報を分離できることを最優先にしたいです。
