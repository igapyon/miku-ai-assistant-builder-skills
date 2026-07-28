# 同梱ランタイム

本スキルは、Knowledge source生成、DOCX生成、JSON / JSONLからのXLSX生成、ExperimentalのMarkdownからの複数シートXLSX生成をインストール後の配布物だけで実行できるよう、CLIランタイムを同梱する。

## ランタイム一覧

| 役割 | バックエンド | 同梱ファイル | CLI version | SHA-256 |
|---|---|---|---|---|
| Knowledge source生成 | Java | `runtime/miku-text-bundle-java-1.6.0.jar` | `1.6.0` | `b05d78b142af4cb8f99989a7428c6516e4aec2abea4ade51e772eb4cb853df97` |
| Knowledge source生成 | Node.js | `runtime/miku-text-bundle-1.6.0.mjs` | `1.6.0` | `b1044ae7fbcc13b5998d8aa857445bf80de02392875c75ecd002186e1f353c8b` |
| DOCX生成 | Node.js | `runtime/miku-md2docx-1.1.0.mjs` | `1.1.0` | `fc9557b737f8d156b08d28d989ce0c9608965fb7e8c7ae92d6c44205890b5fee` |
| DOCX生成 | Java | `runtime/miku-md2docx-java-1.1.0.jar` | `1.1.0` | `9dfe021ea83af244046fe35545441157df9641db69ae4e4a9de33341a90a7f54` |
| JSON / JSONLからXLSX生成（Beta） | Node.js | `runtime/miku-json2xlsx-0.5.0.mjs` | `0.5.0` | `ab543255038d432730db486fec70ad8eb87df5f5751d592fd5907c4dfdac2b71` |
| XLSX生成（Experimental） | Node.js | `runtime/miku-md2xlsx-0.10.0.mjs` | `0.10.0` | `64c1d7b4da4f05dd2a72176c1872c6ed0ba6dc219ea3020671edc60d11194b61` |
| XLSX生成（Experimental） | Java | `runtime/miku-md2xlsx-java-0.10.0.jar` | `0.10.0` | `e7dc5238808a73abe6c38fdb835ed008d355e119e86f5d4345c659924c9b4cb7` |

## 選択順

- スキル全体の実行にはNode.js 22以降を必要とする。
- `miku-text-bundle`: Node.js版を既定とし、利用者がJavaバックエンドを明示した場合はJava版へ切り替える。
- `miku-md2docx`: Node.js版を既定とし、利用者がJavaバックエンドを明示した場合はJava版へ切り替える。
- `miku-json2xlsx`: Node.js版だけを使用する。Java版や別実装へ暗黙に切り替えない。
- `miku-md2xlsx`: Node.js版を既定とし、利用者がJavaバックエンドを明示した場合はJava版へ切り替える。
- 利用者がバックエンドを指定した場合はその指定を優先し、指定したランタイムが実行できなければ無断で切り替えず報告する。

実行前に選択したランタイムの`--version`と`--help`を確認する。ランタイムファイル名だけを根拠にCLI契約を推測しない。

## 上流

- `miku-text-bundle` Node.js: <https://github.com/igapyon/miku-text-bundle/releases/tag/v1.6.0>
- `miku-text-bundle` Java: <https://github.com/igapyon/miku-text-bundle-java/releases/tag/v1.6.0>
- `miku-md2docx` Node.js: <https://github.com/igapyon/miku-md2docx/releases/tag/v1.1.0>
- `miku-md2docx` Java: <https://github.com/igapyon/miku-md2docx-java/releases/tag/v1.1.0>
- `miku-json2xlsx` Node.js: <https://github.com/igapyon/miku-json2xlsx/releases/tag/v0.5.0>
- `miku-md2xlsx` Node.js: <https://github.com/igapyon/miku-md2xlsx/releases/tag/v0.10.0>
- `miku-md2xlsx` Java: <https://github.com/igapyon/miku-md2xlsx-java/releases/tag/v0.10.0>

ランタイム更新時は、Node.js版とJava版を個別の上流リリースへ固定し、ファイル、版、SHA-256、索引、スモークテストを同時に更新する。
