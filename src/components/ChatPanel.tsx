import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IonButton, IonIcon, IonTextarea, useIonToast, useIonRouter } from '@ionic/react';
import {
  addOutline,
  arrowBackOutline,
  checkmarkDoneOutline,
  closeCircle,
  flagOutline,
  happyOutline,
  imageOutline,
  informationCircleOutline,
  openOutline,
  sendOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import Avatar from './Avatar';
import OfferBar from './OfferBar';
import OfferModal from './OfferModal';
import ReportUserModal from './ReportUserModal';
import TransactionTracker from './TransactionTracker';
import { ErrorState, LoadingChat } from './StateViews';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useMarketplace } from '../context/MarketplaceContext';
import { confirmAction } from '../lib/sweetAlert';
import { chatsApi, listingsApi, notificationsApi, transactionsApi } from '../services/api';
import type { ChatThread, Transaction } from '../types';
import { EMOJIS } from '../utils/emojis';
import { formatPrice, formatTime } from '../utils/format';
import { offerStateFor } from '../utils/offers';
import './ChatPanel.css';

interface ChatPanelProps {
  threadId: string;
  /** Body to drop into the composer on open (the default enquiry). */
  prefill?: string;
  /** Rendered as a back arrow in the panel header (mobile / narrow layouts). */
  onBack?: () => void;
}

/**
 * A single conversation: bubbles, composer and the Request Middleman action.
 * Used full-screen on mobile and as the right pane of Messages on wider screens.
 */
