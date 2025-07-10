#!/usr/bin/env node

/**
 * 羊飼いまるおか AI自動ブログ生成システム
 * メイン処理ファイル
 * 
 * 処理フロー:
 * 1. StandFM RSS取得・解析
 * 2. 新しいエピソードをNotion DBに保存
 * 3. ブログ記事生成トリガー設定
 */

require('dotenv').config();
const EpisodeProcessor = require('./episode-processor');
const NotionIntegration = require('./notion-integration');

class MaruokaAISystem {
    constructor() {
        this.episodeProcessor = new EpisodeProcessor();
        this.notionIntegration = new NotionIntegration();
        
        // 必要な環境変数チェック
        this.validateEnvironment();
    }

    /**
     * 環境変数の検証
     */
    validateEnvironment() {
        const requiredEnvVars = [
            'NOTION_API_KEY',
            'NOTION_DATABASE_ID',
            'STANDFM_RSS_URL',
            'STANDFM_CHANNEL_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.error('❌ 必要な環境変数が設定されていません:');
            missingVars.forEach(varName => console.error(`   - ${varName}`));
            console.error('\n📋 .envファイルを確認してください');
            process.exit(1);
        }

        console.log('✅ 環境変数チェック完了');
    }

    /**
     * メイン処理実行
     */
    async run() {
        try {
            console.log('🐑 羊飼いまるおか AI自動ブログ生成システム 開始');
            console.log(`📅 実行時刻: ${new Date().toLocaleString('ja-JP')}`);
            console.log('─'.repeat(50));

            // Step 1: StandFM RSS解析
            console.log('📡 Step 1: StandFM RSSデータ取得・解析中...');
            const episodeData = await this.episodeProcessor.fetchAndParseRSS();
            
            if (!episodeData || episodeData.length === 0) {
                console.log('📭 新しいエピソードは見つかりませんでした');
                return this.completeSuccess('新規エピソードなし');
            }

            console.log(`📦 ${episodeData.length}件のエピソードデータを取得`);

            // Step 2: Notion重複チェック
            console.log('🔍 Step 2: Notion DB重複チェック中...');
            const newEpisodes = await this.notionIntegration.filterNewEpisodes(episodeData);
            
            if (newEpisodes.length === 0) {
                console.log('📝 全てのエピソードは既に処理済みです');
                return this.completeSuccess('重複エピソードのみ');
            }

            console.log(`🆕 ${newEpisodes.length}件の新規エピソードを発見`);

            // Step 3: Notion DBに新規エピソード保存
            console.log('💾 Step 3: Notion DBに新規エピソード保存中...');
            const savedResults = await this.notionIntegration.saveEpisodesToNotion(newEpisodes);
            
            console.log('✨ 保存結果:');
            savedResults.forEach((result, index) => {
                if (result.success) {
                    console.log(`   ✅ [${index + 1}] ${result.title}`);
                } else {
                    console.log(`   ❌ [${index + 1}] ${result.title} - ${result.error}`);
                }
            });

            // Step 4: 処理結果サマリー
            const successCount = savedResults.filter(r => r.success).length;
            const failureCount = savedResults.filter(r => !r.success).length;

            console.log('─'.repeat(50));
            console.log('📊 処理結果サマリー:');
            console.log(`   📦 取得エピソード数: ${episodeData.length}`);
            console.log(`   🆕 新規エピソード数: ${newEpisodes.length}`);
            console.log(`   ✅ 正常保存数: ${successCount}`);
            console.log(`   ❌ エラー数: ${failureCount}`);

            if (failureCount > 0) {
                console.log('\n⚠️  一部のエピソード保存でエラーが発生しました');
                console.log('📋 詳細はログを確認してください');
            }

            return this.completeSuccess(`${successCount}件のエピソードを処理`);

        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * 成功完了処理
     */
    completeSuccess(message) {
        console.log('─'.repeat(50));
        console.log(`🎉 処理完了: ${message}`);
        console.log(`📅 完了時刻: ${new Date().toLocaleString('ja-JP')}`);
        console.log('🐑 羊飼いまるおか AI自動ブログ生成システム 正常終了');
        
        return {
            success: true,
            message: message,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * エラー処理
     */
    handleError(error) {
        console.error('─'.repeat(50));
        console.error('❌ システムエラーが発生しました');
        console.error(`📅 エラー時刻: ${new Date().toLocaleString('ja-JP')}`);
        console.error('📋 エラー詳細:');
        console.error(error.message);
        
        if (error.stack) {
            console.error('\n📍 スタックトレース:');
            console.error(error.stack);
        }

        console.error('🐑 羊飼いまるおか AI自動ブログ生成システム 異常終了');
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 手動実行用のヘルプ表示
     */
    static showHelp() {
        console.log('🐑 羊飼いまるおか AI自動ブログ生成システム');
        console.log('');
        console.log('使用方法:');
        console.log('  node src/index.js              # 通常実行');
        console.log('  node src/index.js --help       # ヘルプ表示');
        console.log('  node src/index.js --test       # テストモード');
        console.log('');
        console.log('必要な環境変数:');
        console.log('  NOTION_API_KEY                 # Notion Integration API Key');
        console.log('  NOTION_DATABASE_ID             # Notion Database ID');
        console.log('  STANDFM_RSS_URL               # StandFM RSS URL');
        console.log('  STANDFM_CHANNEL_ID            # StandFM Channel ID');
        console.log('');
        console.log('設定ファイル: .env');
    }
}

/**
 * メイン実行部分
 */
async function main() {
    // コマンドライン引数の処理
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        MaruokaAISystem.showHelp();
        process.exit(0);
    }

    const isTestMode = args.includes('--test');
    
    if (isTestMode) {
        console.log('🧪 テストモードで実行中...');
    }

    // システム実行
    const system = new MaruokaAISystem();
    const result = await system.run();

    // 終了コードの設定
    process.exit(result.success ? 0 : 1);
}

// スクリプト直接実行時のみmainを呼び出し
if (require.main === module) {
    main().catch(error => {
        console.error('💥 予期しないエラーが発生しました:', error);
        process.exit(1);
    });
}

module.exports = MaruokaAISystem;