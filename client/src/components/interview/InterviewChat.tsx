import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, Code2, Sparkles, X, ChevronRight, CornerDownLeft } from 'lucide-react';

export interface ChatMessage {
  id: string;
  sessionId?: number;
  sender: string;
  senderRole: 'interviewer' | 'candidate';
  text: string;
  timestamp: string;
  type?: 'text' | 'question_card';
  questionId?: number;
  title?: string;
  difficulty?: string;
}

export interface InterviewChatProps {
  messages: ChatMessage[];
  currentUserName: string;
  onSendMessage: (text: string) => void;
  onOpenQuestionCard?: (questionId: number) => void;
  isDrawer?: boolean;
  isOpen?: boolean;
  onCloseDrawer?: () => void;
  unreadCount?: number;
}

export default function InterviewChat({
  messages,
  currentUserName,
  onSendMessage,
  onOpenQuestionCard,
  isDrawer = false,
  isOpen = true,
  onCloseDrawer,
}: InterviewChatProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  if (isDrawer && !isOpen) return null;

  return (
    <div
      className={`flex flex-col bg-surface-900 border-surface-800 ${
        isDrawer
          ? 'fixed top-14 right-0 bottom-0 w-80 sm:w-96 z-40 shadow-2xl border-l animate-slide-left'
          : 'h-full border rounded-2xl overflow-hidden'
      }`}
    >
      {/* Chat Header */}
      <div className="flex-none h-14 px-4 bg-surface-850 border-b border-surface-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/25 flex items-center justify-center text-primary-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Live Chat</h3>
            <p className="text-[11px] text-surface-400">Session Discussion</p>
          </div>
        </div>

        {isDrawer && onCloseDrawer && (
          <button
            type="button"
            onClick={onCloseDrawer}
            className="p-1.5 rounded-lg text-surface-400 hover:text-white hover:bg-surface-800 transition-colors"
            title="Close Chat Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-surface-500">
            <MessageSquare className="w-8 h-8 mb-2 text-surface-600" />
            <p className="text-xs font-medium text-surface-400">No messages yet</p>
            <p className="text-[11px] text-surface-600 mt-0.5">
              Messages and shared problems from your interviewer will appear here.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderRole === 'candidate';

            // Question Card Message
            if (msg.type === 'question_card' && msg.questionId) {
              return (
                <div key={msg.id} className="animate-fade-in my-2">
                  <div className="p-3.5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-surface-800 to-indigo-950/40 border border-purple-500/30 shadow-md">
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-purple-300 bg-purple-500/15 border border-purple-500/25 px-2 py-0.5 rounded-full">
                        <Sparkles className="w-2.5 h-2.5 text-purple-400" /> Shared Problem
                      </span>
                      {msg.difficulty && (
                        <span className={`badge-${msg.difficulty} text-[10px] px-1.5 py-0`}>
                          {msg.difficulty}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-white mb-1.5">{msg.title || 'Coding Problem'}</h4>
                    <p className="text-[11px] text-surface-400 mb-3">
                      Your interviewer shared this problem for you to solve in the coding workspace.
                    </p>

                    <button
                      type="button"
                      onClick={() => msg.questionId && onOpenQuestionCard?.(msg.questionId)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-sm transition-all cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" /> Open in Code Editor <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </button>
                  </div>
                  <span className="block text-[10px] text-surface-500 mt-1 pl-1">
                    {msg.sender} · {msg.timestamp}
                  </span>
                </div>
              );
            }

            // Normal Text Message
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}>
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-surface-400">
                    {isMe ? 'You' : msg.sender}
                  </span>
                  <span className="text-[10px] text-surface-500">{msg.timestamp}</span>
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    isMe
                      ? 'bg-primary-600 text-white rounded-br-xs shadow-sm'
                      : 'bg-surface-800 text-surface-200 border border-surface-700/80 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="flex-none p-3 bg-surface-850 border-t border-surface-800">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-surface-900 border border-surface-700 rounded-xl px-3 py-2 text-xs text-white placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white transition-colors disabled:opacity-40 cursor-pointer shadow-sm"
            title="Send Message"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
