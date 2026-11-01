import React from 'react';
import { IonContent, IonPage, useIonRouter } from '@ionic/react';
import { useLocation, useParams } from 'react-router-dom';
import ChatPanel from '../components/ChatPanel';
import './ChatThreadPage.css';

/**
 * Full-screen conversation (mobile) and the deep-link target for any thread.
 * `?prefill=` seeds the composer - that is how the default
 * "Is this unit still available?" enquiry reaches the chat.
 */
const ChatThreadPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { search } = useLocation();
  const router = useIonRouter();

  const prefill = new URLSearchParams(search).get('prefill') ?? undefined;

  return (
    <IonPage className="chat-page">
      <IonContent className="chat-page__content">
        <div className="chat-page__inner">
          <ChatPanel
            threadId={id}
            prefill={prefill}
            onBack={() =>
              router.canGoBack() ? router.goBack() : router.push('/messages', 'back', 'replace')
            }
          />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default ChatThreadPage;
