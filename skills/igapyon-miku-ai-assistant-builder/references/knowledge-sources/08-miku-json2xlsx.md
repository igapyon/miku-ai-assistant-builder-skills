# miku-json2xlsx連携

## 位置づけ

入力元にJSONまたはJSONLがある場合は、同梱`miku-json2xlsx` v0.4.1を使い、1入力ファイルにつき1つのXLSXをKnowledge source候補として生成する。JSON / JSONLからXLSXへの変換意味、mapping schema、型、安全対策、Excel上限、diagnosticは上流`miku-json2xlsx`が所有し、本スキルで再実装しない。

`miku-json2xlsx` v0.4.1はベータ版である。元JSON / JSONLと承認済みmappingを保持し、生成XLSXを人またはAI Agentが確認してから登録する。

## 同梱ランタイム

- 上流: <https://github.com/igapyon/miku-json2xlsx>
- release: `v0.4.1`
- executable: `runtime/miku-json2xlsx-0.4.1.mjs`
- backend: Node.jsのみ
- SHA-256: `6160dba0563b97452a38b34359e31aceffe3f662f0ec36bc398523e5737d2dc2`

実行前に`--version`と完全な`--help`を確認する。Java版、MCP、Skill内独自変換、別の汎用XLSX実装へ暗黙に切り替えない。

## JSON / JSONLの分類

二段階フォルダ変換でJSON / JSONLをXLSX化する場合、対象範囲にある適格な`.json`と`.jsonl`を`JSON workbook`へ分類する。同じ入力を`miku-text-bundle`へも渡さない。`textBundle.addExcludeExtensions`へ`.json`と`.jsonl`を固定し、JSON workbook入力集合と重複しないことを変換計画で検証する。

初期実装では、同じ実行範囲の一部だけをXLSX化し、残りのJSON / JSONLを`miku-text-bundle`へ混在させない。ファイル枠、機密性、変換適性、mapping未確定などの理由で全JSON / JSONLをXLSX化できない場合は、対象範囲または処理方式を人に確認し、計画を確定するまで停止する。

## mappingレビュー

CLIはmappingを自動推論または承認しない。第2段階で各入力について次を行う。

1. `inspect --result-format json`を実行し、入力種別、調査範囲、path、型候補、欠損、null、配列、sampleを確認する。
2. inspection resultと利用目的からmapping v1案を作る。
3. sheet、column、型、JSON path、rootとchildの関係、追跡列、未採用path、materialな仮定を人へ示す。
4. 人の承認またはmappingと出力先を特定する明確な変換指示を得る。
5. mappingを`work/json2xlsx-mappings/`へUTF-8 JSONで保存する。
6. `validate-mapping --result-format json`が終了コード`0`かつ`status: "success"`になることを確認する。
7. mappingのSHA-256を`conversion-plan.json`へ固定する。

mapping v1は、1つのroot sheetと0個以上のroot直下child sheetを持つ。`README`は生成される英語データ辞書sheetの予約名である。対応型、path、追跡列、sheet名制限は同梱CLIの`--help`と上流mapping schemaを優先する。

mappingを変更した場合は同じ確定済み変換ジョブの内容更新として扱わない。新しい判断を伴うため、新規変換として第1段階から開始する。

## 変換計画

各入力は`jsonWorkbookInputs`へ記録する。

```json
{
  "jsonWorkbookInputs": [
    {
      "relativePath": "data/events.jsonl",
      "mappingPath": "json2xlsx-mappings/data-events.mapping.json",
      "mappingSha256": "<64-character-sha256>",
      "outputBasename": "events.xlsx"
    }
  ],
  "json2xlsx": {
    "backend": "node"
  }
}
```

- `relativePath`は`sourceDirectory`基準の相対パスにする。
- `mappingPath`は実行ディレクトリの`work/`基準とし、`work/`外を参照しない。
- `outputBasename`はフラットな`upload/`で一意な`.xlsx`名にする。
- 既定候補は入力basenameの拡張子を`.xlsx`へ置き換えた名前とする。
- 異なるディレクトリに同じbasenameがある場合は自動改名せず、計画確定前に一意な名前を人へ示して確認する。
- 1つの入力を複数ブックへ分割したり、複数入力を1ブックへ結合したりしない。

## ランナー契約

初回変換と内容更新は、個別のCLI本実行ではなく生成済み`work/run-conversion.mjs`を使う。ランナーは次を行う。

1. JSON / JSONL入力相対パス集合とmapping SHA-256を計画と照合する。
2. 同梱ランタイムの`--version`と`--help`を確認する。
3. 各mappingを`validate-mapping --result-format json`で再検証する。
4. 一時ディレクトリで`convert --result-format json`を実行する。
5. 終了コード、`status`、`diagnostics[]`、`artifacts[]`、XLSXのZIP signatureを確認する。
6. すべての自動生成物と手動資料が成功した場合だけ`upload/`を一括更新する。
7. warning codeを変換結果と`conversion-history.jsonl`へ記録する。

上流CLIが失敗した場合、不完全なXLSXを採用せず、既存の正常な`upload/`を維持して停止する。warningを成功から除外しないが、登録前に内容と影響を確認する。

## 再実行できる変更

同じ確定済み変換ジョブでは、列挙済みJSON / JSONLの内容だけを更新できる。次は固定する。

- JSON / JSONLの相対パス集合
- 入力ごとのmapping内容とSHA-256
- 1入力1ブックの対応
- 出力basename
- `miku-json2xlsx`のbackendと互換版

内容更新後にmappingと一致しない型や未知pathが現れた場合は、上流diagnosticを確認する。mappingの変更が必要なら、既存計画を手編集して迂回せず新規変換にする。

## 上流v0.4.1の主な制約

- JSON配列と単一objectは入力全体を読み込み、JSONLは逐次処理する。
- child sheetはroot直下で、path末尾の1つの`[]`を扱う。
- `string`、`number`、`boolean`、`datetime`、`json`型を扱う。
- 1 sheetあたり1,048,576行、16,384列、1 cellあたり32,767 UTF-16 code unitを超えると停止する。
- JavaScript safe integerを超える値を厳密に保持する場合、入力とmappingでstringにする。
- 数式として解釈され得る文字列、型変換、未知path、上限超過をstructured diagnosticで報告する。
