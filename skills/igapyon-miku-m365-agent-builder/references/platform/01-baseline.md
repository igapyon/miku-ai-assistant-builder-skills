# Microsoft 365 Copilot Agent Builderの基礎情報

## 対象

Microsoft 365 Copilot 内から利用する軽量な Agent Builder を対象にする。主な利用者は、Copilot Studio の作成権限を持たず、Microsoft 365 の業務領域内で簡易なエージェントを作成する人とする。

このスキルが準備するデータは、社内や組織テナント内など、利用者が管理する閉じたAgent Builder環境への配備を前提にする。一般公開Webサイトや公開リポジトリへ生成物を公開する用途は対象にしない。

Microsoft 365 Copilot ライセンスには一定範囲の Copilot Studio 利用権が含まれる場合があるが、このスキルでは Copilot Studio の構築画面や高度な機能を対象にしない。利用者が実際に使用する画面と管理者設定を優先して判断する。

## Agent Builder の位置づけ

- Microsoft 365 Copilot、Teams などの日常業務の文脈から利用できる簡易なエージェント作成機能。
- 自然言語による説明、Configure 画面での直接設定、テンプレートからの作成に対応する。
- Microsoft 365 内で使う、比較的軽量な社内向けエージェントの作成に向く。

## 基本的な設定情報

現行の Agent Builder では、次の情報が中心となる。

- エージェント名
- 説明
- Instructions
- Starter prompts
- Knowledge sources
- 利用可能な追加設定やCapabilities

画面項目、名称、上限値、利用可能なKnowledge sourcesは、テナント設定や製品更新によって変わり得る。固定値を推測せず、必要に応じて利用者の画面または最新の公式ドキュメントを確認する。

## Knowledge sources の考え方

テナントや時点によって、SharePoint、OneDrive上のファイル、アップロードファイル、公開Webサイト、Teamsの情報、管理者が有効にしたMicrosoft 365 Copilot connectorsなどを利用できる場合がある。

- 利用者本人に閲覧権限がある情報だけを前提にする。
- Agent Builderの共有範囲と、共有先利用者がKnowledge sourcesへアクセスできる範囲を配備前に確認する。
- 指定したKnowledge sourcesを優先する設定があっても、一般知識を完全に遮断できるとは限らない。
- 厳密な情報源限定や高度な制御が必要な場合は、軽量なAgent Builderの範囲を超える可能性がある。

## 対象外

次のCopilot Studio固有の設計や成果物は、このスキルの基本対象に含めない。

- Topicsや明示的な会話フロー
- Power Automateや高度なTools連携
- Dataverse設計
- 自律トリガー
- Premium／Custom connectors
- 外部Webサイトや外部チャネルへの公開
- Power Platform環境の管理

## 公式情報

- [Build agents with Agent Builder in Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-build-agents)
- [Add knowledge sources to your declarative agent in Microsoft 365 Copilot](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-add-knowledge)
- [Microsoft Copilot Studio licensing](https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing)

この基礎情報は2026-07-16時点で整理した。変更されやすい仕様は、Microsoftの最新公式情報を優先する。
