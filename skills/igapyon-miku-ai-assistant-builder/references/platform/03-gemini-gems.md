# Google Gemini Gem早期アクセスの基本事項

この資料は、Google GeminiのGem向けに入力値とKnowledgeファイル候補を準備する早期アクセス機能の、最小限の確認事項をまとめる。

Gem対応は、主対象であるMicrosoft 365 Copilot Agent Builder向けワークフローの成果物を、Gemでもおおむね利用できるようにする付加機能である。Agent Builderと同等の機能、検証範囲、動作保証は提供しない。

## 対象

- Gemini AppsでカスタムGemを作成できること。
- GemのKnowledgeへファイルを追加できるアカウント、プラン、組織設定であること。
- 仕事用または学校用アカウントでは、必要なGemini AppsやGoogle Workspace連携が管理者によって有効化されていること。

このスキルはGemの作成、ファイル追加、共有を自動実行しない。利用者が実画面で機能の有無を確認し、生成された入力値とファイルを人手で設定する。

## 入力項目

Gemでは少なくとも名前、Instructions、Knowledgeファイルを人が確認して設定する。生成する`gem-input.md`には、次の順で候補を記載する。

1. Name
2. Instructions
3. Knowledge
4. Items to confirm

設定項目が利用者の実画面と異なる場合は、実画面を優先し、未確認事項を`items-to-confirm.md`へ記録する。

## MarkdownとDOCXの選択

Gem向け変換を開始するとき、次のどちらを使うか利用者に確認し、`work/preparation-status.md`へ記録する。推測で選ばない。

- `markdown`: `miku-text-bundle`が生成した番号付きMarkdownと手動Markdownを、Markdownのまま`upload/`へ置く。`miku-md2docx`は実行しない。
- `docx`: 番号付きMarkdownと手動Markdownを`miku-md2docx`でDOCX化して`upload/`へ置く。

Googleの現行ヘルプは、GemのKnowledgeへ対応ファイルを追加できることと、Gemini Appsが多くのファイル形式を扱うことを案内している。一方、アカウント、プラン、管理者設定、製品更新によって利用可否や上限が変わり得るため、MarkdownとDOCXの実際の添付可否を利用者のGem画面で確認する。Markdownが選べない、またはDOCXの方が利用目的に適すると利用者が判断した場合は`docx`を選ぶ。

## ファイルとMarkdownの役割

- `manual-input/*.md`: 人が追加する原本。選択形式に従ってMarkdownのままコピーするかDOCX化する。
- `work/knowledge-markdown/*.md`: 自動生成されたKnowledge資料。Markdown選択では最終候補へコピーし、DOCX選択では変換元にする。
- `work/knowledge-index.md`: 管理用index。Gemへ添付しない。
- `work/preparation-status.md`: 再開用状態。Gemへ添付しない。
- `gem-input.md`: Gem画面への転記用。Knowledgeへ添付しない。
- `items-to-confirm.md`: 人の確認用。Knowledgeへ添付しない。
- `upload/`: 利用者がGemのKnowledgeへ追加する最終候補だけを置く。

## 制限と確認

- ファイル追加機能、対応形式、件数、サイズは、最新のGoogle公式情報と利用者の実画面を優先する。
- Agent Builder向けの20件という上限をGemへ流用しない。
- Gemを共有すると、アクセス権を持つ利用者がInstructionsやKnowledgeファイルを閲覧できることがある。共有前に機密性と権限を確認する。
- ファイル追加を利用できない環境では、このスキルのGem向けフォルダ変換を実行しない。

## 公式情報

- [Tips for creating custom Gems](https://support.google.com/gemini/answer/15235603)
- [Upload and analyze files in Gemini Apps](https://support.google.com/gemini/answer/14903178)
- [Share a Gem from Gemini Apps](https://support.google.com/gemini/answer/16504957)

この資料は2026-07-19時点で整理した。変更されやすい仕様は、最新のGoogle公式情報と利用者の実画面を優先する。
