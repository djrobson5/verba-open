'use client';

import { useEffect } from 'react';

interface Message {
  role: 'user' | 'ai';
  text: string;
  timestamp?: Date;
}

interface ConversationViewProps {
  messages: Message[];
  languageName?: string;
}

export function ConversationView({ messages, languageName }: ConversationViewProps) {
  // The page (not this list) scrolls, and the session controls sit after the
  // transcript as a sticky bottom bar. Aligning the last message with the
  // viewport edge would leave it under that bar, so scroll the page all the
  // way down instead: there the bar rests in flow, below the last message,
  // whatever its height (warning strips stack on top of it).
  useEffect(() => {
    if (messages.length === 0) return;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand text-accent font-mono text-[12px] font-semibold uppercase tracking-[0.16em] mb-5">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-accent" />
            </span>
            LIVE
          </div>
          <p className="text-lg text-ink-soft leading-relaxed">
            Say something in <span className="text-ink font-medium">{languageName}</span> to begin.{' '}
            <span className="text-mute">Don&apos;t overthink it.</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-6 pr-1">
      <div className="space-y-6 max-w-3xl mx-auto">
        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          const prev = messages[i - 1];
          const showLabel = !prev || prev.role !== msg.role;
          return (
            <div
              key={i}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              {showLabel && (
                <p
                  className={`font-mono text-[12px] uppercase tracking-[0.16em] mb-1.5 ${
                    isUser ? 'text-mute pr-1' : 'text-brand pl-1'
                  }`}
                >
                  {isUser ? 'You' : 'Partner · Aoede'}
                </p>
              )}
              <div
                className={`max-w-[82%] px-5 py-3 text-[17px] leading-[1.55] rounded-ui ${
                  isUser
                    ? 'bg-brand text-white'
                    : 'bg-surface border border-rule text-ink'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
