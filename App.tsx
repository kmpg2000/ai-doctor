import React, { useState, useRef, useEffect } from 'react';
import { Message, UserLocation, AppStatus } from './types';
import { chatWithDoctor } from './services/geminiService';

const MAX_TURNS = 10;

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'こんにちは。AI総合病院の総合診療科へようこそ。\n本日はどのような症状でお悩みですか？\n体調や気になること、何でもお話しください。\n\n※画像も2枚まで拝見できます。',
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [location, setLocation] = useState<UserLocation | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate current turn count (user messages)
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const isLimitReached = userMessageCount >= MAX_TURNS;

  // Get user location on mount for better hospital search
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (err) => console.log("Location access denied or error:", err)
      );
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remainingSlots = 2 - attachedImages.length;
    const filesToProcess = Array.from(files).slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImages(prev => [...prev, reader.result as string]);
      };
      // Cast file to Blob as Array.from on FileList might infer unknown[] in some environments
      reader.readAsDataURL(file as Blob);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && attachedImages.length === 0) || status === AppStatus.THINKING || isLimitReached) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      images: attachedImages.length > 0 ? [...attachedImages] : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setAttachedImages([]);
    setStatus(AppStatus.THINKING);

    try {
      const currentHistory = messages; 

      const response = await chatWithDoctor(
        currentHistory, 
        userMsg.text, 
        userMsg.images, 
        location
      );

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response.text,
        groundingMetadata: response.groundingMetadata
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "申し訳ありません。通信エラーが発生しました。もう一度お試しください。"
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setStatus(AppStatus.IDLE);
    }
  };

  // Helper to render Maps Grounding
  const renderGrounding = (metadata: any) => {
    if (!metadata || !metadata.groundingChunks) return null;
    
    // Filter for map chunks
    const mapChunks = metadata.groundingChunks.filter((c: any) => c.web?.uri && c.web.uri.includes('google.com/maps'));
    
    if (mapChunks.length === 0) return null;

    return (
      <div className="mt-3 grid gap-2">
        <p className="text-xs font-bold text-gray-500">参照された医療機関:</p>
        {mapChunks.map((chunk: any, i: number) => (
          <a 
            key={i} 
            href={chunk.web?.uri} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block bg-white border border-gray-200 p-3 rounded-lg hover:shadow-md transition-shadow flex items-start gap-3"
          >
            <div className="bg-red-50 text-red-500 p-2 rounded-full">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </div>
            <div>
              <div className="font-bold text-blue-700 text-sm">{chunk.web?.title || 'Google Maps'}</div>
              <div className="text-xs text-gray-500 mt-1">地図で見る ↗</div>
            </div>
          </a>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-800 font-sans">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 shadow-sm sticky top-0 z-10">
        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-200">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
        </div>
        <div className="flex-1">
          <h1 className="font-bold text-lg text-slate-800 leading-tight">AI 総合病院</h1>
          <p className="text-xs text-slate-500">総合診療科 / 24時間対応</p>
        </div>
        <div className="flex flex-col items-end gap-1">
           {location && (
            <div className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
              位置情報ON
            </div>
          )}
          <div className={`text-[10px] font-bold px-2 py-1 rounded-full border ${isLimitReached ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            診察回数: {userMessageCount}/{MAX_TURNS}
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex max-w-[85%] md:max-w-[70%] gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-slate-200' : 'bg-blue-100'}`}>
                {msg.role === 'user' ? (
                   <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                ) : (
                   <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                )}
              </div>

              {/* Bubble */}
              <div className={`
                message-bubble p-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap
                ${msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none'}
              `}>
                {/* Images in User Message */}
                {msg.images && msg.images.length > 0 && (
                  <div className="flex gap-2 mb-3">
                    {msg.images.map((img, idx) => (
                      <img key={idx} src={img} alt="attached" className="h-32 rounded-lg object-cover border border-white/20" />
                    ))}
                  </div>
                )}
                
                {/* Text Content */}
                {msg.text}

                {/* Grounding Content (Maps) */}
                {renderGrounding(msg.groundingMetadata)}
              </div>
            </div>
          </div>
        ))}
        
        {/* Thinking Indicator */}
        {status === AppStatus.THINKING && (
          <div className="flex justify-start">
            <div className="flex gap-3">
               <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
               </div>
               <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
               </div>
            </div>
          </div>
        )}

        {/* Limit Reached Notification */}
        {isLimitReached && (
          <div className="flex justify-center my-4">
             <div className="bg-slate-800 text-white text-sm px-6 py-3 rounded-full shadow-lg text-center">
               本日の診察（チャット）は終了しました。<br/>
               新たなご相談はページを更新してください。
             </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-slate-200 p-3 md:p-4 sticky bottom-0 z-20">
        
        {isLimitReached ? (
           // Limit Reached State
           <div className="max-w-4xl mx-auto flex items-center justify-center">
              <button 
                onClick={() => window.location.reload()}
                className="bg-slate-600 text-white px-6 py-3 rounded-full font-bold shadow-md hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                新しい診察を始める（リロード）
              </button>
           </div>
        ) : (
          <>
            {/* Image Preview Area */}
            {attachedImages.length > 0 && (
              <div className="flex gap-3 mb-3 px-1 overflow-x-auto pb-2">
                {attachedImages.map((img, i) => (
                  <div key={i} className="relative group">
                    <img src={img} alt="preview" className="h-20 w-20 object-cover rounded-lg border border-slate-300 shadow-sm" />
                    <button 
                      onClick={() => removeImage(i)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md hover:scale-110 transition-transform"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-2 md:gap-4">
              
              {/* Image Upload Button */}
              <div className="relative">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept="image/*" 
                  multiple 
                  className="hidden" 
                  onChange={handleImageUpload}
                  disabled={attachedImages.length >= 2 || status === AppStatus.THINKING}
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachedImages.length >= 2 || status === AppStatus.THINKING}
                  className={`
                    p-3 rounded-full transition-colors flex items-center justify-center
                    ${attachedImages.length >= 2 
                      ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-blue-600'}
                  `}
                  title="画像を添付 (最大2枚)"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  {attachedImages.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {attachedImages.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Text Input */}
              <div className="flex-1 bg-slate-100 rounded-2xl flex items-center px-4 py-2 focus-within:ring-2 focus-within:ring-blue-300 transition-shadow">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={status === AppStatus.THINKING ? "AIドクターが考え中..." : "症状や相談内容を入力..."}
                  className="w-full bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 py-2 disabled:opacity-50"
                  disabled={status === AppStatus.THINKING}
                />
              </div>

              {/* Send Button */}
              <button 
                type="submit"
                disabled={(!inputText.trim() && attachedImages.length === 0) || status === AppStatus.THINKING}
                className={`
                  p-3 rounded-full shadow-lg transition-all transform active:scale-95 flex items-center justify-center
                  ${(!inputText.trim() && attachedImages.length === 0) || status === AppStatus.THINKING 
                    ? 'bg-slate-300 text-white cursor-not-allowed' 
                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200'}
                `}
              >
                <svg className="w-5 h-5 translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </form>
          </>
        )}
        <div className="text-center mt-2">
           <p className="text-[10px] text-slate-400">※AIの回答は参考情報です。医療機関の受診に代わるものではありません。</p>
        </div>
      </footer>
    </div>
  );
};

export default App;