import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, useIonRouter } from '@ionic/react';
import { chatbubblesOutline, chevronForwardOutline } from 'ionicons/icons';
import AppPage from '../components/AppPage';
import Avatar from '../components/Avatar';
import ChatPanel from '../components/ChatPanel';
import { EmptyState, ErrorState, LoadingRows } from '../components/StateViews';
import { useAsync } from '../hooks/useAsync';
import { useBreakpoint } from '../hooks/useBreakpoint';
import { useAuth } from '../context/AuthContext';
import { useMarketplace } from '../context/MarketplaceContext';
import { chatsApi } from '../services/api';
import type { ChatThread } from '../types';
import { formatRelative } from '../utils/format';
import './Messages.css';

/**
 * Inbox. Single pane on mobile (tapping pushes the chat route); split into
 * list + thread from tablet width up.
 */
const Messages: React.FC = () => {
  const router = useIonRouter();
  const { user } = useAuth();
  const { revision } = useMarketplace();
  const breakpoint = useBreakpoint();
  const isSplit = breakpoint !== 'mobile';

  const { data, loading, error, reload } = useAsync<ChatThread[]>(
    () => chatsApi.listThreads(),
    [revision]
  );

  const threads = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [data]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep a valid selection in the split layout.
  useEffect(() => {
    if (!isSplit) return;
    if (threads.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !threads.some((t) => t.id === selectedId)) {
      setSelectedId(threads[0].id);
    }
  }, [isSplit, threads, selectedId]);

  const openThread = (thread: ChatThread) => {
    if (isSplit) setSelectedId(thread.id);
    else router.push(`/chat/${thread.id}`, 'forward');
  };

  const lastMessageOf = (thread: ChatThread) => {
    const last = thread.messages[thread.messages.length - 1];
    if (!last) return 'No messages yet';
    const prefix = last.senderId === user?.id ? 'You: ' : '';
    return `${prefix}${last.body || (last.imageUrl ? '📷 Photo' : '')}`;
  };

  const list = (
    <div className="messages__list">
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          className={`messages__row${selectedId === thread.id && isSplit ? ' is-selected' : ''}`}
          onClick={() => openThread(thread)}
        >
          <Avatar
            name={thread.participant.name}
            color={thread.participant.avatarColor}
            imageUrl={thread.participant.avatarUrl}
          />
          <span className="messages__row-body">
            <span className="messages__row-top">
              <span className="messages__row-name">
                <strong>{thread.participant.name}</strong>
                {thread.assignedAdmin && (
                  <span
                    className="kez-chip kez-chip--warning messages__middleman-chip"
                    title="A KEZMOTO admin has joined this conversation as middleman - messages here aren't only between the two of you."
                  >
                    Middleman
                  </span>
                )}
              </span>
              <time>{formatRelative(thread.updatedAt)}</time>
            </span>
            {thread.listingTitle && <em>{thread.listingTitle}</em>}
            <span className="messages__preview">{lastMessageOf(thread)}</span>
          </span>
          {thread.unreadCount > 0 && <span className="messages__badge">{thread.unreadCount}</span>}
          <IonIcon className="messages__chevron kez-only-mobile" icon={chevronForwardOutline} />
        </button>
      ))}
    </div>
  );

  return (
    <AppPage title="Messages" className="messages-page" bleed={isSplit}>
      {loading && <LoadingRows rows={5} layout="list" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && threads.length === 0 && (
        <EmptyState
          icon={chatbubblesOutline}
          title="No conversations yet"
          message="Tap Send Message on any unit to start a thread with its seller."
          actionLabel="Browse units"
          onAction={() => router.push('/home', 'none', 'replace')}
        />
      )}

      {!loading && !error && threads.length > 0 && (
        <>
          {!isSplit && list}

          {isSplit && (
            <div className="messages__split">
              <aside className="kez-tile kez-tile--flush messages__pane">{list}</aside>
              <section className="kez-tile kez-tile--flush messages__thread">
                {selectedId ? (
                  <ChatPanel threadId={selectedId} />
                ) : (
                  <EmptyState
                    icon={chatbubblesOutline}
                    title="Pick a conversation"
                    message="Select a thread on the left to read it here."
                  />
                )}
              </section>
            </div>
          )}
        </>
      )}
    </AppPage>
  );
};

export default Messages;