const ChatPanel: React.FC<ChatPanelProps> = ({ threadId, prefill, onBack }) => {
  const { user, isAdmin } = useAuth();
  const { invalidate } = useMarketplace();
  const router = useIonRouter();
  const [present] = useIonToast();

  const { data, loading, error, reload } = useAsync<ChatThread>(
    () => chatsApi.getThread(threadId),
    [threadId]
  );

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [body, setBody] = useState(prefill ?? '');
  const [sending, setSending] = useState(false);
  const [showEmojiRow, setShowEmojiRow] = useState(false);
  // Messenger-style "+" tray: Photo and Emoji live behind one button.
  const [trayOpen, setTrayOpen] = useState(false);
  // Messenger-style field: a pill on one line, a rounded box once it wraps.
  const [multiline, setMultiline] = useState(false);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [markingSold, setMarkingSold] = useState(false);
  const [offerModal, setOfferModal] = useState<'offer' | 'counter' | 'sold' | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [listedPrice, setListedPrice] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLIonTextareaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) {
      setThread(data);
      void chatsApi.markRead(data.id);
    }
  }, [data]);

  // A transaction only exists once a middleman has been requested for this chat.
  useEffect(() => {
    let ignore = false;
    transactionsApi
      .getByChatId(threadId)
      .then((tx) => {
        if (!ignore) setTransaction(tx);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [threadId, thread?.middlemanRequested]);

  // The listed price, for the offer bar and "Sold for how much?".
  useEffect(() => {
    const listingId = data?.listingId;
    if (!listingId) {
      setListedPrice(null);
      return;
    }
    let ignore = false;
    listingsApi
      .getById(listingId)
      .then((listing) => {
        if (!ignore) setListedPrice(listing.price);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [data?.listingId]);

  // Live updates once a transaction exists — this is how an admin's
  // commission confirm/reject (or any other status move) reaches the
  // tracker without the customer refreshing the page.
  useEffect(() => {
    if (!transaction?.id) return;
    return transactionsApi.subscribeToTransaction(transaction.id, setTransaction);
  }, [transaction?.id]);

  /* Live thread: Supabase pushes every INSERT on this chat_id, so the other
     side's messages land without a refresh. Our own send already appended
     optimistically, hence the duplicate guard. */
  useEffect(() => {
    if (!threadId) return;
    return chatsApi.subscribeToMessages(threadId, (message) => {
      setThread((prev) => {
        if (!prev || prev.id !== message.threadId) return prev;
        if (prev.messages.some((existing) => existing.id === message.id)) return prev;
        // Offer/accept/sold lines change the deal; pick up its new state,
        // including the very first offer that created it.
        if (message.system) {
          void transactionsApi.getByChatId(threadId).then((tx) => tx && setTransaction(tx));
        }
        return { ...prev, messages: [...prev.messages, message], updatedAt: message.sentAt };
      });
      void chatsApi.markRead(threadId);
    });
  }, [threadId]);

  // Reset the composer whenever a different thread is opened.
  useEffect(() => {
    setBody(prefill ?? '');
    clearPendingImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, prefill]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setMultiline(entry.contentRect.height > 46));
    observer.observe(el);
    return () => observer.disconnect();
    // Re-attach once the composer exists (after the thread loads).
  }, [thread?.id]);

  useEffect(() => {
    if (!trayOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!composerBoxRef.current?.contains(event.target as Node)) setTrayOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTrayOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [trayOpen]);

  const messages = useMemo(() => thread?.messages ?? [], [thread]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length, threadId]);

  const send = async () => {
    const text = body.trim();
    if ((!text && !pendingImage) || !thread || !user) return;
    setSending(true);
    try {
      const message = await chatsApi.sendMessage(thread.id, user.id, text, pendingImage ?? undefined);
      setThread({ ...thread, messages: [...thread.messages, message], updatedAt: message.sentAt });
      setBody('');
      clearPendingImage();
      void notificationsApi.create({
        recipientId: thread.participant.id,
        type: 'message',
        title: user.name,
        body: text || 'Sent a photo',
        link: `/chat/${thread.id}`,
      });
    } catch (err) {
      await present({
        message: err instanceof Error ? err.message : 'Message could not be sent.',
        duration: 2200,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setSending(false);
    }
  };

  const pickImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    setPendingImage(file);
    setPendingImageUrl(URL.createObjectURL(file));
  };

  const clearPendingImage = () => {
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    setPendingImage(null);
    setPendingImageUrl(null);
  };

  /**
   * Seller closes the sale at the final price (from "Sold for how much?",
   * prefilled with the agreed offer). Rejects so the modal can show errors.
   */
  const markAsSold = async (price: number) => {
    if (!thread?.listingId || !user) return;
    setMarkingSold(true);
    try {
      await listingsApi.update(thread.listingId, { status: 'sold' });
      // The listing is already sold either way; failing to also close the
      // deal record shouldn't surface as "could not mark as sold".
      const closed = await transactionsApi
        .recordDirectSale({
          chatId: thread.id,
          listingId: thread.listingId,
          buyerId: thread.participant.id,
          sellerId: user.id,
          agreedPrice: price,
        })
        .catch((err: unknown) => {
          console.error('Could not record the direct-sale transaction.', err);
          return null;
        });
      if (closed) setTransaction(closed);
      await chatsApi.postSystemMessage(thread.id, `Marked as sold for ${formatPrice(price)}.`);
      invalidate();
      void notificationsApi.create({
        recipientId: thread.participant.id,
        type: 'listing_sold',
        title: 'Listing marked sold',
        body: `${thread.listingTitle ?? 'A unit'} was sold for ${formatPrice(price)}.`,
        link: `/listing/${thread.listingId}`,
      });
      setThread(await chatsApi.getThread(thread.id));
      void present({ message: 'Marked as sold.', duration: 1800, color: 'success', position: 'top' });
    } finally {
      setMarkingSold(false);
    }
  };

  /* ---------------- Price offers ----------------
     Either side offers a price; only the other side can accept it. Each
     step also posts a system line so the chat itself tells the story. */
  const parties = () => {
    if (!thread || !user) return null;
    const sellerId = thread.isOwnListing ? user.id : thread.participant.id;
    const buyerId = thread.isOwnListing ? thread.participant.id : user.id;
    return { sellerId, buyerId };
  };

  const announce = async (text: string, notifyTitle: string) => {
    if (!thread) return;
    await chatsApi.postSystemMessage(thread.id, text);
    void notificationsApi.create({
      recipientId: thread.participant.id,
      type: 'message',
      title: notifyTitle,
      body: text,
      link: `/chat/${thread.id}`,
    });
  };

  const submitOffer = async (price: number) => {
    const ids = parties();
    if (!thread || !user || !ids) return;
    const tx = await transactionsApi.makeOffer({
      chatId: thread.id,
      listingId: thread.listingId,
      price,
      ...ids,
    });
    setTransaction(tx);
    await announce(
      `${user.name} offered ${formatPrice(price)}${listedPrice != null ? ` (listed ${formatPrice(listedPrice)})` : ''}.`,
      'New price offer'
    );
  };

  const runOfferAction = async (action: () => Promise<void>, failure: string) => {
    setOfferBusy(true);
    try {
      await action();
    } catch (err) {
      void present({
        message: err instanceof Error ? err.message : failure,
        duration: 2600,
        color: 'danger',
        position: 'top',
      });
    } finally {
      setOfferBusy(false);
    }
  };

  const acceptOffer = () =>
    runOfferAction(async () => {
      if (!transaction || transaction.proposedPrice == null || !user) return;
      const price = transaction.proposedPrice;
      setTransaction(await transactionsApi.acceptOffer(transaction));
      await announce(`${user.name} accepted ${formatPrice(price)}. Agreed price: ${formatPrice(price)}.`, 'Offer accepted');
    }, 'Could not accept the offer.');

  const clearOffer = (withdraw: boolean) =>
    runOfferAction(async () => {
      if (!transaction || !user) return;
      setTransaction(await transactionsApi.clearOffer(transaction.id));
      await announce(
        withdraw ? `${user.name} withdrew their offer.` : `${user.name} declined the offer.`,
        withdraw ? 'Offer withdrawn' : 'Offer declined'
      );
    }, 'Could not update the offer.');

  /* Same cursor-aware insert as UnitForm's Description field: splices at
     the composer's current cursor position when the native textarea is
     reachable, otherwise appends at the end. */
  const insertEmoji = async (emoji: string) => {
    const textarea = await composerRef.current?.getInputElement().catch(() => undefined);
    const start = textarea?.selectionStart ?? body.length;
    const end = textarea?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);

    const cursor = start + emoji.length;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  };

  const requestMiddleman = () =>
    confirmAction({
      title: 'Request a middleman?',
      text: 'A KEZMOTO admin will be asked to join this thread and handle the hand-off.',
      confirmText: 'Request',
    }).then((confirmed) => {
      if (!confirmed) return;
      void chatsApi
        .requestMiddleman(threadId)
        .then((updated) => {
          setThread(updated);
          return transactionsApi.getByChatId(threadId);
        })
        .then((tx) => {
          setTransaction(tx);
          void present({
            message: 'Middleman requested.',
            duration: 2000,
            color: 'success',
            position: 'top',
          });
        })
        .catch((err: unknown) => {
          void present({
            message: err instanceof Error ? err.message : 'Could not request a middleman.',
            duration: 2600,
            color: 'danger',
            position: 'top',
          });
        });
    });

  if (loading) {
    return (
      <div className="chat chat--state">
        <LoadingChat />
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="chat chat--state">
        <ErrorState message={error ?? 'That conversation could not be opened.'} onRetry={reload} />
      </div>
    );
  }

  // Looks a message's sender up among every party in the thread (buyer,
  // seller, and the admin once one has joined) — `thread.participant` only
  // ever names "the other side of the deal", which isn't enough once a
  // middleman makes this a three-way conversation.
  const partyFor = (senderId: string) => thread.parties.find((party) => party.id === senderId);

  return (
    <div className="chat">
      <header className="chat__header">
        {onBack && (
          <button type="button" className="chat__back" onClick={onBack} aria-label="Back to inbox">
            <IonIcon icon={arrowBackOutline} />
          </button>
        )}
        <button
          type="button"
          className="chat__who"
          onClick={() => router.push(`/profile/${thread.participant.id}`, 'forward')}
        >
          <Avatar
            name={thread.participant.name}
            color={thread.participant.avatarColor}
            imageUrl={thread.participant.avatarUrl}
            size="sm"
          />
          <div>
            <strong>{thread.participant.name}</strong>
            <span>{thread.participant.role === 'admin' ? 'KEZMOTO admin' : 'Customer'}</span>
          </div>
        </button>
        <IonButton
          size="small"
          fill="outline"
          className="chat__view-profile"
          onClick={() => router.push(`/profile/${thread.participant.id}`, 'forward')}
        >
          View Profile
        </IonButton>
        {thread.hasBuyer && (
          <IonButton
            size="small"
            fill={thread.middlemanRequested ? 'solid' : 'outline'}
            color={thread.middlemanRequested ? 'success' : 'primary'}
            disabled={thread.middlemanRequested}
            onClick={requestMiddleman}
            className="chat__middleman"
          >
            <IonIcon slot="start" icon={shieldCheckmarkOutline} />
            {thread.middlemanRequested ? 'Middleman requested' : 'Request Middleman'}
          </IonButton>
        )}
        {!isAdmin && thread.participant.role !== 'admin' && (
          <IonButton
            size="small"
            fill="outline"
            color="danger"
            className="chat__report"
            onClick={() => setReportOpen(true)}
            aria-label={`Report ${thread.participant.name}`}
          >
            <IonIcon slot="icon-only" icon={flagOutline} />
          </IonButton>
        )}
      </header>

      <ReportUserModal isOpen={reportOpen} onClose={() => setReportOpen(false)} thread={thread} />

      {thread.listingId && (
        <div className="chat__listing-row">
          <button
            type="button"
            className="chat__listing"
            onClick={() => router.push(`/listing/${thread.listingId}`, 'forward')}
          >
            {thread.listingPhoto && <img src={thread.listingPhoto} alt="" />}
            <span>
              <small>About this unit</small>
              <strong>{thread.listingTitle}</strong>
            </span>
          </button>
          {thread.isOwnListing && thread.listingStatus !== 'sold' && (
            <IonButton
              size="small"
              fill="outline"
              color="success"
              className="chat__mark-sold"
              disabled={markingSold}
              onClick={() => setOfferModal('sold')}
            >
              <IonIcon slot="start" icon={checkmarkDoneOutline} />
              Mark as Sold
            </IonButton>
          )}
        </div>
      )}

      {!isAdmin && thread.hasBuyer && thread.listingId && thread.listingStatus !== 'sold' && (
        <OfferBar
          state={offerStateFor(transaction, user?.id)}
          transaction={transaction}
          listedPrice={listedPrice}
          otherName={thread.participant.name}
          busy={offerBusy}
          onOffer={() => setOfferModal('offer')}
          onCounter={() => setOfferModal('counter')}
          onAccept={() => void acceptOffer()}
          onDecline={() => void clearOffer(false)}
          onWithdraw={() => void clearOffer(true)}
        />
      )}

      <OfferModal
        isOpen={offerModal !== null}
        onClose={() => setOfferModal(null)}
        title={
          offerModal === 'sold' ? 'Sold for how much?' : offerModal === 'counter' ? 'Counter offer' : 'Make an offer'
        }
        hint={
          offerModal === 'sold'
            ? 'Enter the final price you sold it for. This is the price recorded for the deal and its commission.'
            : `${thread.participant.name} can accept, counter or decline. Nothing is final until it is accepted.`
        }
        confirmLabel={offerModal === 'sold' ? 'Mark as sold' : 'Send offer'}
        listedPrice={listedPrice}
        initialPrice={
          offerModal === 'sold'
            ? (transaction?.agreedPrice ?? transaction?.proposedPrice ?? listedPrice)
            : null
        }
        onSubmit={offerModal === 'sold' ? markAsSold : submitOffer}
      />

      {transaction && isAdmin && transaction.adminId === user?.id && (
        <div className="chat__listing-row">
          <div className="chat__listing chat__listing--static">
            <span>
              <small>Middleman working screen</small>
            </span>
          </div>
          <IonButton
            size="small"
            fill="outline"
            color="primary"
            className="chat__open-transaction"
            onClick={() => router.push(`/admin/transactions/${transaction.id}`, 'forward')}
          >
            <IonIcon slot="start" icon={openOutline} />
            Open transaction detail
          </IonButton>
        </div>
      )}

      {!isAdmin && thread.middlemanRequested && !transaction?.adminId && (
        <div className="chat__waiting" role="status">
          <span className="chat__waiting-dot" aria-hidden="true" />
          <span>
            <strong>Waiting for a KEZMOTO admin to join.</strong> All admins were notified; you can keep
            chatting meanwhile.
          </span>
        </div>
      )}

      {transaction && !isAdmin && transaction.adminId && (
        <button
          type="button"
          className="chat__listing"
          onClick={() => router.push(`/profile/${transaction.adminId}`, 'forward')}
        >
          <Avatar name={transaction.adminName ?? 'Admin'} size="sm" />
          <span>
            <small>Your assigned middleman</small>
            <strong>{transaction.adminName ?? 'View admin profile'}</strong>
          </span>
          <IonIcon icon={openOutline} />
        </button>
      )}

      {transaction && !isAdmin && (
        <div className="chat__tracker">
          <TransactionTracker
            transaction={transaction}
            onReviewed={() => void transactionsApi.getByChatId(threadId).then(setTransaction)}
          />
        </div>
      )}

      <div className="chat__scroller" ref={scrollerRef}>
        {messages.length === 0 && (
          <p className="chat__empty">
            No messages yet — say hello and ask whatever you need to know about the unit.
          </p>
        )}

        {messages.map((message) => {
          if (message.system) {
            return (
              <div className="chat__system" key={message.id}>
                <IonIcon icon={informationCircleOutline} />
                {message.body}
              </div>
            );
          }

          const mine = message.senderId === user?.id;
          const sender = mine ? undefined : partyFor(message.senderId);
          const senderIsAdmin = sender ? sender.role === 'admin' : message.senderRole === 'admin';
          const senderName = sender?.name ?? (senderIsAdmin ? 'KEZMOTO admin' : 'KEZMOTO rider');

          return (
            <div
              key={message.id}
              className={`chat__bubble${mine ? ' chat__bubble--mine' : ''}`}
            >
              {!mine && (
                <div className="chat__bubble-sender">
                  <Avatar
                    name={senderName}
                    color={sender?.avatarColor ?? '#ff6a00'}
                    imageUrl={sender?.avatarUrl}
                    size="sm"
                  />
                  <span className="chat__bubble-sender-name">{senderName}</span>
                  {senderIsAdmin && <span className="chat__bubble-sender-role">Middleman</span>}
                </div>
              )}
              {message.imageUrl && (
                <img
                  className="chat__bubble-image"
                  src={message.imageUrl}
                  alt="Attachment"
                  onClick={() => window.open(message.imageUrl, '_blank', 'noopener')}
                />
              )}
              {message.body && <p>{message.body}</p>}
              <time>{formatTime(message.sentAt)}</time>
            </div>
          );
        })}
      </div>

      {showEmojiRow && (
        <div className="chat__emoji-row" role="group" aria-label="Insert emoji">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void insertEmoji(emoji)}
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {pendingImageUrl && (
        <div className="chat__pending-image">
          <img src={pendingImageUrl} alt="Selected attachment" />
          <button type="button" onClick={clearPendingImage} aria-label="Remove attachment">
            <IonIcon icon={closeCircle} />
          </button>
        </div>
      )}

      {/* Messenger layout: [+]  [ message field ]  [send]. The field grows
          upward; + and send stay pinned to its last line. */}
      <div
        ref={composerBoxRef}
        className={`chat__composer${multiline ? ' is-multiline' : ''}`}
      >
        {trayOpen && (
          <div className="chat__popup" role="menu" aria-label="Add to message">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setTrayOpen(false);
                imageInputRef.current?.click();
              }}
            >
              <span className="chat__popup-icon">
                <IonIcon icon={imageOutline} aria-hidden="true" />
              </span>
              <span>
                <strong>Photo</strong>
                <small>Send a picture from your device</small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              aria-pressed={showEmojiRow}
              onClick={() => {
                setTrayOpen(false);
                setShowEmojiRow((prev) => !prev);
              }}
            >
              <span className="chat__popup-icon">
                <IonIcon icon={happyOutline} aria-hidden="true" />
              </span>
              <span>
                <strong>{showEmojiRow ? 'Hide emoji' : 'Emoji'}</strong>
                <small>Add a smiley to your message</small>
              </span>
            </button>
          </div>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={pickImage}
        />
        <button
          type="button"
          className={`chat__plus${trayOpen ? ' is-open' : ''}`}
          onClick={() => setTrayOpen((prev) => !prev)}
          aria-label={trayOpen ? 'Close' : 'Add a photo or emoji'}
          aria-expanded={trayOpen}
        >
          <IonIcon icon={addOutline} aria-hidden="true" />
        </button>
        <IonTextarea
          ref={composerRef}
          className="chat__input"
          value={body}
          placeholder="Write a message"
          autoGrow
          rows={1}
          onIonFocus={() => setTrayOpen(false)}
          onIonInput={(e) => setBody(String(e.detail.value ?? ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          className="chat__send"
          onClick={() => void send()}
          disabled={sending || (body.trim() === '' && !pendingImage)}
          aria-label="Send message"
        >
          <IonIcon icon={sendOutline} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
