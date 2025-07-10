/**
 * 羊飼いまるおか AI自動ブログ生成システム
 * StandFM RSS処理モジュール
 * 
 * 機能:
 * - StandFM RSS取得
 * - XML解析・エピソード抽出
 * - データ正規化・クリーニング
 * - 🆕 自動カテゴリ分類
 */

const axios = require('axios');
const xml2js = require('xml2js');

class EpisodeProcessor {
    constructor() {
        this.rssUrl = process.env.STANDFM_RSS_URL;
        this.channelId = process.env.STANDFM_CHANNEL_ID;
        
        // 🆕 カテゴリ分類ルールを追加
        this.categoryRules = {
            '技術・AI': [
                'AI', 'ai', 'Bot', 'ボット', 'システム', '技術', 'プログラム', 'アプリ', 
                'デジタル', 'IT', 'クローン', 'まとめサイト', '自動', 'データ', 
                'アルゴリズム', 'ツール', 'ソフト'
            ],
            '個人的考察': [
                '思い', '考え', '感想', '個人的', '私の', '気持ち', '心境', 
                '体験', '経験', '振り返り', '反省', '学び', 'だらだら', 'ぐだぐだ',
                '疲れた', '気になっちゃう', '続ける', '試行錯誤'
            ],
            'ビジネス・販売': [
                '販売', '経営', 'ビジネス', '売上', '収益', '価格', '値段', 
                '商売', 'マーケティング', '顧客', 'お客', 'コンクール', '結果', 
                '経営術', '値を付ける', 'アイデア'
            ],
            '羊への愛情': [
                '可愛い', 'かわいい', '愛', '好き', '癒し', '絆', '繋がり', 
                '人と羊', '景色', '気持ち', '愛情', '夢が叶った', '応援'
            ],
            '羊飼い実務': [
                '羊', 'ひつじ', 'ヒツジ', '毛刈り', '飼育', '牧場', '放牧', 
                '羊毛', 'フリース', '原毛', '餌', 'えさ', '飼育員', '動物取扱業',
                '羊飼い', '牧羊', '畜産', '牧草', '柵', '羊舎', 'カバー', '汚れる',
                '飼育ができない', '向いてる人', '幼少期', '地域に根付く', 'ハッシュタグ',
                '毛刈りが嫌い', 'イベント', 'マルチタスク'
            ]
        };
        
        if (!this.rssUrl || !this.channelId) {
            throw new Error('StandFM RSS URL またはチャンネルIDが設定されていません');
        }

        console.log(`📡 StandFM RSS設定完了: ${this.channelId}`);
        console.log(`🏷️ カテゴリ分類ルール設定完了: ${Object.keys(this.categoryRules).length}カテゴリ`);
    }

    /**
     * RSS取得と解析のメイン処理
     */
    async fetchAndParseRSS() {
        try {
            console.log(`🔗 RSS取得中: ${this.rssUrl}`);
            
            // Step 1: RSS XML取得
            const rssData = await this.fetchRSSData();
            
            // Step 2: XML解析
            const parsedData = await this.parseXML(rssData);
            
            // Step 3: エピソード情報抽出
            const episodes = this.extractEpisodes(parsedData);
            
            // Step 4: データクリーニング
            const cleanedEpisodes = this.cleanEpisodeData(episodes);
            
            console.log(`✅ ${cleanedEpisodes.length}件のエピソードを解析完了`);
            return cleanedEpisodes;

        } catch (error) {
            console.error('❌ RSS処理エラー:', error.message);
            throw new Error(`RSS処理失敗: ${error.message}`);
        }
    }

    /**
     * RSS XMLデータ取得
     */
    async fetchRSSData() {
        try {
            const response = await axios.get(this.rssUrl, {
                timeout: 30000, // 30秒タイムアウト
                headers: {
                    'User-Agent': 'MaruokaAI-BlogSystem/1.0',
                    'Accept': 'application/rss+xml, application/xml, text/xml'
                }
            });

            if (!response.data) {
                throw new Error('RSSデータが空です');
            }

            console.log(`📦 RSS取得成功 (${response.data.length} 文字)`);
            return response.data;

        } catch (error) {
            if (error.code === 'ECONNABORTED') {
                throw new Error('RSS取得タイムアウト - ネットワーク接続を確認してください');
            } else if (error.response) {
                throw new Error(`RSS取得エラー: HTTP ${error.response.status} - ${error.response.statusText}`);
            } else {
                throw new Error(`RSS取得エラー: ${error.message}`);
            }
        }
    }

