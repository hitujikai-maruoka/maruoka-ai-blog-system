/**
 * 羊飼いまるおか AI自動ブログ生成システム
 * Notion API連携モジュール
 * 
 * 機能:
 * - Notion API接続・認証
 * - エピソードデータベース操作
 * - 重複チェック・データ保存
 * - ブログ記事生成トリガー
 */

const { Client } = require('@notionhq/client');

class NotionIntegration {
    constructor() {
        this.apiKey = process.env.NOTION_API_KEY;
        this.databaseId = process.env.NOTION_DATABASE_ID;
        
        if (!this.apiKey || !this.databaseId) {
            throw new Error('Notion API Key またはDatabase IDが設定されていません');
        }

        // Notion クライアント初期化
        this.notion = new Client({
            auth: this.apiKey,
        });

        console.log(`💾 Notion DB接続設定完了: ${this.databaseId.slice(0, 8)}...`);
    }

    /**
     * 新規エピソードのフィルタリング（重複チェック）
     */
    async filterNewEpisodes(episodes) {
        try {
            console.log(`🔍 ${episodes.length}件のエピソードの重複チェック中...`);
            
            // 既存エピソードID一覧を取得
            const existingIds = await this.getExistingEpisodeIds();
            console.log(`📋 既存エピソード数: ${existingIds.size}件`);
            
            // 新規エピソードをフィルタリング
            const newEpisodes = episodes.filter(episode => {
                return !existingIds.has(episode.id);
            });

            console.log(`🆕 新規エピソード: ${newEpisodes.length}件`);
            return newEpisodes;

        } catch (error) {
            console.error('❌ 重複チェックエラー:', error.message);
            throw new Error(`重複チェック失敗: ${error.message}`);
        }
    }

    /**
     * 既存エピソードID一覧を取得
     */
    async getExistingEpisodeIds() {
        try {
            const existingIds = new Set();
            let hasMore = true;
            let nextCursor = undefined;

            while (hasMore) {
                const response = await this.notion.databases.query({
                    database_id: this.databaseId,
                    start_cursor: nextCursor,
                    page_size: 100,
                    filter: {
                        property: 'エピソードID',
                        rich_text: {
                            is_not_empty: true
                        }
                    }
                });

                // エピソードIDを抽出してセットに追加
                response.results.forEach(page => {
                    const episodeIdProperty = page.properties['エピソードID'];
                    if (episodeIdProperty?.rich_text?.length > 0) {
                        const episodeId = episodeIdProperty.rich_text[0].text.content;
                        existingIds.add(episodeId);
                    }
                });

                hasMore = response.has_more;
                nextCursor = response.next_cursor;
            }

            return existingIds;

        } catch (error) {
            if (error.code === 'object_not_found') {
                throw new Error('Notion データベースが見つかりません - Database IDを確認してください');
            } else if (error.code === 'unauthorized') {
                throw new Error('Notion API認証エラー - API Keyを確認してください');
            } else {
                throw new Error(`既存データ取得エラー: ${error.message}`);
            }
        }
    }

    /**
     * エピソードをNotionに保存
     */
    async saveEpisodesToNotion(episodes) {
        try {
            console.log(`💾 ${episodes.length}件のエピソードをNotion DBに保存中...`);
            
            const results = [];
            
            for (const [index, episode] of episodes.entries()) {
                try {
                    console.log(`   📝 [${index + 1}/${episodes.length}] ${episode.title}`);
                    
                    const result = await this.saveSingleEpisode(episode);
                    results.push({
                        success: true,
                        title: episode.title,
                        id: episode.id,
                        pageId: result.id
                    });

                    // API制限を考慮した待機（1秒間隔）
                    if (index < episodes.length - 1) {
                        await this.sleep(1000);
                    }

                } catch (error) {
                    console.error(`   ❌ [${index + 1}] ${episode.title} - ${error.message}`);
                    results.push({
                        success: false,
                        title: episode.title,
                        id: episode.id,
                        error: error.message
                    });
                }
            }

            return results;

        } catch (error) {
            console.error('❌ エピソード保存エラー:', error.message);
            throw new Error(`エピソード保存失敗: ${error.message}`);
        }
    }

