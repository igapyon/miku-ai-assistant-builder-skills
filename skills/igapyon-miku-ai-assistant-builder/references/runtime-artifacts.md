# 同梱ランタイム

本スキルは、Knowledge source生成、DOCX生成、JSON / JSONLからのXLSX生成、ExperimentalのMarkdownからの複数シートXLSX生成をインストール後の配布物だけで実行できるよう、CLIランタイムを同梱する。

## ランタイム一覧

| 役割 | バックエンド | 同梱ファイル | CLI version | SHA-256 |
|---|---|---|---|---|
| Knowledge source生成 | Java | `runtime/miku-text-bundle-java-1.6.0.jar` | `1.6.0` | `b05d78b142af4cb8f99989a7428c6516e4aec2abea4ade51e772eb4cb853df97` |
| Knowledge source生成 | Node.js | `runtime/miku-text-bundle-1.6.0.mjs` | `1.6.0` | `b1044ae7fbcc13b5998d8aa857445bf80de02392875c75ecd002186e1f353c8b` |
| DOCX生成 | Node.js | `runtime/miku-md2docx-1.0.1.mjs` | `1.0.1` | `85bae25e3e595c6b2f5f74955196da5e010797506ee1d360a0e987a8004c1fe4` |
| DOCX生成 | Java | `runtime/miku-md2docx-java-1.0.1.jar` | `1.0.1` | `53c9810e73049579c51879c50e990f8657fa87a26cf0d6b93fac3a1adfbc4532` |
| JSON / JSONLからXLSX生成（Beta） | Node.js | `runtime/miku-json2xlsx-0.4.2.mjs` | `0.4.2` | `969e74f65c8f8cdb30e9ab067d43eeb5138f208b3e79f1ca4006e9511b5c4251` |
| XLSX生成（Experimental） | Node.js | `runtime/miku-md2xlsx-0.9.5.mjs` | `0.9.5` | `cc2c292a421c3a5207508b1ba3b63a2b7f558e35a2b2837de0005e6d0ca44b20` |
| XLSX生成（Experimental） | Java | `runtime/miku-md2xlsx-java-0.9.5.jar` | `0.9.5` | `1edec76192c260bfb89a951a7f7a74e5daede77c3f478668ad0ca6babe44c58f` |

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
- `miku-md2docx` Node.js: <https://github.com/igapyon/miku-md2docx/releases/tag/v1.0.1>
- `miku-md2docx` Java: <https://github.com/igapyon/miku-md2docx-java/releases/tag/v1.0.1>
- `miku-json2xlsx` Node.js: <https://github.com/igapyon/miku-json2xlsx/releases/tag/v0.4.2>
- `miku-md2xlsx` Node.js: <https://github.com/igapyon/miku-md2xlsx/releases/tag/v0.9.5>
- `miku-md2xlsx` Java: <https://github.com/igapyon/miku-md2xlsx-java/releases/tag/v0.9.5>

ランタイム更新時は、Node.js版とJava版を個別の上流リリースへ固定し、ファイル、版、SHA-256、索引、スモークテストを同時に更新する。
