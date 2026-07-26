# 確定済み構成の再実行可能な変換ジョブ

## 目的

二段階変換の第2段階で確定した入力範囲、JSON / JSONLと承認済みmappingの対応、手動資料のファイル構成、自動生成数、最終basename、変換形式を機械可読な計画へ固定する。初回の最終化から同じNode.jsランナーを使い、後日、ファイル構成とmappingを変えずに原本と手動資料の内容だけを更新して`upload/`を再生成できるようにする。

これは、過去の条件を参考に新しい日時付き実行ディレクトリを作る「反復実行」とは別の操作である。

- 反復実行: 配備設計、入力範囲、ファイル名、個数、形式を再判断できる。新しい実行ディレクトリで第1段階から始める。
- 確定済み変換ジョブの再実行: 同じ実行ディレクトリ、同じ入力パス集合、同じ手動資料構成、同じ出力basename集合を維持し、内容だけを更新する。

## 第2段階での作成

AI Agentは、手動資料の検証、ファイル枠配分、`maxChars`、出力basenameの衝突確認を終えたあと、CLIを個別に直接実行する代わりに次を行う。

1. `work/conversion-plan.json`へ、その実行専用の計画をUTF-8 JSONで作る。JSON / JSONLがある場合は、レビュー済みmappingを`work/json2xlsx-mappings/`へ保存してSHA-256を計画に固定する。
2. 同梱ヘルパーへ同じ計画ファイルを渡し、計画を正規化して`work/run-conversion.mjs`を生成する。
3. 生成した`work/run-conversion.mjs`を実行する。初回変換も将来の内容更新も同じランナーを通す。
4. ランナー成功後、AI Agentが従来どおり内容、機密性、リンク、矛盾、入力用Markdownとの双方向参照を確認し、状態ファイルと実行記録を`finalized`へ更新する。

```text
node <skill-directory>/scripts/create-conversion-job.mjs \
  --run-directory <run-directory> \
  --plan <run-directory>/work/conversion-plan.json

node <run-directory>/work/run-conversion.mjs
```

ヘルパーが返した`planPath`と`runnerPath`を記録する。ヘルパーまたはランナーが失敗した場合は、代替コマンドを推測して変換を続けない。

## conversion-plan.json

計画には少なくとも次を記録する。

```json
{
  "targetPlatform": "agent-builder",
  "knowledgeFormat": "docx",
  "totalFileLimit": 20,
  "sourceDirectory": "/absolute/path/to/source",
  "automaticInputPaths": [
    "README.md",
    "src/example.js"
  ],
  "automaticOutputCount": 2,
  "jsonWorkbookInputs": [
    {
      "relativePath": "data/events.jsonl",
      "mappingPath": "json2xlsx-mappings/data-events.mapping.json",
      "mappingSha256": "<64-character-sha256>",
      "outputBasename": "events.xlsx"
    }
  ],
  "manualInputs": [
    {
      "relativePath": "additional-guide.md",
      "kind": "markdown",
      "outputBasename": "additional-guide.docx"
    },
    {
      "relativePath": "official-document.docx",
      "kind": "copy",
      "outputBasename": "official-document.docx"
    }
  ],
  "textBundle": {
    "backend": "node",
    "filenamePrefix": "knowledge",
    "maxChars": 120000,
    "maxInputFileBytes": 200000000,
    "encoding": "utf-8",
    "encodingExtensions": [],
    "addExcludeExtensions": [".json", ".jsonl"],
    "addExcludeDirectories": []
  },
  "md2docx": {
    "backend": "node"
  },
  "json2xlsx": {
    "backend": "node"
  }
}
```

