/**
 * Gmail統合最終版（エラー修正済み）
 * 
 * 修正内容:
 * - Cannot read properties of undefined エラーの解決
 * - 環境変数の安全な確認
 * - エラーハンドリングの強化
 * - 本格運用向けの最適化
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GmailIntegration {
    constructor() {
        this.recipients = this.getRecipients();
        this.scopes = [
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.readonly'
        ];
        this.gmail = null;
        
        console.log(`📧 Gmail API設定完了: ${this.recipients.length}宛先`);
    }

    /**
     * 受信者リストの安全な取得
     */
    getRecipients() {
        if (!process.env.GMAIL_RECIPIENTS) {
            console.log('⚠️ GMAIL_RECIPIENTS環境変数が設定されていません');
            return ['hitujikai.maruoka@gmail.com']; // デフォルト宛先
        }

        const recipients = process.env.GMAIL_RECIPIENTS.split(',')
            .map(email => email.trim())
            .filter(email => email.length > 0);
        
        if (recipients.length === 0) {
            console.log('⚠️ 有効な受信者がありません');
            return ['hitujikai.maruoka@gmail.com']; // デフォルト宛先
        }

        return recipients;
    }

    /**
     * Gmail API認証
     */
    async authenticate() {
        try {
            // 環境変数の存在確認
            if (!process.env.GMAIL_CREDENTIALS) {
                console.log('⚠️ GMAIL_CREDENTIALS環境変数が設定されていません');
                return false;
            }

            if (!process.env.GMAIL_TOKEN) {
                console.log('⚠️ GMAIL_TOKEN環境変数が設定されていません');
                return false;
            }

            // 認証情報をGitHub Secretsから取得
            const credentials = JSON.parse(process.env.GMAIL_CREDENTIALS);
            const token = JSON.parse(process.env.GMAIL_TOKEN);
            
            // 認証情報の構造確認
            if (!credentials.installed) {
                console.log('⚠️ 認証情報の形式が不正です');
                return false;
            }

            const { client_secret, client_id, redirect_uris } = credentials.installed;
            
            // redirect_urisの存在確認
            if (!redirect_uris || redirect_uris.length === 0) {
                console.log('⚠️ リダイレクトURIが設定されていません');
                return false;
            }

            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
            oAuth2Client.setCredentials(token);
            
            const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });
            this.gmail = gmail;
            
            console.log('✅ Gmail API認証完了');
            return true;
            
        } catch (error) {
            console.error('❌ Gmail認証エラー:', error.message);
            return false;
        }
    }

    /**
     * 記事完成通知メール送信
     */
    async sendArticleNotification(articleData) {
        try {
            if (!this.gmail) {
                const authSuccess = await this.authenticate();
                if (!authSuccess) {
                    throw new Error('Gmail認証に失敗しました');
                }
            }

            // articleDataの存在確認
            if (!articleData || !articleData.title) {
                console.log('⚠️ 記事データが不完全です');
                return false;
            }

            console.log(`📧 記事完成メール送信中: ${articleData.title}`);

            // HTMLメール生成
            const htmlContent = this.createArticleEmail(articleData);
            const subject = `[羊飼いまるおか] 新記事: ${articleData.title}`;

            // 各宛先にメール送信
            let successCount = 0;
            for (const recipient of this.recipients) {
                try {
                    await this.sendEmail(recipient, subject, htmlContent);
                    console.log(`✅ メール送信完了: ${recipient}`);
                    successCount++;
                } catch (error) {
                    console.error(`❌ メール送信失敗 ${recipient}:`, error.message);
                }
            }

            return successCount > 0;

        } catch (error) {
            console.error('❌ 記事通知メール送信エラー:', error.message);
            return false;
        }
    }

    /**
     * エラー通知メール送信
     */
    async sendErrorNotification(errorInfo) {
        try {
            if (!this.gmail) {
                const authSuccess = await this.authenticate();
                if (!authSuccess) {
                    throw new Error('Gmail認証に失敗しました');
                }
            }

            // errorInfoの存在確認
            if (!errorInfo) {
                console.log('⚠️ エラー情報が提供されていません');
                return false;
            }

            console.log(`📧 エラー通知メール送信中: ${errorInfo.title || 'システムエラー'}`);

            // HTMLメール生成
            const htmlContent = this.createErrorEmail(errorInfo);
            const subject = `[羊飼いまるおか] システムエラー: ${errorInfo.title || 'Unknown Error'}`;

            // 各宛先にメール送信
            let successCount = 0;
            for (const recipient of this.recipients) {
                try {
                    await this.sendEmail(recipient, subject, htmlContent);
                    console.log(`✅ エラー通知メール送信完了: ${recipient}`);
                    successCount++;
                } catch (error) {
                    console.error(`❌ エラー通知メール送信失敗 ${recipient}:`, error.message);
                }
            }

            return successCount > 0;

        } catch (error) {
            console.error('❌ エラー通知メール送信エラー:', error.message);
            return false;
        }
    }

    /**
     * メール送信
     */
    async sendEmail(to, subject, htmlContent) {
        try {
            const raw = this.createMimeMessage(to, subject, htmlContent);
            
            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: raw
                }
            });

            return response.data.id;

        } catch (error) {
            throw new Error(`メール送信失敗: ${error.message}`);
        }
    }

    /**
     * MIMEメッセージ作成
     */
    createMimeMessage(to, subject, htmlContent) {
        const messageParts = [
            `To: ${to}`,
            `Subject: ${subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            '',
            htmlContent
        ];
        
        const message = messageParts.join('\n');
        return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    /**
     * 記事用HTMLメール生成
     */
    createArticleEmail(articleData) {
        const currentTime = new Date().toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // データの安全な取得
        const title = articleData.title || 'タイトル不明';
        const content = articleData.content || 'コンテンツなし';
        const wordCount = articleData.wordCount || 0;
        const category = articleData.category || 'その他';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { border-bottom: 3px solid #4CAF50; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 28px; color: #333; margin: 0; font-weight: bold; }
                .subtitle { color: #666; font-size: 14px; margin-top: 5px; }
                .summary { background-color: #f9f9f9; padding: 20px; border-left: 4px solid #4CAF50; margin: 20px 0; }
                .content { margin: 20px 0; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
                .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 class="title">🐑 羊飼いまるおか</h1>
                    <p class="subtitle">新しい記事が完成しました！</p>
                </div>
                
                <div class="summary">
                    <h2>📝 ${title}</h2>
                    <p><strong>文字数:</strong> ${wordCount}文字</p>
                    <p><strong>カテゴリ:</strong> ${category}</p>
                    <p><strong>生成日時:</strong> ${currentTime}</p>
                </div>
                
                <div class="content">
                    <h3>記事内容プレビュー:</h3>
                    <p>${content.substring(0, 200)}${content.length > 200 ? '...' : ''}</p>
                </div>
                
                <div class="footer">
                    <p>✨ この記事はAIにより自動生成されました</p>
                    <p>📧 このメールは自動送信されました</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * エラー用HTMLメール生成
     */
    createErrorEmail(errorInfo) {
        const currentTime = new Date().toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // エラー情報の安全な取得
        const title = errorInfo.title || 'システムエラー';
        const message = errorInfo.message || 'エラーの詳細情報が取得できませんでした';
        const stack = errorInfo.stack || 'スタックトレース情報なし';

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 800px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { border-bottom: 3px solid #f44336; padding-bottom: 20px; margin-bottom: 30px; }
                .title { font-size: 28px; color: #f44336; margin: 0; font-weight: bold; }
                .subtitle { color: #666; font-size: 14px; margin-top: 5px; }
                .error-info { background-color: #ffebee; padding: 20px; border-left: 4px solid #f44336; margin: 20px 0; }
                .stack-trace { background-color: #f5f5f5; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px; overflow-x: auto; margin: 10px 0; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 class="title">⚠️ システムエラー</h1>
                    <p class="subtitle">羊飼いまるおか自動ブログ生成システム</p>
                </div>
                
                <div class="error-info">
                    <h2>🚨 ${title}</h2>
                    <p><strong>エラーメッセージ:</strong> ${message}</p>
                    <p><strong>発生時刻:</strong> ${currentTime}</p>
                </div>
                
                <div class="stack-trace">
                    <h3>スタックトレース:</h3>
                    <pre>${stack}</pre>
                </div>
                
                <div class="footer">
                    <p>🔧 システム管理者による確認が必要です</p>
                    <p>📧 このメールは自動送信されました</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    /**
     * 接続テスト
     */
    async testConnection() {
        try {
            console.log('🔌 Gmail API接続テスト中...');
            
            const authSuccess = await this.authenticate();
            if (!authSuccess) {
                return false;
            }

            // プロフィール取得でテスト
            const profile = await this.gmail.users.getProfile({ userId: 'me' });
            console.log(`✅ Gmail接続成功: ${profile.data.emailAddress}`);
            
            return true;

        } catch (error) {
            console.error('❌ Gmail接続テスト失敗:', error.message);
            return false;
        }
    }
}

module.exports = GmailIntegration;

/**
 * メイン実行関数（修正版）
 */
async function sendCompletionNotifications() {
    try {
        // 環境変数の存在確認
        if (!process.env.GMAIL_CREDENTIALS || !process.env.GMAIL_TOKEN) {
            console.log('⚠️ Gmail認証情報が設定されていません。Gmail機能をスキップします。');
            return;
        }

        console.log('📧 記事完成通知システム開始');
        console.log(`🔧 テストモード: ${process.env.TEST_MODE === 'true'}`);

        const gmail = new GmailIntegration();
        
        // 接続テスト
        const connectionSuccess = await gmail.testConnection();
        if (!connectionSuccess) {
            console.log('❌ Gmail接続テストに失敗しました');
            return;
        }

        // 処理結果ファイルの存在確認
        const processingDataPath = './data/processing_summary.json';
        
        if (!fs.existsSync(processingDataPath)) {
            console.log('⚠️ 処理結果ファイルが見つかりません');
            return;
        }

        // 処理結果を読み込み
        const processingData = JSON.parse(fs.readFileSync(processingDataPath, 'utf8'));
        
        // 処理結果の構造確認
        if (!processingData || !processingData.stats) {
            console.log('⚠️ 処理結果データが不完全です');
            return;
        }

        const stats = processingData.stats;
        
        // 成功した記事がある場合は通知送信
        if (stats.successCount && stats.successCount > 0) {
            const articleData = {
                title: `${stats.successCount}件の新規エピソード処理完了`,
                content: `システムが正常に動作し、${stats.successCount}件のエピソードを処理しました。詳細な転写テキストがNotionデータベースに保存されています。`,
                wordCount: stats.successCount,
                category: '自動処理完了'
            };

            const notificationSuccess = await gmail.sendArticleNotification(articleData);
            if (notificationSuccess) {
                console.log('✅ 記事完成通知を送信しました');
            } else {
                console.log('❌ 記事完成通知の送信に失敗しました');
            }
        }

        // エラーがある場合はエラー通知送信
        if (stats.errorCount && stats.errorCount > 0) {
            const errorInfo = {
                title: `${stats.errorCount}件の処理エラー`,
                message: `システム処理中に${stats.errorCount}件のエラーが発生しました。詳細な確認が必要です。`,
                stack: processingData.errors ? JSON.stringify(processingData.errors, null, 2) : 'エラー詳細なし'
            };

            const errorNotificationSuccess = await gmail.sendErrorNotification(errorInfo);
            if (errorNotificationSuccess) {
                console.log('✅ エラー通知を送信しました');
            } else {
                console.log('❌ エラー通知の送信に失敗しました');
            }
        }

        console.log('📧 Gmail統合処理完了');

    } catch (error) {
        console.error('❌ Gmail統合エラー:', error.message);
        console.error('スタックトレース:', error.stack);
    }
}

// 直接実行時の処理
if (require.main === module) {
    sendCompletionNotifications();
}