    /**
     * XML解析処理
     */
    async parseXML(xmlData) {
        try {
            const parser = new xml2js.Parser({
                explicitArray: false,
                trim: true,
                normalize: true,
                mergeAttrs: true
            });

            const result = await parser.parseStringPromise(xmlData);
            
            if (!result.rss || !result.rss.channel) {
                throw new Error('有効なRSS形式ではありません');
            }

            console.log('🔍 XML解析完了');
            return result;

        } catch (error) {
            throw new Error(`XML解析エラー: ${error.message}`);
        }
    }

    /**
     * エピソード情報抽出
     */
    extractEpisodes(parsedData) {
        try {
            const channel = parsedData.rss.channel;
            const items = Array.isArray(channel.item) ? channel.item : [channel.item];

            if (!items || items.length === 0) {
                console.log('📭 エピソードが見つかりませんでした');
                return [];
            }

            console.log(`📋 ${items.length}件のアイテムを処理中...`);

            const episodes = items.map((item, index) => {
                try {
                    return this.extractSingleEpisode(item, index);
                } catch (error) {
                    console.warn(`⚠️  エピソード ${index + 1} の抽出でエラー: ${error.message}`);
                    return null;
                }
            }).filter(episode => episode !== null);

            console.log(`✅ ${episodes.length}件のエピソード情報を抽出`);
            return episodes;

        } catch (error) {
            throw new Error(`エピソード抽出エラー: ${error.message}`);
        }
    }

    /**
     * 🏷️ タイトルと説明文からカテゴリを自動分類
     */
    classifyCategory(title, description) {
        const text = `${title} ${description || ''}`.toLowerCase();
        
        let bestCategory = 'その他';
        let maxScore = 0;
        
        // デバッグ情報（必要に応じて）
        const debug = process.env.DEBUG_CLASSIFICATION === 'true';
        if (debug) {
            console.log(`🔍 分類対象テキスト: "${text.substring(0, 100)}..."`);
        }
        
        for (const [category, keywords] of Object.entries(this.categoryRules)) {
            let score = 0;
            const matchedKeywords = [];
            
            for (const keyword of keywords) {
                const regex = new RegExp(keyword.toLowerCase(), 'gi');
                const matches = text.match(regex);
                if (matches) {
                    // マッチ回数とキーワード長でスコア計算
                    const keywordScore = matches.length * keyword.length;
                    score += keywordScore;
                    matchedKeywords.push({ keyword, matches: matches.length, score: keywordScore });
                }
            }
            
            if (debug && score > 0) {
                console.log(`   ${category}: ${score}点 (${matchedKeywords.length}個のキーワードがマッチ)`);
            }
            
            if (score > maxScore) {
                maxScore = score;
                bestCategory = category;
            }
        }
        
        if (debug) {
            console.log(`   🏆 結果: ${bestCategory} (${maxScore}点)`);
        }
        
        return bestCategory;
    }

    /**
     * 個別エピソード情報抽出
     */
    extractSingleEpisode(item, index) {
        // 必須フィールドチェック
        if (!item.title || !item.link) {
            throw new Error(`必須フィールドが不足しています (item ${index + 1})`);
        }

        // エピソードIDの抽出（URLから）
        const episodeId = this.extractEpisodeId(item.link);
        
        // タイトルと説明文をクリーニング
        const cleanTitle = this.cleanText(item.title);
        const cleanDescription = this.cleanText(item.description || '');
        
        // カテゴリ分類を実行
        const autoCategory = this.classifyCategory(cleanTitle, cleanDescription);
        
        // デバッグ情報表示（必要に応じて）
        if (process.env.DEBUG_CLASSIFICATION === 'true') {
            console.log(`📝 "${cleanTitle}" → 🏷️ ${autoCategory}`);
        }
        
        return {
            // 基本情報
            id: episodeId,
            title: cleanTitle,
            description: cleanDescription,
            link: item.link,
            
            // 日時情報
            publishedDate: this.parseDate(item.pubDate),
            
            // メディア情報
            audioUrl: this.extractAudioUrl(item),
            duration: this.extractDuration(item),
            
            // メタデータ
            channelId: this.channelId,
            category: autoCategory,  // 🆕 自動分類されたカテゴリ
            
            // 処理情報
            extractedAt: new Date().toISOString(),
            processed: false
        };
    }