- `sourceDirectory`は第1段階で確認した入力元の解決済み絶対パスにする。
- `automaticInputPaths`は入力元基準の相対パスで、初回本実行の管理用indexに現れるSource Mappingと完全一致させる。
- `automaticOutputCount`は`miku-text-bundle`が初回に生成した番号付きMarkdown数である。再実行時に内容量が変わって生成数が変化した場合は停止する。テキスト入力がなくJSON workbookだけの場合は`automaticInputPaths: []`、`automaticOutputCount: 0`にする。
- `jsonWorkbookInputs`は1つのJSON / JSONL入力と1つのXLSX出力を対応させる。`relativePath`は入力元基準、`mappingPath`は`work/`基準、`outputBasename`はフラットな最終名である。
- `mappingSha256`は人がレビューし`validate-mapping`で検証したmapping内容を固定する。mappingの変更は内容だけの更新ではなく、新規変換として扱う。
- `jsonWorkbookInputs`がある場合、`textBundle.addExcludeExtensions`へ`.json`と`.jsonl`を含める。同じ入力を両方のランタイムへ渡さない。
- `manualInputs`は`manual-input/`基準の相対パス、処理種別、固定の最終basenameを列挙する。
- Markdownの`outputBasename`は選択形式に従い`.md`または`.docx`にする。準備済み文書は`kind: copy`でbasenameを維持する。
- Javaバックエンドを利用者が明示した場合だけ`backend: java`を指定する。
- `schemaVersion`と`skillDirectory`は同梱ヘルパーが追加・正規化する。`skillDirectory`はローカルの同梱ランタイムを解決する管理情報であり、Knowledgeファイルへ複製しない。

## ランナーの処理契約

`work/run-conversion.mjs`は次を順に行う。

1. Node.jsまたは明示済みJavaランタイムの`--version`と`--help`を確認する。
2. `manual-input/`、自動テキスト入力、JSON / JSONL入力の現在の相対パス集合が計画と完全一致することを確認する。
3. JSON mappingが`work/`内にあり、SHA-256が計画と一致することを確認する。
4. 最終basenameの大文字小文字を区別しない衝突と、総ファイル上限を確認する。
5. JSON / JSONLごとに`validate-mapping --result-format json`を実行し、一時ディレクトリで1入力1XLSXの`convert --result-format json`を行う。
6. 自動テキスト入力がある場合だけ、`miku-text-bundle`のdry-runと本実行を一時ディレクトリで行う。
7. 管理用indexのSource Mappingが`automaticInputPaths`と完全一致し、自動生成数が固定値と一致することを確認する。
8. 選択形式に従いMarkdownをコピーまたはDOCX化し、準備済み文書をコピーしてハッシュ一致を確認する。
9. JSON workbookの`artifacts[]`、warning code、XLSX signatureと最終basename集合を確認する。
10. すべて成功した場合だけ`work/knowledge-markdown/`、`work/knowledge-index.md`、`upload/`を一括で入れ替える。失敗時は既存の正常な`upload/`を維持する。
11. 成功結果を`work/conversion-history.jsonl`へ1行追記する。

入力元と`manual-input/`は読み取り専用として扱う。ランナーはファイルを自動改名せず、構成差を新しい判断で補わない。

## 内容だけを更新する再実行

初回最終化後、利用者は次を変更できる。

- `automaticInputPaths`に列挙済みの原本ファイルの内容
- `jsonWorkbookInputs`に列挙済みのJSON / JSONL原本ファイルの内容
- `manualInputs`に列挙済みの手動資料の内容

次は変更しない。

- 入力元のファイル相対パス集合
- JSON mappingの内容とSHA-256
- JSON / JSONLとXLSXの1対1対応
- `manual-input/`のファイル相対パス集合
- 手動資料の処理方式と最終basename
- 自動生成数
- Knowledge形式
- 総ファイル上限

JSON / JSONLの内容変更が承認済みmappingと互換であることを前提に、変更後は次を実行する。

```text
node <run-directory>/work/run-conversion.mjs
```

入力、mapping、または出力の構成が変わった場合、ランナーは既存`upload/`を変更せず停止する。内容変更で新しいpathや型が現れ、上流CLIがwarningまたはerrorを返した場合も確認する。その変更に合わせてmappingを変える場合は、確定済みジョブを手編集して迂回せず、新しい日時付き実行ディレクトリで第1段階から実行する。

## 人による確認が残る範囲

ランナーは決定的な変換、パス集合、個数、basename、コピー同一性、基本的なDOCX生成確認を再現する。内容変更後の意味上の正確性、版の矛盾、機密情報、対象サービスの最新仕様、権限、配備後の検索品質までは自動承認しない。

再実行後は、人またはAI Agentが変更内容に応じてこれらを確認してから、生成物を対象サービスへ再登録する。`agent-builder-input.md`または`gem-input.md`は構成固定のため自動変更しない。構成を変える必要がある場合は新規変換として扱う。
