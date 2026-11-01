import React, { useRef, useState } from 'react';
import { IonButton, IonIcon, IonSpinner, IonTextarea } from '@ionic/react';
import { chatbubbleEllipsesOutline, closeOutline, sendOutline } from 'ionicons/icons';
import { aiApi } from '../services/api';
import type { ChatMessageTurn } from '../types';
import './AiChatbot.css';

interface AiChatbotProps {
  /** Present only on Listing Detail - enables the price question and gives the AI context. */
  listingId?: string;
  /** True on Messages/chat screens, where a conversation's own composer
   *  would otherwise sit right under the bubble - nudges it up to clear
   *  the Send button. */
  raised?: boolean;
}

const GENERAL_QUICK_REPLIES = [
  'What should I check before buying?',
  'What documents should I ask for?',
  'What questions should I ask the seller?',
];

const LISTING_ONLY_QUICK_REPLY = 'Is this price reasonable?';

let turnId = 0;
const nextId = () => `turn-${(turnId += 1)}`;

/**
 * Floating chatbot, session-scoped - the conversation resets on reload, per
 * the brief ("doesn't need to persist across app restarts"). The backing
 * Q&A is still durably logged server-side in `ai_chatbot_logs` either way.
 */
const AiChatbot: React.FC<AiChatbotProps> = ({ listingId, raised }) => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatMessageTurn[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const quickReplies = listingId
    ? [...GENERAL_QUICK_REPLIES, LISTING_ONLY_QUICK_REPLY]
    : GENERAL_QUICK_REPLIES;

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;

    setTurns((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed }]);
    setInput('');
    setAsking(true);
    try {
      const { answer } = await aiApi.askChatbot(trimmed, listingId);
      setTurns((prev) => [...prev, { id: nextId(), role: 'assistant', text: answer }]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: err instanceof Error ? err.message : 'Could not reach the assistant. Try again in a moment.',
        },
      ]);
    } finally {
      setAsking(false);
      requestAnimationFrame(() => {
        const scroller = scrollerRef.current;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
    }
  };

  return (
    <>
      <button
        type="button"
        className={`ai-chatbot__fab${raised ? ' ai-chatbot__fab--raised' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={open}
      >
        <IonIcon icon={open ? closeOutline : chatbubbleEllipsesOutline} />
      </button>

      {open && (
        <div
          className={`ai-chatbot__panel${raised ? ' ai-chatbot__panel--raised' : ''}`}
          role="dialog"
          aria-label="KEZMOTO AI assistant"
        >
          <header className="ai-chatbot__head">
            <IonIcon icon={chatbubbleEllipsesOutline} />
            <span>Buying assistant</span>
          </header>

          <div className="ai-chatbot__scroller" ref={scrollerRef}>
            {turns.length === 0 && (
              <p className="ai-chatbot__intro kez-muted">
                Ask about anything to check before buying, documents, or negotiating - I'll answer with
                practical, safety-focused advice for buying a second-hand motorcycle in the Philippines.
              </p>
            )}
            {turns.map((turn) => (
              <div key={turn.id} className={`ai-chatbot__bubble ai-chatbot__bubble--${turn.role}`}>
                <p>{turn.text}</p>
              </div>
            ))}
            {asking && (
              <div className="ai-chatbot__bubble ai-chatbot__bubble--assistant ai-chatbot__bubble--loading">
                <IonSpinner name="dots" />
              </div>
            )}
          </div>

          {turns.length === 0 && (
            <div className="ai-chatbot__quick-replies">
              {quickReplies.map((reply) => (
                <button key={reply} type="button" onClick={() => void ask(reply)} disabled={asking}>
                  {reply}
                </button>
              ))}
            </div>
          )}

          <div className="ai-chatbot__composer">
            <IonTextarea
              className="ai-chatbot__input"
              value={input}
              placeholder="Ask a question"
              autoGrow
              rows={1}
              onIonInput={(e) => setInput(String(e.detail.value ?? ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
            />
            <IonButton
              className="kez-cta ai-chatbot__send"
              disabled={asking || input.trim() === ''}
              onClick={() => void ask(input)}
              aria-label="Send"
            >
              <IonIcon slot="icon-only" icon={sendOutline} />
            </IonButton>
          </div>
        </div>
      )}
    </>
  );
};

export default AiChatbot;
