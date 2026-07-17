# 同梱ランタイム

本スキルは、Knowledge source生成とDOCX生成をインストール後の配布物だけで実行できるよう、Node.js版とJava版のCLIランタイムを同梱する。

## ランタイム一覧

| 役割 | バックエンド | 同梱ファイル | CLI version | SHA-256 |
|---|---|---|---|---|
| Knowledge source生成 | Java | `runtime/miku-text-bundle-java-1.5.0.jar` | `1.5.0` | `77315a89f0d9f474d67aeddc964b7cca350af7557068c3f905c533d8532d410a` |
| Knowledge source生成 | Node.js | `runtime/miku-text-bundle-1.5.1.mjs` | `1.5.1` | `2bb9bebc9344253375141736ca435309724da8f2a26caf7bf0120abcc22bd45c` |
| DOCX生成 | Node.js | `runtime/miku-md2docx-0.9.2.mjs` | `0.9.2` | `da473724bb1f28876c1adda55f22fc87f387fbaadce04d31f8840f9409557f3a` |
| DOCX生成 | Java | `runtime/miku-md2docx-java-0.9.1.jar` | `0.9.1` | `77168ad5f8eaeb06837cee780c28d4dba47c3a33310167644d23b1fdbdb77a23` |

## 選択順

- `miku-text-bundle`: Node.js版を優先し、Node.jsが利用できない場合はJava版へ切り替える。
- `miku-md2docx`: Node.js版を優先し、Node.jsが利用できない場合はJava版へ切り替える。
- 利用者がバックエンドを指定した場合はその指定を優先し、指定したランタイムが実行できなければ無断で切り替えず報告する。

実行前に選択したランタイムの`--version`と`--help`を確認する。ランタイムファイル名だけを根拠にCLI契約を推測しない。

## 上流

- `miku-text-bundle` Node.js: <https://github.com/igapyon/miku-text-bundle/releases/tag/v1.5.1>
- `miku-text-bundle` Java: <https://github.com/igapyon/miku-text-bundle-java/releases/tag/v1.5.0>
- `miku-md2docx` Node.js: <https://github.com/igapyon/miku-md2docx/releases/tag/v0.9.2>
- `miku-md2docx` Java: <https://github.com/igapyon/miku-md2docx-java/releases/tag/v0.9.1>

ランタイム更新時は、Node.js版とJava版を個別の上流リリースへ固定し、ファイル、版、SHA-256、索引、スモークテストを同時に更新する。
