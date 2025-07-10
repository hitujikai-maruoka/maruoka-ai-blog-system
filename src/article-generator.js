/**
 * 🐑 羊飼いまるおか AI自動ブログ生成システム Phase 4
 * Claude記事生成モジュール
 * 
 * 機能:
 * - Notion DBから転写テキスト取得
 * - Claude APIで記事生成
 * - 品質管理・検証
 * - 生成記事の保存
 */

require('dotenv').config();
const { Client } = require('@notionhq/client');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class ArticleGenerator {
    constructor() {
        this.notion = new Client({
            auth: process.env.NOTION_API_KEY
        });
        
        this.config = {
            notion: {
                databaseId: process.env.NOTION_DATABASE_ID,
                maxEpisodes: parseInt(process.env.MAX_EPISODES_PER_RUN || '3')
            },
            claude: {
                apiKey: process.env.CLAUDE_API_KEY,
                model: 'claude-3-sonnet-20240229',
                maxTokens: 4000
            },
            article: {
                minLength: 1500,
                maxLength: 3000,
                targetLength: parseInt(process.env.ARTICLE_TARGET_LENGTH || '2000')
            }
        };
        
        this.stats = {
            startTime: new Date(),
            processedEpisodes: 0,
            generatedArticles: 0,
            errorCount: 0
        };

        console.log('🤖 Claude記事生成システム初期化完了');
    }

    /**
     * メイン実行: 記事生成処理
     */
    async run() {
        try {
            console.log('🚀 Phase 4: Claude記事生成開始');
            console.log(`📅 実行時刻: ${this.stats.startTime.toLocaleString('ja-JP')}`);
            console.log('─'.repeat(60));

            // Step 1: 未処理エピソードの取得
            const episodes = await this.getUnprocessedEpisodes();
            
            if (episodes.length === 0) {
                console.log('📭 記事生成対象のエピソードが見つかりませんでした');
                return this.completeSuccess('対象エピソードなし');
            }

            console.log(`📝 ${episodes.length}件のエピソードで記事生成を開始`);

            // Step 2: 各エピソードの記事生成
            const results = [];
            
            for (const [index, episode] of episodes.entries()) {
                console.log(`\n🎙️ [${index + 1}/${episodes.length}] "${episode.title}"`);
                
                try {
                    const result = await this.generateArticleForEpisode(episode);
                    results.push(result);
                    
                    console.log(`✅ [${index + 1}] 記事生成完了 (${result.wordCount}文字)`);
                    
                    // API制限を考慮した待機
                    if (index < episodes.length - 1) {
                        console.log('⏱️ 3秒待機中...');
                        await this.sleep(3000);
                    }
                    
                } catch (error) {
                    console.error(`❌ [${index + 1}] 記事生成エラー: ${error.message}`);
                    results.push({
                        success: false,
                        episodeId: episode.id,
                        title: episode.title,
                        error: error.message
                    });
                    this.stats.errorCount++;
                }
            }

            // Step 3: 結果の保存と統計更新
            await this.saveResults(results);
            this.updateStats(results);

            return this.completeSuccess(`${results.filter(r => r.success).length}件の記事を生成`);

        } catch (error) {
            return this.handleError(error);
        }
    }

    /**
     * 未処理エピソードの取得
     */
    async getUnprocessedEpisodes() {
        try {
            console.log('🔍 未処理エピソードを検索中...');
            
            const response = await this.notion.databases.query({
                database_id: this.config.notion.databaseId,
                filter: {
                    and: [
                        {
                            property: '処理状況',
                            select: {
                                equals: '処理完了'
                            }
                        },
                        {
                            property: '記事生成',
                            checkbox: {
                                equals: false
                            }
                        },
                        {
                            property: '転写テキスト',
                            rich_text: {
                                is_not_empty: true
                            }
                        }
                    ]
                },
                sorts: [
                    {
                        property: '公開日',
                        direction: 'descending'
                    }
                ],
                page_size: this.config.notion.maxEpisodes
            });

            const episodes = response.results.map(page => this.extractEpisodeData(page));
            console.log(`📋 ${episodes.length}件の未処理エピソードを取得`);
            
            return episodes;

        } catch (error) {
            throw new Error(`未処理エピソード取得エラー: ${error.message}`);
        }
    }

    /**
     * Notionページからエピソードデータ抽出
     */
    extractEpisodeData(page) {
        return {
            id: page.id,
            title: page.properties['タイトル']?.title?.[0]?.text?.content || '無題',
            transcript: page.properties['転写テキスト']?.rich_text?.[0]?.text?.content || '',
            publishedDate: page.properties['公開日']?.date?.start || '',
            duration: page.properties['再生時間']?.rich_text?.[0]?.text?.content || '',
            audioUrl: page.properties['音声URL']?.url || '',
            description: page.properties['説明']?.rich_text?.[0]?.text?.content || ''
        };
    }

    /**
     * 単一エピソードの記事生成
     */
    async generateArticleForEpisode(episode) {
        try {
            // Step 1: 転写テキストの前処理
            const processedTranscript = this.preprocessTranscript(episode.transcript);
            
            // Step 2: Claudeプロンプト生成
            const prompt = this.buildClaudePrompt(episode, processedTranscript);
            
            // Step 3: Claude API呼び出し
            const generatedContent = await this.callClaudeAPI(prompt);
            
            // Step 4: 記事の後処理・品質チェック
            const article = this.postprocessArticle(generatedContent, episode);
            
            // Step 5: Notion DBに記事保存
            await this.saveArticleToNotion(episode.id, article);
            
            this.stats.generatedArticles++;
            
            return {
                success: true,
                episodeId: episode.id,
                title: episode.title,
                article: article,
                wordCount: article.content.length,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`記事生成エラー: ${error.message}`);
        }
    }

    /**
     * 転写テキストの前処理
     */
    preprocessTranscript(transcript) {
        if (!transcript) {
            throw new Error('転写テキストが空です');
        }

        return transcript
            .replace(/\s+/g, ' ')           // 複数スペースを単一に
            .replace(/[。、]/g, '。')        // 句読点統一
            .trim();
    }

    /**
     * Claudeプロンプト構築（学習済みプロンプト活用）
     */
    buildClaudePrompt(episode, transcript) {
        return `あなたは羊飼いまるおかの記事生成AIです。

【今回のエピソード情報】
タイトル: ${episode.title}
放送日: ${episode.publishedDate}
音声時間: ${episode.duration}
概要: ${episode.description}

【転写テキスト】
${transcript}

【指示】
上記の転写テキストを基に、まるおかさんの語り口調を活かしたブログ記事を作成してください。

【記事スタイル】
- 親しみやすく、温かい語調
- 羊飼いとしての専門知識を織り交ぜる
- 読者との距離感を大切にした文章
- 実体験に基づく具体的な内容
- まるおかさんの人柄が伝わる表現

【構成】
1. 導入（挨拶・今日のテーマ）
2. メインコンテンツ（3-4つのポイント）
3. まとめ（読者への呼びかけ）

【注意事項】
- 文字数: ${this.config.article.targetLength}文字程度
- 自然な段落分け
- 読みやすい文章構成
- まるおかさんらしい温かみのある表現

記事内容のみを出力してください（タイトルは除く）。`;
    }

    /**
     * Claude API呼び出し
     */
    async callClaudeAPI(prompt) {
        if (!this.config.claude.apiKey) {
            throw new Error('Claude API Keyが設定されていません');
        }

        try {
            console.log('🤖 Claude APIに記事生成リクエスト送信中...');
            
            const response = await axios.post('https://api.anthropic.com/v1/messages', {
                model: this.config.claude.model,
                max_tokens: this.config.claude.maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.claude.apiKey,
                    'anthropic-version': '2023-06-01'
                },
                timeout: 60000
            });

            const content = response.data.content[0].text;
            console.log(`✅ Claude API応答受信 (${content.length}文字)`);
            
            return content;

        } catch (error) {
            if (error.response) {
                throw new Error(`Claude API Error: ${error.response.status} - ${error.response.data.error?.message || 'Unknown error'}`);
            } else {
                throw new Error(`Claude API呼び出しエラー: ${error.message}`);
            }
        }
    }

    /**
     * 記事の後処理・品質チェック
     */
    postprocessArticle(generatedContent, episode) {
        const content = generatedContent.trim();
        
        // 品質チェック
        if (content.length < this.config.article.minLength) {
            console.warn(`⚠️ 記事が短すぎます (${content.length}文字)`);
        }
        
        if (content.length > this.config.article.maxLength) {
            console.warn(`⚠️ 記事が長すぎます (${content.length}文字)`);
        }

        return {
            title: episode.title,
            content: content,
            metadata: {
                originalTitle: episode.title,
                publishedDate: episode.publishedDate,
                duration: episode.duration,
                transcriptLength: episode.transcript.length,
                generatedAt: new Date().toISOString(),
                wordCount: content.length
            }
        };
    }

    /**
     * 生成記事をNotionに保存
     */
    async saveArticleToNotion(episodeId, article) {
        try {
            // エピソードページを更新
            await this.notion.pages.update({
                page_id: episodeId,
                properties: {
                    '記事生成': {
                        checkbox: true
                    },
                    '生成記事': {
                        rich_text: [
                            {
                                text: {
                                    content: article.content.substring(0, 2000) // Notion制限対応
                                }
                            }
                        ]
                    },
                    '記事文字数': {
                        number: article.content.length
                    },
                    '記事生成日時': {
                        date: {
                            start: new Date().toISOString()
                        }
                    }
                }
            });

            console.log(`💾 記事をNotionに保存完了`);

        } catch (error) {
            throw new Error(`Notion保存エラー: ${error.message}`);
        }
    }

    /**
     * 結果の保存
     */
    async saveResults(results) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = path.join('./data', `article_generation_${timestamp}.json`);
            
            const resultData = {
                timestamp: new Date().toISOString(),
                stats: this.stats,
                results: results,
                summary: {
                    total: results.length,
                    success: results.filter(r => r.success).length,
                    failed: results.filter(r => !r.success).length
                }
            };

            await fs.mkdir('./data', { recursive: true });
            await fs.writeFile(filename, JSON.stringify(resultData, null, 2));
            
            console.log(`📁 結果を保存: ${filename}`);

        } catch (error) {
            console.error('⚠️ 結果保存エラー:', error.message);
        }
    }

    /**
     * 統計更新
     */
    updateStats(results) {
        this.stats.endTime = new Date();
        this.stats.duration = this.stats.endTime - this.stats.startTime;
        this.stats.processedEpisodes = results.length;
        this.stats.generatedArticles = results.filter(r => r.success).length;
    }

    /**
     * 成功完了処理
     */
    completeSuccess(message) {
        console.log('─'.repeat(60));
        console.log(`🎉 記事生成完了: ${message}`);
        console.log(`📊 生成記事数: ${this.stats.generatedArticles}件`);
        console.log(`❌ エラー数: ${this.stats.errorCount}件`);
        console.log(`⏱️ 実行時間: ${(this.stats.duration / 1000).toFixed(2)}秒`);
        console.log(`📅 完了時刻: ${new Date().toLocaleString('ja-JP')}`);
        console.log('🤖 Claude記事生成システム 正常終了');

        return {
            success: true,
            message: message,
            stats: this.stats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * エラー処理
     */
    handleError(error) {
        console.error('─'.repeat(60));
        console.error('❌ 記事生成システムエラーが発生しました');
        console.error(`📅 エラー時刻: ${new Date().toLocaleString('ja-JP')}`);
        console.error('📋 エラー詳細:');
        console.error(error.message);
        console.error('🤖 Claude記事生成システム 異常終了');

        return {
            success: false,
            error: error.message,
            stats: this.stats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 待機処理
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ArticleGenerator;

// 直接実行時のテスト
if (require.main === module) {
    const generator = new ArticleGenerator();
    generator.run().catch(error => {
        console.error('💥 実行エラー:', error);
        process.exit(1);
    });
}