    /**
     * エピソードID抽出（URLから）
     */
    extractEpisodeId(link) {
        try {
            // StandFM URLパターン: https://stand.fm/episodes/xxxxxxxx
            const match = link.match(/episodes\/([a-f0-9]+)/);
            return match ? match[1] : this.generateIdFromUrl(link);
        } catch (error) {
            return this.generateIdFromUrl(link);
        }
    }

    /**
     * URLからID生成（フォールバック）
     */
    generateIdFromUrl(url) {
        return Buffer.from(url).toString('base64').slice(0, 16);
    }

    /**
     * 音声URL抽出
     */
    extractAudioUrl(item) {
        // enclosure タグから音声URL取得
        if (item.enclosure && item.enclosure.url) {
            return item.enclosure.url;
        }
        
        // 他の可能な場所をチェック
        if (item.link && item.link.includes('.mp3')) {
            return item.link;
        }
        
        return null;
    }

    /**
     * 再生時間抽出
     */
    extractDuration(item) {
        // iTunes形式の duration
        if (item['itunes:duration']) {
            return item['itunes:duration'];
        }
        
        // enclosure の length から推定
        if (item.enclosure && item.enclosure.length) {
            const bytes = parseInt(item.enclosure.length);
            // 概算: 1MB ≈ 1分 (音声品質による)
            const estimatedMinutes = Math.round(bytes / (1024 * 1024));
            return `${estimatedMinutes}:00`;
        }
        
        return null;
    }

    /**
     * 日時解析
     */
    parseDate(dateString) {
        if (!dateString) return null;
        
        try {
            const date = new Date(dateString);
            return date.toISOString();
        } catch (error) {
            console.warn(`⚠️  日付解析エラー: ${dateString}`);
            return null;
        }
    }

    /**
     * テキストクリーニング
     */
    cleanText(text) {
        if (!text) return '';
        
        return text
            .replace(/<[^>]*>/g, '') // HTMLタグ除去
            .replace(/&amp;/g, '&')   // HTML エンティティ変換
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }

    /**
     * エピソードデータの最終クリーニング
     */
    cleanEpisodeData(episodes) {
        return episodes.map(episode => {
            // タイトルの長さ制限
            if (episode.title.length > 100) {
                episode.title = episode.title.substring(0, 97) + '...';
            }
            
            // 説明文の長さ制限
            if (episode.description.length > 500) {
                episode.description = episode.description.substring(0, 497) + '...';
            }
            
            // 重複する空白の除去
            episode.title = episode.title.replace(/\s+/g, ' ');
            episode.description = episode.description.replace(/\s+/g, ' ');
            
            return episode;
        });
    }

    /**
     * 処理統計情報の取得
     */
    getProcessingStats(episodes) {
        const stats = {
            total: episodes.length,
            withAudio: episodes.filter(ep => ep.audioUrl).length,
            withDuration: episodes.filter(ep => ep.duration).length,
            recentEpisodes: episodes.filter(ep => {
                if (!ep.publishedDate) return false;
                const episodeDate = new Date(ep.publishedDate);
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                return episodeDate > weekAgo;
            }).length
        };

        console.log('📊 処理統計:');
        console.log(`   📦 総エピソード数: ${stats.total}`);
        console.log(`   🎵 音声URL付き: ${stats.withAudio}`);
        console.log(`   ⏱️ 再生時間付き: ${stats.withDuration}`);
        console.log(`   🆕 過去1週間: ${stats.recentEpisodes}`);

        return stats;
    }
}

module.exports = EpisodeProcessor;