    /**
     * 単一エピソードをNotionに保存
     */
    async saveSingleEpisode(episode) {
        try {
            const properties = this.buildEpisodeProperties(episode);
            
            const response = await this.notion.pages.create({
                parent: {
                    database_id: this.databaseId
                },
                properties: properties
            });

            return response;

        } catch (error) {
            if (error.code === 'validation_error') {
                throw new Error(`データ形式エラー: ${error.message}`);
            } else if (error.code === 'rate_limited') {
                // レート制限の場合は少し待ってリトライ
                await this.sleep(3000);
                return this.saveSingleEpisode(episode);
            } else {
                throw new Error(`保存エラー: ${error.message}`);
            }
        }
    }

    /**
     * エピソード用のNotionプロパティを構築
     */
    buildEpisodeProperties(episode) {
        return {
            // タイトル（メインタイトル）
            'タイトル': {
                title: [
                    {
                        text: {
                            content: episode.title || '無題'
                        }
                    }
                ]
            },
            
            // エピソードID
            'エピソードID': {
                rich_text: [
                    {
                        text: {
                            content: episode.id || ''
                        }
                    }
                ]
            },
            
            // 説明・概要
            '説明': {
                rich_text: [
                    {
                        text: {
                            content: episode.description || ''
                        }
                    }
                ]
            },
            
            // StandFMリンク
            'StandFMリンク': {
                url: episode.link || null
            },
            
            // 公開日
            '公開日': {
                date: episode.publishedDate ? {
                    start: episode.publishedDate.split('T')[0]
                } : null
            },
            
            // 音声URL
            '音声URL': {
                url: episode.audioUrl || null
            },
            
            // 再生時間
            '再生時間': {
                rich_text: [
                    {
                        text: {
                            content: episode.duration || ''
                        }
                    }
                ]
            },
            
            // カテゴリ
            'カテゴリ': {
                select: episode.category ? {
                    name: episode.category
                } : null
            },
            
            // 処理状況
            '処理状況': {
                select: {
                    name: '未処理'
                }
            },
            
            // 記事生成状況
            '記事生成': {
                checkbox: false
            },
            
            // 取得日時
            '取得日時': {
                date: {
                    start: new Date().toISOString()
                }
            }
        };
    }

    /**
     * ブログ記事生成のトリガー設定
     */
    async triggerBlogGeneration(episodeId, pageId) {
        try {
            // 処理状況を「記事生成待ち」に更新
            await this.notion.pages.update({
                page_id: pageId,
                properties: {
                    '処理状況': {
                        select: {
                            name: '記事生成待ち'
                        }
                    }
                }
            });

            console.log(`🎯 ${episodeId}: 記事生成トリガー設定完了`);
            return true;

        } catch (error) {
            console.error(`❌ ${episodeId}: トリガー設定エラー - ${error.message}`);
            return false;
        }
    }

    /**
     * データベースの統計情報を取得
     */
    async getDatabaseStats() {
        try {
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                page_size: 1
            });

            // 大まかな統計情報
            const stats = {
                hasDatabase: true,
                sampleRecord: response.results.length > 0,
                lastCheck: new Date().toISOString()
            };

            console.log('📊 Notion DB統計:');
            console.log(`   💾 データベース接続: ${stats.hasDatabase ? '✅' : '❌'}`);
            console.log(`   📝 サンプルレコード: ${stats.sampleRecord ? '✅' : '❌'}`);

            return stats;

        } catch (error) {
            console.error('❌ 統計取得エラー:', error.message);
            return {
                hasDatabase: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }

    /**
     * 待機処理（API制限対応）
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 接続テスト
     */
    async testConnection() {
        try {
            console.log('🔌 Notion API接続テスト中...');
            
            const response = await this.notion.databases.retrieve({
                database_id: this.databaseId
            });

            console.log(`✅ 接続成功: ${response.title[0]?.text?.content || 'Notion Database'}`);
            return true;

        } catch (error) {
            console.error('❌ 接続テスト失敗:', error.message);
            
            if (error.code === 'object_not_found') {
                console.error('   📋 Database IDが間違っている可能性があります');
            } else if (error.code === 'unauthorized') {
                console.error('   🔑 API Keyが間違っている可能性があります');
            }
            
            return false;
        }
    }
}

module.exports = NotionIntegration;