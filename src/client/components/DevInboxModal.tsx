import React, { useState, useEffect } from 'react';
import { AccessibleModal } from './AccessibleModal.js';
import { Mail, RefreshCw, Key, Clock } from 'lucide-react';

interface DevInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevInboxModal: React.FC<DevInboxModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInbox = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/dev/inbox');
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInbox();
    }
  }, [isOpen]);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Development Mailbox"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <p>Local mailbox capturing system notices and tokens.</p>
          <button
            onClick={fetchInbox}
            disabled={isLoading}
            className="p-1 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {messages.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-xs">
            Inbox is empty.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="p-3 rounded-xl bg-stone-50/70 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800/80 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-900 dark:text-stone-100">{msg.subject}</span>
                  <span className="text-[10px] text-stone-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                  </span>
                </div>
                <div className="text-[11px] text-stone-500">
                  To: <strong className="text-stone-700 dark:text-stone-300">{msg.recipient_email}</strong>
                </div>
                <p className="text-stone-700 dark:text-stone-300 whitespace-pre-wrap bg-white dark:bg-stone-950 p-2 rounded-lg border border-stone-200/60 dark:border-stone-800/60 text-[11px] font-mono">
                  {msg.body}
                </p>
                {msg.token && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 font-mono text-[10px]">
                    <Key className="w-3 h-3" />
                    <span>Token: {msg.token}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
};
