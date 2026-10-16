import React, { useState, useEffect } from 'react';
import { X, Mail, RefreshCw, Key, Clock } from 'lucide-react';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 max-h-[85vh] overflow-y-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg text-slate-100">Local Development Inbox</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchInbox}
              disabled={isLoading}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Refresh messages"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          All system dispatches, password reset tokens, and notifications are securely held locally without requiring any external paid email service.
        </p>

        {messages.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Inbox is currently empty.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-emerald-300">{msg.subject}</span>
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                  </span>
                </div>
                <div className="text-slate-400">
                  To: <strong className="text-slate-300">{msg.recipient_email}</strong>
                </div>
                <p className="text-slate-200 whitespace-pre-wrap bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                  {msg.body}
                </p>
                {msg.token && (
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px]">
                    <Key className="w-3 h-3" />
                    <span>Token: {msg.token}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
