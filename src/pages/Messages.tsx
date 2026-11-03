import React, { useEffect, useMemo, useState } from 'react';
import { IonIcon, useIonRouter } from '@ionic/react';
import { archiveOutline, chatbubblesOutline, chevronForwardOutline } from 'ionicons/icons';
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
import { isArchivedThread } from '../utils/archive';
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
  // The viewer's own archive list; ChatPanel's Archive button calls
  // invalidate(), which bumps `revision` and reloads both.
  const { data: archived } = useAsync<Map<string, string>>(() => chatsApi.listArchived(), [revision]);
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  const allThreads = useMemo(
    () =>
      [...(data ?? [])].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [data]
  );
  const archivedThreads = useMemo(
    () => allThreads.filter((t) => isArchivedThread(t, archived?.get(t.id))),
    [allThreads, archived]
  );
  const activeThreads = useMemo(
    () => allThreads.filter((t) => !isArchivedThread(t, archived?.get(t.id))),
    [allThreads, archived]
  );
  const threads = tab === 'archived' ? archivedThreads : activeThreads;

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

  const unread = (list: ChatThread[]) => list.some((t) => t.unreadCount > 0);

  const tabs = (
    <div className="messages__tabs" role="tablist" aria-label="Conversations">
      {(
        [
          ['active', 'Active', activeThreads],
          ['archived', 'Archived', archivedThreads],
        ] as const
      ).map(([id, label, list]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          className={`messages__tab${tab === id ? ' is-active' : ''}`}
          onClick={() => setTab(id)}
        >
          {label}
          <span className="messages__tab-count">{list.length}</span>
          {unread(list) && <span className="messages__tab-dot" aria-label="has unread messages" />}
        </button>
      ))}
    </div>
  );

  const list = (
    <div className="messages__list">
      {tabs}
      {threads.length === 0 && (
        <p className="messages__tab-empty">
          {tab === 'archived'
            ? 'No archived chats. Archive a conversation to tidy your inbox - it comes back here if a new message arrives.'
            : 'No active chats. Archived conversations are in the Archived tab.'}
        </p>
      )}
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

      {!loading && !error && allThreads.length === 0 && (
        <EmptyState
          icon={chatbubblesOutline}
          title="No conversations yet"
          message="Tap Send Message on any unit to start a thread with its seller."
          actionLabel="Browse units"
          onAction={() => router.push('/home', 'none', 'replace')}
        />
      )}

      {!loading && !error && allThreads.length > 0 && (
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
                    icon={tab === 'archived' ? archiveOutline : chatbubblesOutline}
                    title={tab === 'archived' ? 'No archived chats' : 'Pick a conversation'}
                    message={
                      tab === 'archived'
                        ? 'Chats you archive appear here.'
                        : 'Select a thread on the left to read it here.'
                    }
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
