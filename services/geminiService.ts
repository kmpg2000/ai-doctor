import { GoogleGenAI, Content, Part } from "@google/genai";
import { Message, UserLocation } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found");
  }
  return new GoogleGenAI({ apiKey });
};

// 履歴の最大保持数（トークン節約とレスポンス向上のため）
// 直近10メッセージ（5往復分）のみを記憶として送信する
const MAX_HISTORY_MESSAGES = 10;

export const chatWithDoctor = async (
  history: Message[], 
  newMessage: string, 
  images: string[] = [],
  location: UserLocation | null
): Promise<{ text: string; groundingMetadata?: any }> => {
  const ai = getClient();

  // 1. 履歴の切り詰め (Sliding Window)
  // 配列の末尾から MAX_HISTORY_MESSAGES 分だけを取得
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);

  // 2. コンテンツの構築
  const contents: Content[] = recentHistory.map((msg, index) => {
    // 基本テキストは維持
    const parts: Part[] = [{ text: msg.text }];

    // 3. 画像データの最適化 (Optimization)
    // 過去の会話に含まれるBase64画像を毎回全て送るとデータ量が膨大になるため、
    // 「履歴の最後の方（直近2メッセージ以内）」にある画像だけを再送信する。
    // それ以前の画像は診断済みとみなし、テキスト履歴のみで文脈を維持する。
    const isRecentWithImage = index >= recentHistory.length - 2;

    if (msg.images && msg.images.length > 0 && isRecentWithImage) {
        msg.images.forEach(img => {
            // 画像データが存在する場合のみ追加
            if (img.startsWith('data:')) {
                const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
                const mimeMatch = img.match(/^data:(image\/\w+);base64,/);
                const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
                
                parts.push({
                    inlineData: {
                        mimeType,
                        data: base64Data
                    }
                });
            }
        });
    }

    return {
      role: msg.role,
      parts: parts
    };
  });

  // 今回の新しいメッセージを追加
  const currentParts: Part[] = [{ text: newMessage }];
  
  // 今回添付された画像は必ず送信
  images.forEach(img => {
    const base64Data = img.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = img.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    currentParts.push({
      inlineData: {
        mimeType,
        data: base64Data
      }
    });
  });

  contents.push({
    role: 'user',
    parts: currentParts
  });

  // Google Maps Tool Configuration
  let tools = [{ googleMaps: {} }];
  let toolConfig = {};

  if (location) {
    toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: location.latitude,
          longitude: location.longitude
        }
      }
    };
  }

  const systemInstruction = `
    あなたは日本で最も有名な総合病院のベテラン総合診療医です。
    
    【重要：回答のスタイル】
    - **短く、簡潔に**答えてください。長文は避けてください。
    - 専門用語はなるべく使わず、誰にでもわかる言葉で話してください。
    - 1回の回答で情報を詰め込みすぎず、会話のキャッチボールを大切にしてください。

    【あなたの役割】
    1. 患者（ユーザー）に優しく寄り添う。
    2. 症状を聞き出し、可能性のある原因を考える。
    3. 必要に応じて病院検索ツール（Google Maps）で近くの病院を紹介する。
    4. 画像が送られた場合は、その見た目から所見を述べる。

    ※緊急性が高い（胸痛、呼吸困難など）場合は、すぐに救急車を呼ぶよう伝えてください。
    ※あなたはAIなので確定診断はできません。あくまでアドバイスにとどめてください。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        tools: tools,
        toolConfig: location ? toolConfig : undefined,
      }
    });

    const responseText = response.text || "";
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

    if (!responseText && !groundingMetadata) {
        return { text: "すみません、うまく聞き取れませんでした。もう一度教えていただけますか？" };
    }

    return {
      text: responseText,
      groundingMetadata: groundingMetadata
    };

  } catch (error) {
    console.error("Chat Error:", error);
    throw new Error("通信エラーが発生しました。もう一度お試しください。");
  }
};