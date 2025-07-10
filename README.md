# 🐑 羊飼いまるおか AI自動ブログ生成システム

StandFMの音声配信を自動でNotion経由でブログ記事に変換するAIシステムです。

## 🎯 システム概要

このシステムは、羊飼いまるおかの音声配信を自動でブログ記事化する完全自動化システムです。

### 📊 処理フロー

StandFM配信 → RSS取得 → LISTEN変換 → Notion保存 → Claude記事生成 → ブログ公開

## 🛠️ システム構成

- **StandFM**: 音声配信プラットフォーム
- **LISTEN**: 音声→テキスト変換サービス  
- **Notion**: データベース・コンテンツ管理
- **Claude**: AI記事生成エンジン
- **GitHub Actions**: 自動実行基盤

## 📁 ファイル構成
maruoka-ai-blog-system/
├── .github/workflows/     # GitHub Actions設定
│   └── auto-process.yml   # 自動実行ワークフロー
├── src/                   # プログラムファイル
│   ├── index.js          # メイン処理
│   ├── episode-processor.js  # エピソード処理
│   └── notion-integration.js # Notion連携
├── data/                  # データ保存
├── logs/                  # ログファイル
├── .env                   # 環境変数設定
├── package.json          # プロジェクト設定
└── README.md             # このファイル

## 🚀 セットアップ手順

### 1. 環境準備
```bash
# Node.js 16以上をインストール
# パッケージインストール
npm install